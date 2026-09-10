import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

// Seeded scene recipes provide repeatable starting poses. Every measured move
// below uses a real pointer on a rendered native TransformControls arrow.
// This launches an independent browser and never attaches to the user's tabs.
const project=fileURLToPath(new URL('..',import.meta.url));
const output=path.join(project,'output','surface-snap');await fs.mkdir(output,{recursive:true});
const report={url:process.env.ROCK_LAB_URL||'http://127.0.0.1:5227/',checks:{},captures:[],errors:[],warnings:[]};
const sources=['src/main.js','src/scene-editor.js','src/scene-ui.js','src/scene.css','src/tooltips.js','index.html',...(await fs.readdir(path.join(project,'src'))).filter(name=>name.includes('snap')&&name.endsWith('.js')).map(name=>`src/${name}`)];
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async name=>[name,createHash('sha256').update(await fs.readFile(path.join(project,name))).digest('hex')])));
report.sourceHashes=await hashes();
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1,hasTouch:true,acceptDownloads:true});
page.setDefaultTimeout(30000);
page.on('pageerror',error=>report.errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());if(message.type()==='warning')report.warnings.push(message.text());});
const almost=(actual,expected,label,tolerance=1e-5)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${label}: ${actual} versus ${expected}`);
const vectors=(actual,expected,label,tolerance=1e-5)=>actual.forEach((value,index)=>almost(value,expected[index],`${label} ${index}`,tolerance));
const advance=(ms=100)=>page.evaluate(ms=>window.advanceTime(ms),ms);
async function numeric(id,value){await page.locator(`#${id}`).fill(String(value));await page.locator(`#${id}`).press('Enter');await advance(30);}
async function capture(name){await advance();const filename=path.join(output,`${name}.png`);await page.screenshot({path:filename});report.captures.push(filename);}
function browserSnapshot(){
  const lab=window.rockLab,editor=lab.sceneEditor,instances=[];editor.getRoot().updateWorldMatrix(true,true);
  for(const node of editor.getRoot().children){
    const content=node.children.find(child=>child.userData.sceneContent),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],meshes=[];
    content.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const position=mesh.geometry.attributes.position,point=mesh.position.clone();
      for(let index=0;index<position.count;index++){point.fromBufferAttribute(position,index).applyMatrix4(mesh.matrixWorld);for(let axis=0;axis<3;axis++){min[axis]=Math.min(min[axis],point.getComponent(axis));max[axis]=Math.max(max[axis],point.getComponent(axis));}}
      meshes.push({mesh:mesh.uuid,geometry:mesh.geometry.uuid,materials:(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(material=>material.uuid)});
    });
    instances.push({id:node.userData.sceneInstanceId,min,max,meshes});
  }
  const controls=editor.getTransformControls();
  return {scene:editor.getSnapshot(),instances,camera:lab.camera.position.toArray(),target:lab.controls.target.toArray(),orbit:lab.controls.enabled,projection:lab.camera.isOrthographicCamera?'orthographic':'perspective',translationSnap:controls.translationSnap,grid:lab.scene.getObjectByName('Scene editor world-unit grid')?.visible,resources:{...lab.renderer.info.memory,programs:lab.renderer.info.programs.length}};
}
const snapshot=()=>page.evaluate(browserSnapshot);
const selectedBounds=data=>data.instances.find(instance=>instance.id===data.scene.selectedId);

let base;
const warmedAxes=new Set();
const object=(id,shape='smallBlock',pose={})=>({id,name:`QA ${id}`,recipe:{generator:'procedural-rock-lab',version:5,options:{...structuredClone(base.options),shape,surface:'oak',seed:73191,facets:0,roughness:0,bevel:0,displacement:0},innerMaterial:structuredClone(base.innerMaterial),partMaterials:structuredClone(base.partMaterials),fracture:{...base.fracture,enabled:false}},position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],...pose});
async function fixture(objects,{selectedId=objects[0]?.id,settings={}}={}){
  await page.evaluate(({objects,selectedId,settings})=>{
    window.rockLab.sceneEditor.load({version:1,objects,selectedId,settings:{tool:'translate',space:'world',snap:true,snapMode:'surface',snapDistance:.3,translationSnap:.5,rotationSnap:15,scaleSnap:.1,renderMode:'shaded',grid:true,...settings}});
  },{objects,selectedId,settings});
  await page.locator('#tab-scene').click();await page.getByRole('button',{name:'Front view',exact:true}).click();await page.locator('#scene-frame-all').click();await advance(250);return snapshot();
}
async function projection(orthographic){await page.locator('#camera-orthographic').setChecked(orthographic);await advance(150);}

