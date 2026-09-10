import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

// Independent browser, actual camera HUD input and actual GPU mesh projection.
// Runtime hooks are observations only; user actions drive every state change.
const project=fileURLToPath(new URL('..',import.meta.url));
const output=path.join(project,'output','camera');await fs.mkdir(output,{recursive:true});
const report={url:process.env.ROCK_LAB_URL||'http://127.0.0.1:5227/',checks:{},captures:[],errors:[],warnings:[]};
const sources=['index.html','src/main.js','src/camera-rig.js','src/camera-hud.js','src/camera-hud.css','src/scene-editor.js','src/path-editor.js','src/tooltips.js'];
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async file=>[file,createHash('sha256').update(await fs.readFile(path.join(project,file))).digest('hex')])));
report.sourceHashes=await hashes();
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1,hasTouch:true,acceptDownloads:true});
page.setDefaultTimeout(45000);
page.on('pageerror',error=>report.errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());if(message.type()==='warning')report.warnings.push(message.text());});
const advance=(ms=350)=>page.evaluate(ms=>window.advanceTime(ms),ms);
const distance=(a,b)=>Math.hypot(...a.map((value,index)=>value-b[index]));
const almost=(a,b,label,tolerance=1e-5)=>assert.ok(Math.abs(a-b)<=tolerance,`${label}: ${a} versus ${b}`);
const vectors=(a,b,label,tolerance=1e-5)=>{assert.equal(a.length,b.length);a.forEach((value,index)=>almost(value,b[index],`${label} ${index}`,tolerance));};

function browserSnapshot(){
  const lab=window.rockLab,camera=lab.camera,meshes=[];
  function hash(array){let value=2166136261;for(const byte of new Uint8Array(array.buffer,array.byteOffset,array.byteLength))value=Math.imul(value^byte,16777619);return value>>>0;}
  lab.scene.traverse(root=>{if(root.userData.generated&&root.userData.options)root.traverse(mesh=>{if(mesh.isMesh)meshes.push({uuid:mesh.uuid,geometry:mesh.geometry.uuid,hash:hash(mesh.geometry.attributes.position.array)});});});
  camera.updateMatrixWorld();
  const center=lab.controls.target.clone(),right=center.clone().set(1,0,0).applyQuaternion(camera.quaternion),up=center.clone().set(0,1,0).applyQuaternion(camera.quaternion);
  const project=point=>point.project(camera).toArray();
  const left=project(center.clone().addScaledVector(right,-.5)),rightPoint=project(center.clone().addScaledVector(right,.5));
  const bottom=project(center.clone().addScaledVector(up,-.5)),top=project(center.clone().addScaledVector(up,.5));
  return{
    rig:lab.cameraRig.getState(),type:camera.type,position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),up:camera.up.toArray(),target:lab.controls.target.toArray(),direction:camera.position.clone().sub(lab.controls.target).normalize().toArray(),
    focalLength:camera.isPerspectiveCamera?camera.getFocalLength():lab.cameraRig.getState().focalLength,fov:camera.fov??null,zoom:camera.zoom,fog:[lab.scene.fog.near,lab.scene.fog.far],
    targetPlaneWidth:Math.hypot(rightPoint[0]-left[0],rightPoint[1]-left[1]),targetPlaneHeight:Math.hypot(top[0]-bottom[0],top[1]-bottom[1]),
    checked:document.querySelector('#camera-orthographic').checked,dial:{value:+document.querySelector('#camera-focal-length').value,disabled:document.querySelector('#camera-focal-length').disabled},
    meshes,generation:lab.getStats().generationCount,fracture:lab.fracture?.getStats()??{enabled:false},scene:lab.sceneEditor.getSnapshot(),mode:lab.workspaceMode,viewMode:lab.getStats().viewMode,turntable:lab.getStats().turntable,
    bindings:{orbit:lab.controls.object===camera,transform:lab.sceneEditor.getTransformControls().camera===camera},orbitEnabled:lab.controls.enabled,
  };
}
const snapshot=()=>page.evaluate(browserSnapshot);
async function capture(name){await advance(100);const file=path.join(output,`${name}.png`);await page.screenshot({path:file,animations:'disabled'});report.captures.push(file);}
async function view(name){await page.getByRole('button',{name:`${name} view`,exact:true}).click();await advance(500);}
async function projection(ortho){await page.locator('#camera-orthographic').setChecked(ortho);await advance(150);const value=await snapshot();assert.equal(value.rig.projection,ortho?'orthographic':'perspective');assert.equal(value.type,ortho?'OrthographicCamera':'PerspectiveCamera');assert.equal(value.checked,ortho);assert.equal(value.dial.disabled,ortho);assert.ok(value.bindings.orbit&&value.bindings.transform,'Every camera consumer uses the active projection');return value;}
async function focal(value){const dial=page.locator('#camera-focal-length');assert.equal(await dial.isDisabled(),false);await dial.focus();await dial.press('Home');for(let index=18;index<value;index++)await page.keyboard.press('ArrowRight');await advance(150);almost((await snapshot()).focalLength,value,'Real keyboard focal length');}
async function shape(id){await page.locator('#tab-shape').click();await page.locator('[data-family="all"]').click();await page.locator('#shape-search').fill('');await page.locator(`#shapes [data-shape="${id}"]`).click();await page.waitForFunction(id=>window.rockLab.state.shape===id,id);await advance(300);}
async function numeric(id,value){await page.locator(`#${id}`).fill(String(value));await page.locator(`#${id}`).press('Enter');await advance(100);}
async function viewAction(name){await page.locator('#menu-view').click();await page.locator(`[data-menu-action="${name}"]`).click();await advance(400);}
function cameraOnly(before,after,label){assert.deepEqual(after.meshes,before.meshes,`${label}: source GPU geometry remains identical`);assert.equal(after.generation,before.generation,`${label}: camera does not regenerate the object`);assert.equal(after.fracture.generation,before.fracture.generation,`${label}: camera HUD does not fracture`);assert.deepEqual(after.scene.objects,before.scene.objects,`${label}: scene records stay unchanged`);assert.equal(after.scene.selectedId,before.scene.selectedId,`${label}: scene selection stays unchanged`);assert.deepEqual(after.scene.history,before.scene.history,`${label}: camera review is not a scene edit`);}
function cameraRestored(actual,expected,label){assert.equal(actual.rig.projection,expected.rig.projection,`${label} projection`);almost(actual.rig.focalLength,expected.rig.focalLength,`${label} lens`);vectors(actual.position,expected.position,`${label} position`,.001);vectors(actual.target,expected.target,`${label} target`,.001);vectors(actual.quaternion,expected.quaternion,`${label} orientation`,.001);almost(actual.targetPlaneHeight,expected.targetPlaneHeight,`${label} frame scale`,.001);}

async function actualFit(label,{selection=false}={}){
  const fit=await page.evaluate(selection=>{
    const lab=window.rockLab,roots=[],min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];let vertices=0;
    if(lab.workspaceMode==='scene')for(const node of lab.sceneEditor.getRoot().children){if(selection&&node.userData.sceneInstanceId!==lab.sceneEditor.getSnapshot().selectedId)continue;roots.push(node.children.find(child=>child.userData.sceneContent));}
    else lab.scene.traverseVisible(node=>{if(node.userData.generated&&node.userData.options)roots.push(node);});
    for(const root of roots){root.updateWorldMatrix(true,true);root.traverseVisible(mesh=>{if(!mesh.isMesh)return;const point=mesh.position.clone(),attribute=mesh.geometry.attributes.position;for(let index=0;index<attribute.count;index++){point.fromBufferAttribute(attribute,index).applyMatrix4(mesh.matrixWorld).project(lab.camera);[point.x,point.y,point.z].forEach((value,axis)=>{min[axis]=Math.min(min[axis],value);max[axis]=Math.max(max[axis],value);});vertices++;}});}
    return{min,max,vertices,widthFraction:(max[0]-min[0])/2,heightFraction:(max[1]-min[1])/2};
  },selection);
  assert.ok(fit.vertices>0&&[...fit.min,...fit.max].every(Number.isFinite),`${label} finite actual geometry`);
  assert.ok(fit.min.slice(0,2).every(value=>value>-.995)&&fit.max.slice(0,2).every(value=>value<.995)&&fit.min[2]>-1&&fit.max[2]<1,`${label} fits all vertices: ${JSON.stringify(fit)}`);
  assert.ok(Math.max(fit.widthFraction,fit.heightFraction)>.25,`${label} is visibly framed`);return fit;
}