async function drag(axis,worldDistance,label,{undo=true}={}){
  const before=await snapshot();
  const point=await page.evaluate(({axis,worldDistance})=>{
    const lab=window.rockLab,control=lab.sceneEditor.getTransformControls(),helper=control.getHelper();helper.updateWorldMatrix(true,true);let group;
    helper.traverse(node=>{if(node.isTransformControlsGizmo)group=node.gizmo.translate;});
    const index={X:0,Y:1,Z:2}[axis],meshes=group.children.filter(mesh=>mesh.isMesh&&mesh.name===axis&&mesh.visible);
    meshes.forEach(mesh=>mesh.geometry.computeBoundingSphere());const mesh=meshes.find(mesh=>mesh.geometry.boundingSphere.center.getComponent(index)>.1);
    if(!mesh)throw new Error(`No visible positive ${axis} native transform arrow.`);
    const rect=lab.renderer.domElement.getBoundingClientRect(),project=p=>{p.project(lab.camera);return{x:rect.x+(p.x+1)*rect.width/2,y:rect.y+(1-p.y)*rect.height/2};};
    const tipWorld=mesh.geometry.boundingSphere.center.clone().applyMatrix4(mesh.matrixWorld),tip=project(tipWorld.clone()),destination=tipWorld.clone();destination.setComponent(index,destination.getComponent(index)+worldDistance);const end=project(destination);
    return{...tip,end,rect:rect.toJSON()};
  },{axis,worldDistance});
  assert.ok(point.x>point.rect.left&&point.x<point.rect.right&&point.y>point.rect.top&&point.y<point.rect.bottom,`${label}: arrow is within canvas`);
  assert.ok(point.end.x>point.rect.left&&point.end.x<point.rect.right&&point.end.y>point.rect.top&&point.end.y<point.rect.bottom,`${label}: pointer destination is within canvas`);
  await page.mouse.move(point.x,point.y);await page.mouse.down();const start=await snapshot();
  assert.equal(start.scene.dragging,true,`${label}: real pointer engages gizmo`);
  const samples=[];
  for(let step=1;step<=12;step++){
    await page.mouse.move(point.x+(point.end.x-point.x)*step/12,point.y+(point.end.y-point.y)*step/12);
    if(step===1||step===6||step===12)samples.push(await snapshot());
  }
  const during=samples.at(-1);await page.mouse.up();await advance(120);const after=await snapshot();
  assert.equal(during.scene.dragging,true,`${label}: drag remains active`);assert.equal(during.orbit,false,`${label}: orbit disabled during transform`);
  assert.equal(after.scene.dragging,false);assert.equal(after.orbit,true);assert.equal(after.scene.selectedId,before.scene.selectedId);
  vectors(after.camera,before.camera,`${label}: camera fixed`);vectors(after.target,before.target,`${label}: camera target fixed`);
  const moved=Math.hypot(...after.scene.selection.position.map((value,index)=>value-before.scene.selection.position[index]));assert.ok(moved>.015,`${label}: transform actually moves`);
  assert.equal(after.scene.history.undoCount,before.scene.history.undoCount+1,`${label}: one gesture adds one Undo entry`);
  assert.equal(during.scene.history.undoCount,before.scene.history.undoCount,`${label}: gesture stays open until pointerup`);
  for(const instance of before.instances.filter(instance=>instance.id!==before.scene.selectedId))assert.deepEqual(after.instances.find(other=>other.id===instance.id),instance,`${label}: neighbor geometry, materials and pose unchanged`);
  assert.deepEqual(selectedBounds(after).meshes,selectedBounds(before).meshes,`${label}: moving reuses selected GPU meshes and materials`);
  // TransformControls uploads its delta line and endpoint helpers lazily on
  // its first drag. After that initial native upload, memory must stay stable.
  if(warmedAxes.has(axis))assert.deepEqual(after.resources,before.resources,`${label}: moving reuses GPU resources`);
  else{assert.equal(after.resources.textures,before.resources.textures);assert.ok(after.resources.geometries-before.resources.geometries<=4);assert.ok(after.resources.programs-before.resources.programs<=1);warmedAxes.add(axis);report.checks.nativeGizmoWarmup??={};report.checks.nativeGizmoWarmup[axis]={before:before.resources,after:after.resources};}
  if(undo){
    await page.locator('#scene-undo').click();await advance();assert.deepEqual((await snapshot()).scene.objects,before.scene.objects,`${label}: Undo exactly restores poses and recipes`);
    await page.locator('#scene-redo').click();await advance();assert.deepEqual((await snapshot()).scene.objects,after.scene.objects,`${label}: Redo exactly restores snapped poses and recipes`);
  }
  return{axis,worldDistance,before:before.scene.selection.position,after:after.scene.selection.position,boundsBefore:selectedBounds(before),boundsAfter:selectedBounds(after),snapping:samples.map(sample=>sample.scene.snapping??null),cameraFixed:true,oneUndoEntry:true,resources:after.resources,neighborsUnchanged:true};
}