async function clickObject(id){
  const point=await page.evaluate(id=>{
    const lab=window.rockLab,node=lab.sceneEditor.getRoot().children.find(node=>node.userData.sceneInstanceId===id),meshes=[];
    node.traverse(mesh=>{if(mesh.isMesh&&!mesh.userData.sceneCollider){mesh.geometry.computeBoundingSphere();meshes.push(mesh);}});meshes.sort((a,b)=>b.geometry.boundingSphere.radius-a.geometry.boundingSphere.radius);
    const mesh=meshes[0];mesh.updateWorldMatrix(true,false);const p=mesh.geometry.boundingSphere.center.clone().applyMatrix4(mesh.matrixWorld).project(lab.camera),rect=lab.renderer.domElement.getBoundingClientRect();return{x:rect.x+(p.x+1)*rect.width/2,y:rect.y+(1-p.y)*rect.height/2};
  },id);
  await page.mouse.click(point.x,point.y);await advance(100);assert.equal((await snapshot()).scene.selectedId,id,'Actual canvas raycast selects the intended object');return point;
}
async function dragGizmo(){
  const point=await page.evaluate(()=>{
    const lab=window.rockLab,control=lab.sceneEditor.getTransformControls(),helper=control.getHelper();helper.updateWorldMatrix(true,true);let group;
    helper.traverse(node=>{if(node.isTransformControlsGizmo)group=node.gizmo.translate;});
    const meshes=group.children.filter(node=>node.isMesh&&node.name==='X'&&node.visible);meshes.forEach(mesh=>mesh.geometry.computeBoundingSphere());const mesh=meshes.find(mesh=>mesh.geometry.boundingSphere.center.x>.1);if(!mesh)throw new Error('No visible positive X arrow');
    const rect=lab.renderer.domElement.getBoundingClientRect(),project=p=>{p.project(lab.camera);return{x:rect.x+(p.x+1)*rect.width/2,y:rect.y+(1-p.y)*rect.height/2};};const end=project(mesh.geometry.boundingSphere.center.clone().applyMatrix4(mesh.matrixWorld)),origin=project(control.object.getWorldPosition(mesh.position.clone()));return{...end,dx:end.x-origin.x,dy:end.y-origin.y};
  });
  const before=await snapshot(),length=Math.hypot(point.dx,point.dy);await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+point.dx/length*70,point.y+point.dy/length*70,{steps:14});const during=await snapshot();await page.mouse.up();await advance(150);const after=await snapshot();
  assert.equal(during.scene.dragging,true,'Pointer engages native TransformControls');assert.equal(during.orbitEnabled,false);assert.equal(after.orbitEnabled,true);assert.equal(after.scene.dragging,false);
  assert.ok(Math.abs(after.scene.selection.position[0]-before.scene.selection.position[0])>.05,'X arrow moves selected object');vectors(after.position,before.position,'Gizmo keeps camera fixed');vectors(after.target,before.target,'Gizmo keeps camera target fixed');assert.equal(after.scene.history.undoCount,before.scene.history.undoCount+1,'A transform is one undo entry');
  await page.locator('#tab-scene').click();await page.locator('#scene-undo').click();await advance(150);const undone=await snapshot();assert.deepEqual(undone.scene.objects,before.scene.objects,'Undo restores the actual transformed scene');
  return{point,before:before.scene.selection.position,after:after.scene.selection.position,undoRestored:true};
}

async function layout(label){
  const data=await page.evaluate(()=>{
    const rect=selector=>{const node=document.querySelector(selector);if(!node||!node.checkVisibility())return null;return node.getBoundingClientRect().toJSON();};
    return{width:innerWidth,scrollWidth:document.documentElement.scrollWidth,stage:rect('#stage'),hud:rect('#camera-hud'),toolbar:rect('#scene-toolbar'),assetLabel:rect('.asset-label'),stats:rect('.stats'),viewControls:rect('.view-controls'),frame:rect('#frame'),buttons:[...document.querySelectorAll('#camera-hud button')].map(node=>({name:node.getAttribute('aria-label'),rect:node.getBoundingClientRect().toJSON()}))};
  });
  assert.ok(data.scrollWidth<=data.width+1,`${label} no document overflow`);assert.ok(data.hud.left>=data.stage.left-1&&data.hud.right<=data.stage.right+1&&data.hud.top>=data.stage.top-1&&data.hud.bottom<=data.stage.bottom+1,`${label} camera HUD stays within viewport`);
  const overlap=(a,b)=>a&&b&&Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
  for(const key of['toolbar','assetLabel','stats','viewControls','frame'])assert.ok(!overlap(data.hud,data[key]),`${label} camera HUD does not cover ${key}`);
  for(const button of data.buttons){assert.ok(button.rect.left>=data.hud.left-1&&button.rect.right<=data.hud.right+1&&button.rect.top>=data.hud.top-1&&button.rect.bottom<=data.hud.bottom+1,`${label} ${button.name} is inside HUD`);assert.ok(button.rect.width>=29&&button.rect.height>=29,`${label} ${button.name} is a usable target`);}
  return data;
}