async function download(name){await page.locator('#menu-file').click();const event=page.waitForEvent('download');await page.locator('#save-recipe').click();const result=await event,filename=path.join(output,`${name}.json`);await result.saveAs(filename);assert.equal(await result.failure(),null);return{filename,data:JSON.parse(await fs.readFile(filename,'utf8'))};}
async function importFile(filename){
  await page.evaluate(()=>{window.__surfaceSnapImported=false;const observer=new MutationObserver(()=>{if(document.querySelector('#toast').textContent==='Scene restored'){window.__surfaceSnapImported=true;observer.disconnect();}});observer.observe(document.querySelector('#toast'),{childList:true,characterData:true,subtree:true});});
  await page.locator('#menu-file').click();const event=page.waitForEvent('filechooser');await page.locator('#load-recipe').click();await(await event).setFiles(filename);await page.waitForFunction(()=>window.__surfaceSnapImported);await advance(150);await page.locator('#tab-scene').click();
}

try{
  const url=new URL(report.url);url.searchParams.set('fracture','0');await page.goto(url.href);await page.waitForFunction(()=>window.rockLab?.ready&&window.rockLab.sceneEditor);
  base=await page.evaluate(()=>window.rockLab.recipe());await page.locator('#mode-scene').click();await page.locator('#tab-scene').click();
  let current=await snapshot();assert.equal(current.scene.settings.snapMode,'surface');almost(current.scene.settings.snapDistance,.3,'Default contact distance');assert.equal(await page.locator('#scene-snap-mode').inputValue(),'surface');
  report.checks.defaults={snapMode:'surface',snapDistance:.3};

  report.checks.groundInBothProjections=[];
  for(const isOrtho of[true,false]){
    await projection(isOrtho);
    await fixture([object('tilted-block','smallBlock',{position:[-.437,1.1,.123],rotation:[12,27,8],scale:[1.3,.8,.65]}),object('untouched-neighbor','smallBlock',{position:[2.5,0,0]})]);
    const result=await drag('X',.237,`${isOrtho?'Orthographic':'Perspective'} floor contact`);
    almost(result.boundsAfter.min[1],0,'Rotated and nonuniformly scaled actual mesh rests on floor',2e-4);
    assert.ok(Math.abs(result.after[0]/.5-Math.round(result.after[0]/.5))>.01,'Surface contact does not quantize X to grid');
    report.checks.groundInBothProjections.push({projection:isOrtho?'orthographic':'perspective',...result});await capture(`floor-${isOrtho?'orthographic':'perspective'}`);
  }

  await projection(true);report.checks.supports=[];
  for(const shape of['platform','table']){
    const initial=await fixture([object('moving','smallBlock',{position:[-.25,2.7,0],scale:[.5,.7,.5]}),object('support',shape)]),support=initial.instances.find(instance=>instance.id==='support');
    const result=await drag('X',.23,`${shape} top contact`);almost(result.boundsAfter.min[1],support.max[1],`${shape}: rests on actual top surface`,2e-4);
    report.checks.supports.push({shape,top:support.max[1],...result});await capture(`contact-${shape}`);
  }

  // A raised object beneath the tabletop should hit the actual opening or leg,
  // never the aggregate table bounding box. This checks the geometry model at
  // an empty part of the assembly without inventing a contact from its bounds.
  await fixture([object('under-table','smallBlock',{position:[-.24,.4,0],scale:[.35,.35,.35]}),object('support','table')]);
  const underTable=await drag('Y',.12,'Free space beneath tabletop');almost(underTable.after[1],.52,'Vertical motion through empty table bounds stays free',3e-3);report.checks.openAssembly=underTable;

  const lateralInitial=await fixture([object('moving','smallBlock',{position:[-1.13,0,0]}),object('neighbor','smallBlock',{position:[.137,0,0]})]);
  const lateral=await drag('X',.32,'Adjacent block faces');const neighbor=lateralInitial.instances.find(instance=>instance.id==='neighbor');almost(lateral.boundsAfter.max[0],neighbor.min[0],'Actual side faces abut',2e-4);almost(lateral.boundsAfter.min[1],0,'Side contact remains grounded',2e-4);assert.ok(Math.abs(lateral.after[0]/.5-Math.round(lateral.after[0]/.5))>.01,'Side contact uses actual face location');report.checks.sideContact=lateral;await capture('adjacent-blocks');

  await fixture([object('lift','smallBlock')]);const lift=await drag('Y',.7,'Lift beyond contact distance');almost(lift.after[1],.7,'Vertical lift can leave the ground',3e-3);report.checks.verticalLift=lift;
  await fixture([object('lower','smallBlock',{position:[0,.7,0]})]);const lower=await drag('Y',-.51,'Lower into contact range');almost(lower.boundsAfter.min[1],0,'Vertical near-contact rests on ground',2e-4);report.checks.verticalNearContact=lower;

  await fixture([object('free','smallBlock',{position:[.137,1.23,.29]})]);await page.locator('#scene-snap').uncheck();const free=await drag('X',.237,'Snap disabled');vectors(free.after,[.374,1.23,.29],'Free pointer translation remains exact',3e-3);report.checks.snapOff=free;
  await page.locator('#scene-snap').check();await numeric('scene-position-y',.731);almost((await snapshot()).scene.selection.position[1],.731,'Numeric transform remains exact while contact snap enabled');report.checks.numericEditsRemainExact=true;

  await fixture([object('grid','smallBlock',{position:[.137,.731,.29]})]);await page.locator('#scene-snap-mode').selectOption('grid');await numeric('scene-translation-snap',.25);assert.equal((await snapshot()).translationSnap,.25);const grid=await drag('X',.39,'Explicit grid mode');almost(grid.after[0]/.25,Math.round(grid.after[0]/.25),'Explicit grid increment');almost(grid.after[1],.731,'Grid does not force ground');report.checks.gridMode=grid;
  await page.locator('#scene-grid').uncheck();current=await snapshot();assert.equal(current.grid,false);assert.equal(current.scene.settings.snap,true);assert.equal(current.scene.settings.snapMode,'grid');
  await page.locator('#scene-snap-mode').selectOption('surface');current=await snapshot();assert.equal(current.grid,false);assert.equal(current.translationSnap,null);await page.locator('#scene-grid').check();current=await snapshot();assert.equal(current.grid,true);assert.equal(current.scene.settings.snapMode,'surface');report.checks.gridDisplayIndependent=true;

  await numeric('scene-snap-distance',.47);const exported=await download('surface-snap-recipe');assert.equal(exported.data.scene.settings.snapMode,'surface');almost(exported.data.scene.settings.snapDistance,.47,'Export preserves contact distance');
  await page.locator('#scene-snap-mode').selectOption('grid');await numeric('scene-translation-snap',.75);await importFile(exported.filename);current=await snapshot();assert.equal(current.scene.settings.snapMode,'surface');almost(current.scene.settings.snapDistance,.47,'Native import restores contact distance');assert.deepEqual(current.scene.objects,exported.data.scene.objects.map(object=>({...object,pieces:current.scene.objects.find(other=>other.id===object.id).pieces,triangles:current.scene.objects.find(other=>other.id===object.id).triangles})));
  const legacy=structuredClone(exported.data);delete legacy.scene.settings.snapMode;delete legacy.scene.settings.snapDistance;const legacyFile=path.join(output,'legacy-scene-without-contact-options.json');await fs.writeFile(legacyFile,JSON.stringify(legacy,null,2));await importFile(legacyFile);current=await snapshot();assert.equal(current.scene.settings.snapMode,'surface');almost(current.scene.settings.snapDistance,.3,'Legacy file receives contact default');report.checks.recipeCompatibility={nativeDownloadAndFilePicker:true,saved:{mode:'surface',distance:.47},legacy:{mode:'surface',distance:.3}};

  const help=await page.evaluate(()=>({labels:['scene-snap-mode','scene-snap-distance','scene-snap','scene-grid'].map(id=>{const control=document.getElementById(id),label=document.querySelector(`label[for="${id}"]`);return{id,associated:!!label,help:!!label?.querySelector('.parameter-help-label')||label?.matches('.parameter-help-label'),described:!!control?.getAttribute('aria-describedby')};}),buttonTooltips:document.querySelectorAll('button[title],button.parameter-help-label,button .parameter-help-label').length}));assert.ok(help.labels.every(label=>label.associated&&label.help&&label.described));assert.equal(help.buttonTooltips,0);report.checks.parameterHelp=help;
  const distanceHelp=page.locator('label[for="scene-snap-distance"] .parameter-help-label,label[for="scene-snap-distance"].parameter-help-label').first();await distanceHelp.hover();await page.waitForFunction(()=>[...document.querySelectorAll('.parameter-tooltip')].some(node=>!node.hidden));await capture('surface-snap-desktop-help');await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});await advance(200);await page.locator('#scene-snap-mode').scrollIntoViewIfNeeded();await distanceHelp.tap();await page.waitForFunction(()=>[...document.querySelectorAll('.parameter-tooltip')].some(node=>!node.hidden));
  const layout=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,tooltip:[...document.querySelectorAll('.parameter-tooltip')].find(node=>!node.hidden)?.getBoundingClientRect().toJSON(),controls:['scene-snap-mode','scene-snap-distance'].map(id=>({id,rect:document.getElementById(id).getBoundingClientRect().toJSON()}))}));assert.ok(layout.scrollWidth<=layout.width+1);assert.ok(layout.tooltip.left>=0&&layout.tooltip.right<=layout.width+1);for(const {id,rect}of layout.controls)assert.ok(rect.width>=42&&rect.height>=30,`${id}: usable narrow control`);report.checks.narrowTouchHelp=layout;await capture('surface-snap-narrow-help');await page.keyboard.press('Escape');
  await page.locator('#scene-snap-mode').selectOption('grid');assert.equal(await page.locator('#scene-translation-snap').isVisible(),true);assert.equal(await page.locator('#scene-snap-distance').isVisible(),false);await page.locator('#scene-snap-mode').selectOption('surface');assert.equal(await page.locator('#scene-snap-distance').isVisible(),true);assert.equal(await page.locator('#scene-translation-snap').isVisible(),false);await capture('surface-snap-narrow-controls');report.checks.modeSpecificControls=true;

  assert.deepEqual(report.errors,[]);assert.deepEqual(report.warnings,[]);assert.deepEqual(await hashes(),report.sourceHashes,'One frozen runtime revision covers the complete run');report.passed=true;
  console.log(JSON.stringify({passed:true,checks:Object.keys(report.checks),captures:report.captures.length,output,errors:report.errors,warnings:report.warnings},null,2));
}catch(error){report.passed=false;report.failure=error.stack;await capture('failure').catch(()=>{});throw error;}
finally{await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();}