try{
  await page.goto(report.url);await page.waitForFunction(()=>window.rockLab?.ready&&window.rockLab.cameraRig);
  await page.locator('#sound-toggle').click();await page.locator('#tab-fracture').click();await page.locator('#fr-pause').click();await page.waitForFunction(()=>window.rockLab.fracture?.getStats().paused);
  const initial=await snapshot();assert.equal(initial.rig.projection,'orthographic');assert.equal(initial.rig.focalLength,50);assert.equal(initial.dial.value,50);assert.equal(initial.dial.disabled,true);assert.ok(initial.fracture.enabled);
  report.checks.defaults={projection:initial.rig.projection,focalLength:50,fractureEnabled:true};
  const directions={Top:[0,1,0],Left:[-1,0,0],Right:[1,0,0],Front:[0,0,1],Back:[0,0,-1],Iso:Array(3).fill(1/Math.sqrt(3))};
  report.checks.views=[];
  for(const[name,expected]of Object.entries(directions)){
    const before=await snapshot();await view(name);const after=await snapshot();vectors(after.direction,expected,`${name} direction`,.00001);cameraOnly(before,after,`${name} button`);assert.equal(await page.locator('#camera-hud button[aria-pressed="true"]').count(),1,`${name} has exactly one active button`);assert.equal(await page.getByRole('button',{name:`${name} view`,exact:true}).getAttribute('aria-pressed'),'true');
    await advance(1200);const settled=await snapshot();vectors(settled.quaternion,after.quaternion,`${name} remains stable`,.00001);vectors(settled.position,after.position,`${name} position remains stable`,.00001);report.checks.views.push({name,direction:settled.direction,view:settled.rig.view});await capture(`view-${name.toLowerCase()}`);
  }
  await viewAction('turntable');const turningBefore=await snapshot();assert.equal(turningBefore.turntable,true);await advance(500);const turningAfter=await snapshot();assert.ok(distance(turningAfter.position,turningBefore.position)>.05,'Fracture turntable actively orbits');await view('Top');const stopped=await snapshot();assert.equal(stopped.turntable,false,'Choosing a fixed view stops the turntable');assert.equal(await page.locator('#rotate').isChecked(),false,'Turntable checkbox agrees');await advance(1000);vectors((await snapshot()).position,stopped.position,'Fixed view remains stable after turntable');report.checks.viewStopsTurntable={cameraMoved:true,topStoppedTurntable:true,checkboxSynced:true};await view('Iso');
  report.checks.desktopLayout=await layout('Desktop Object');
  const beforePerspective=await snapshot(),perspective=await projection(false);cameraOnly(beforePerspective,perspective,'Switch to perspective');vectors(perspective.target,beforePerspective.target,'Projection target');vectors(perspective.quaternion,beforePerspective.quaternion,'Projection orientation');almost(perspective.targetPlaneWidth,beforePerspective.targetPlaneWidth,'Target plane width preserved');almost(perspective.targetPlaneHeight,beforePerspective.targetPlaneHeight,'Target plane height preserved');
  const lensBefore=await snapshot();await focal(85);const lensAfter=await snapshot();assert.ok(lensAfter.fov<lensBefore.fov,'Longer focal length narrows the rendered FOV');assert.ok(lensAfter.targetPlaneWidth>lensBefore.targetPlaneWidth,'Longer focal length changes actual projection magnification');cameraOnly(lensBefore,lensAfter,'Lens keyboard');vectors(lensAfter.position,lensBefore.position,'Focal length keeps camera position');
  await page.locator('#camera-focal-length').press('End');almost((await snapshot()).focalLength,135,'Native End maximum');await page.locator('#camera-focal-length').press('ArrowRight');almost((await snapshot()).focalLength,135,'Clamped maximum');await page.locator('#camera-focal-length').press('Home');almost((await snapshot()).focalLength,18,'Native Home minimum');await page.locator('#camera-focal-length').press('ArrowLeft');almost((await snapshot()).focalLength,18,'Clamped minimum');await focal(60);
  report.checks.lensKeyboard={from:lensBefore.focalLength,to:lensAfter.focalLength,fovBefore:lensBefore.fov,fovAfter:lensAfter.fov,min:18,max:135,geometryUnchanged:true};
  // The radial gesture uses the visible dial surface, while the associated
  // native range remains the accessible keyboard representation.
  const dial=page.locator('#camera-focal-length'),dialRect=await dial.boundingBox(),dragBefore=await snapshot(),cx=dialRect.x+dialRect.width/2,cy=dialRect.y+dialRect.height/2;
  await page.mouse.move(cx,cy);await page.mouse.down();await page.mouse.move(cx,cy-25,{steps:10});await page.mouse.up();almost((await snapshot()).focalLength,dragBefore.focalLength,'Center dead zone does not jump to a different lens');
  const radius=dialRect.width*.36,startAngle=-135+(dragBefore.focalLength-18)/117*270,pointAt=angle=>({x:cx+Math.sin(angle*Math.PI/180)*radius,y:cy-Math.cos(angle*Math.PI/180)*radius});
  const start=pointAt(startAngle);await page.mouse.move(start.x,start.y);await page.mouse.down();for(let step=1;step<=12;step++){const p=pointAt(startAngle+(45-startAngle)*step/12);await page.mouse.move(p.x,p.y);}await page.mouse.up();await advance(150);const dragAfter=await snapshot();almost(dragAfter.focalLength,96,'Clockwise arc maps to its actual radial lens value',1);cameraOnly(dragBefore,dragAfter,'Lens pointer');vectors(dragAfter.position,dragBefore.position,'Dial drag does not orbit');report.checks.lensPointer={before:dragBefore.focalLength,after:dragAfter.focalLength,clockwiseArc:true,centerDeadZoneStable:true};
  const ortho=await projection(true);almost(ortho.targetPlaneWidth,dragAfter.targetPlaneWidth,'Perspective to ortho plane scale');const orthoBefore=await snapshot();await page.mouse.click(dialRect.x+dialRect.width/2,dialRect.y+dialRect.height/2);await advance(200);const orthoAfter=await snapshot();cameraOnly(orthoBefore,orthoAfter,'Disabled dial');almost(orthoAfter.rig.focalLength,orthoBefore.rig.focalLength,'Disabled dial retains lens');const roundtrip=await projection(false);almost(roundtrip.focalLength,orthoBefore.rig.focalLength,'Perspective restores retained lens');almost(roundtrip.targetPlaneWidth,ortho.targetPlaneWidth,'Projection roundtrip plane scale');report.checks.projectionRoundtrip={preservesPlaneScale:true,preservesTarget:true,preservesOrientation:true,retainsLens:true};
  await focal(72);await view('Iso');const objectDraft=await snapshot();
  await page.locator('#mode-scene').click();await page.locator('#tab-scene').click();await advance(300);const first=(await snapshot()).scene.selectedId;
  await shape('smallBlock');await page.locator('#tab-scene').click();await numeric('scene-position-x',4);const second=(await snapshot()).scene.selectedId;assert.notEqual(first,second);await page.locator('#scene-snap').uncheck();report.checks.sceneProjection=[];
  for(const isOrtho of[true,false]){
    await projection(isOrtho);await view('Iso');await page.locator('#scene-frame-all').click();await advance(300);const framed=await actualFit(`${isOrtho?'Orthographic':'Perspective'} scene frame all`);await page.locator('[data-scene-tool="select"]').click();await clickObject(first);await clickObject(second);await clickObject(first);
    const beforeHud=await snapshot();await view('Top');await view('Iso');const afterHud=await snapshot();cameraOnly(beforeHud,afterHud,'Scene view HUD');
    await page.locator('[data-scene-tool="translate"]').click();await page.locator('#scene-frame').click();await advance(300);const selectedFit=await actualFit('Frame selected',{selection:true}),gizmo=await dragGizmo();report.checks.sceneProjection.push({projection:isOrtho?'orthographic':'perspective',framed,selectedFit,gizmo,canvasSelection:true});await capture(`scene-${isOrtho?'orthographic':'perspective'}`);
  }
  await projection(false);await focal(91);await projection(true);await view('Back');await page.locator('#scene-frame-all').click();await advance(300);const sceneDraft=await snapshot();
  await page.locator('#mode-object').click();await advance(200);cameraRestored(await snapshot(),objectDraft,'Object draft');await page.locator('#mode-scene').click();await advance(200);cameraRestored(await snapshot(),sceneDraft,'Scene draft');report.checks.independentCameraDrafts={object:{projection:objectDraft.rig.projection,lens:objectDraft.rig.focalLength},scene:{projection:sceneDraft.rig.projection,lens:sceneDraft.rig.focalLength},poseAndScaleRestored:true};
  report.checks.sceneDesktopLayout=await layout('Desktop Scene');
  await page.locator('#mode-object').click();await page.locator('#tab-fracture').click();await page.locator('#fr-enabled').uncheck();await page.waitForFunction(()=>!window.rockLab.fracture?.getStats().enabled);
  // Choose a long lens, restore a full orthographic frame, then return to that
  // lens. Matching the frame requires a real dolly away from the object. A seed
  // regeneration must not reset fog to the old, closer orthographic defaults.
  await shape('wornPlank');await projection(false);await focal(135);await projection(true);await viewAction('frame');const shortCamera=await snapshot();await projection(false);const longCamera=await snapshot();assert.ok(longCamera.rig.distance>shortCamera.rig.distance+1,'135 mm framing requires a farther camera');
  await page.locator('#tab-shape').click();await page.locator('#seed').fill('90317');await page.locator('#seed').press('Tab');await page.waitForFunction(()=>window.rockLab.state.seed===90317);await advance(250);const regenerated=await snapshot();vectors(regenerated.position,longCamera.position,'New seed preserves long-lens camera');vectors(regenerated.fog,longCamera.fog,'New seed preserves long-lens fog');assert.ok(regenerated.fog.every(Number.isFinite)&&regenerated.fog[1]>regenerated.fog[0]&&regenerated.rig.distance<regenerated.fog[1],'Target stays within finite fog range');assert.ok(regenerated.generation>longCamera.generation,'Real new seed regenerates the mesh');
  await viewAction('frame');const frameOnce=await snapshot();await viewAction('frame');const frameTwice=await snapshot();vectors(frameTwice.position,frameOnce.position,'Repeated Frame has a stable dolly');vectors(frameTwice.fog,frameOnce.fog,'Repeated Frame does not accumulate fog offsets');report.checks.longLensRegeneration={orthographicDistance:shortCamera.rig.distance,perspectiveDistance:longCamera.rig.distance,fogBefore:longCamera.fog,fogAfter:regenerated.fog,seed:90317,repeatedFrameStable:true};
  report.checks.framing=[];
  for(const isOrtho of[true,false]){
    await projection(isOrtho);if(!isOrtho)await focal(50);await shape('wornPlank');await viewAction('frame');report.checks.framing.push({mode:'object',projection:isOrtho?'orthographic':'perspective',fit:await actualFit('Object framing')});
    await viewAction('lineup');assert.equal((await snapshot()).viewMode,'lineup');report.checks.framing.push({mode:'variations',projection:isOrtho?'orthographic':'perspective',fit:await actualFit('Variations framing')});await capture(`variations-${isOrtho?'orthographic':'perspective'}`);await viewAction('single');
    await shape('plankPath');await viewAction('frame');report.checks.framing.push({mode:'path',projection:isOrtho?'orthographic':'perspective',fit:await actualFit('Path framing')});await capture(`path-${isOrtho?'orthographic':'perspective'}`);
  }
  await page.locator('#menu-file').click();const downloadEvent=page.waitForEvent('download');await page.locator('#export-png').click();const download=await downloadEvent,filename=path.join(output,'perspective-camera-export.png');await download.saveAs(filename);assert.equal(await download.failure(),null);const png=await fs.readFile(filename);assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.ok(png.length>10000);report.checks.png={bytes:png.length,width:png.readUInt32BE(16),height:png.readUInt32BE(20),filename};
  const help=await page.evaluate(()=>({labels:['camera-orthographic','camera-focal-length'].map(id=>{const input=document.getElementById(id),label=document.querySelector(`label[for="${id}"]`);return{id,associated:!!label,help:!!label?.querySelector('.parameter-help-label')||label?.matches('.parameter-help-label'),described:!!input.getAttribute('aria-describedby')};}),buttonTooltips:document.querySelectorAll('#camera-hud button[title],#camera-hud button.parameter-help-label,#camera-hud button .parameter-help-label').length}));assert.ok(help.labels.every(label=>label.associated&&label.help&&label.described));assert.equal(help.buttonTooltips,0);report.checks.parameterHelp=help;
  const focalHelp=page.locator('label[for="camera-focal-length"] .parameter-help-label,label[for="camera-focal-length"].parameter-help-label').first();await focalHelp.hover();await page.waitForFunction(()=>[...document.querySelectorAll('.parameter-tooltip')].some(node=>!node.hidden));await capture('camera-lens-help');await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});await page.locator('#camera-hud').scrollIntoViewIfNeeded();await advance(500);report.checks.narrowObjectLayout=await layout('Narrow Object');await page.getByRole('button',{name:'Top view',exact:true}).tap();vectors((await snapshot()).direction,[0,1,0],'Touch Top',.00001);await page.locator('#camera-orthographic').tap();assert.equal((await snapshot()).rig.projection,'orthographic');await page.locator('#camera-orthographic').tap();assert.equal((await snapshot()).rig.projection,'perspective');await focalHelp.tap();await page.waitForFunction(()=>[...document.querySelectorAll('.parameter-tooltip')].some(node=>!node.hidden));await capture('camera-narrow-object-help');await page.keyboard.press('Escape');await page.getByRole('button',{name:'Iso view',exact:true}).tap();await capture('camera-narrow-object');
  await page.locator('#mode-scene').tap();await page.locator('#camera-hud').scrollIntoViewIfNeeded();await advance(500);report.checks.narrowSceneLayout=await layout('Narrow Scene');await page.getByRole('button',{name:'Top view',exact:true}).tap();await page.locator('#scene-frame-all').click();await advance(300);report.checks.narrowSceneFit=await actualFit('Narrow Scene frame all');await capture('camera-narrow-scene');
  await page.setViewportSize({width:940,height:1200});await page.locator('#scene-frame-all').click();await advance(300);report.checks.tallSceneFit=await actualFit('Tall Scene frame all');report.checks.tallSceneLayout=await layout('Tall Scene');await capture('camera-tall-scene');
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.warnings,[]);assert.deepEqual(await hashes(),report.sourceHashes,'One frozen runtime revision covers the complete run');report.passed=true;
  console.log(JSON.stringify({passed:true,checks:Object.keys(report.checks),captures:report.captures.length,output,errors:report.errors,warnings:report.warnings},null,2));
}catch(error){report.passed=false;report.failure=error.stack;await capture('failure').catch(()=>{});throw error;}
finally{await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();}
