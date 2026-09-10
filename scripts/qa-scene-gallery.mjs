import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {SCENE_PRESETS} from '../src/scene-presets.js';
import {shapes} from '../src/catalog.js';

// Separate browser session: real gallery cards, viewport clicks, native gizmo,
// and file picker. The user's running scene is never accessed by this harness.
const project=fileURLToPath(new URL('..',import.meta.url));
const output=path.join(project,'output','scene-gallery');await fs.mkdir(output,{recursive:true});
const presets=Array.isArray(SCENE_PRESETS)?SCENE_PRESETS:Object.values(SCENE_PRESETS);
const report={url:process.env.ROCK_LAB_URL||'http://127.0.0.1:5207/',checks:{},presets:{},errors:[],warnings:[],requestFailures:[]};
const sources=['src/main.js','src/scene-editor.js','src/scene-presets.js','src/scene-gallery.js','src/scene-gallery.css','src/scene.css','index.html'];
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async file=>[file,createHash('sha256').update(await fs.readFile(path.join(project,file))).digest('hex')])));
report.sourceHashes=await hashes();
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1,hasTouch:true,acceptDownloads:true}),page=await context.newPage();
page.setDefaultTimeout(45000);
page.on('pageerror',error=>report.errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());if(message.type()==='warning')report.warnings.push(message.text());});
page.on('requestfailed',request=>report.requestFailures.push({url:request.url(),error:request.failure()?.errorText}));
const advance=(ms=250)=>page.evaluate(ms=>window.advanceTime(ms),ms);
const snapshot=()=>page.evaluate(()=>{
  const lab=window.rockLab,editor=lab.sceneEditor,records=[];
  for(const node of editor.getRoot().children){const meshes=[];node.children.find(child=>child.userData.sceneContent).traverse(mesh=>{if(mesh.isMesh){const materials=(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(material=>({id:material.uuid,type:material.type,wireframe:material.wireframe,uniforms:JSON.parse(JSON.stringify(material.userData.rockUniforms??{}))}));meshes.push({id:mesh.uuid,geometry:mesh.geometry.uuid,vertices:mesh.geometry.attributes.position.count,finite:mesh.geometry.attributes.position.array.every(Number.isFinite),materials});}});records.push({id:node.userData.sceneInstanceId,meshes});}
  return{mode:lab.workspaceMode,recipe:lab.recipe(),scene:editor.getSnapshot(),records,camera:lab.camera.position.toArray(),orbit:lab.controls.enabled,resources:{...lab.renderer.info.memory,programs:lab.renderer.info.programs.length}};
});
const durable=value=>({objects:value.scene.objects,settings:value.scene.settings,selectedId:value.scene.selectedId,environment:value.recipe.scene.environment});
async function numeric(id,value){await page.locator(`#${id}`).fill(String(value));await page.locator(`#${id}`).press('Enter');await advance(30);}
async function gallery(){if(!await page.locator('#scene-gallery-dialog').isVisible())await page.locator('#open-scene-gallery').click();await page.waitForFunction(()=>document.querySelector('#scene-gallery-dialog').open);}
async function choose(id,{touch=false}={}){await gallery();const card=page.locator(`[data-scene-preset="${id}"]`);if(touch)await card.tap();else await card.click();await page.waitForFunction(()=>!document.querySelector('#scene-gallery-dialog').open);await advance(400);assert.equal((await snapshot()).mode,'scene');}
async function capture(name,{canvas=false}={}){await advance();const filename=path.join(output,`${name}.png`);await(canvas?page.locator('#stage canvas'):page).screenshot({path:filename});return filename;}
async function select(id){await page.locator('#tab-scene').click();await page.locator(`[data-scene-object="${id}"]`).click();assert.equal((await snapshot()).scene.selectedId,id);}
async function importFile(filename){
  await page.evaluate(()=>{window.__galleryImportComplete=false;const toast=document.querySelector('#toast'),observer=new MutationObserver(()=>{if(['Scene restored','Asset recipe restored'].includes(toast.textContent)){window.__galleryImportComplete=true;observer.disconnect();}});observer.observe(toast,{childList:true,subtree:true,characterData:true});});
  await page.locator('#menu-file').click();const event=page.waitForEvent('filechooser');await page.locator('#load-recipe').click();await(await event).setFiles(filename);await page.waitForFunction(()=>window.__galleryImportComplete);await advance();
}
async function exportFile(){await page.locator('#menu-file').click();const event=page.waitForEvent('download');await page.locator('#save-recipe').click();const download=await event,filename=path.join(output,'actual-gallery-scene-v6.json');await download.saveAs(filename);assert.equal(await download.failure(),null);return{filename,data:JSON.parse(await fs.readFile(filename,'utf8'))};}
async function fit(){return page.evaluate(()=>{
  const lab=window.rockLab,root=lab.sceneEditor.getRoot(),min=[Infinity,Infinity],max=[-Infinity,-Infinity];let vertices=0;root.updateWorldMatrix(true,true);lab.camera.updateMatrixWorld();
  for(const node of root.children)node.children.find(child=>child.userData.sceneContent).traverse(mesh=>{if(!mesh.isMesh)return;const attribute=mesh.geometry.attributes.position,point=mesh.position.clone();for(let i=0;i<attribute.count;i++){point.fromBufferAttribute(attribute,i).applyMatrix4(mesh.matrixWorld).project(lab.camera);min[0]=Math.min(min[0],point.x);min[1]=Math.min(min[1],point.y);max[0]=Math.max(max[0],point.x);max[1]=Math.max(max[1],point.y);vertices++;}});
  return{min,max,vertices,widthFraction:(max[0]-min[0])/2,heightFraction:(max[1]-min[1])/2};
});}
async function actualPropClick(value){
  await page.locator('[data-scene-tool="select"]').click();
  const props=value.scene.objects.filter(object=>shapes[object.recipe.options.shape]?.kind!=='terrain'&&!object.recipe.options.shape.endsWith('Path'));
  assert.ok(props.length,'Preset includes individually editable props');
  const priority=['vase','jar','goblet','bowl','chair','stool','bench','table','hammer','hatchet','knife','plinth'];
  props.sort((a,b)=>(priority.indexOf(a.recipe.options.shape)+1||100)-(priority.indexOf(b.recipe.options.shape)+1||100));
  const candidates=await page.evaluate(ids=>{
    const lab=window.rockLab,root=lab.sceneEditor.getRoot(),rect=lab.renderer.domElement.getBoundingClientRect(),result=[];root.updateWorldMatrix(true,true);lab.camera.updateMatrixWorld();
    for(const id of ids){const node=root.children.find(node=>node.userData.sceneInstanceId===id);node.children.find(child=>child.userData.sceneContent).traverse(mesh=>{if(!mesh.isMesh)return;mesh.geometry.computeBoundingSphere();const center=mesh.geometry.boundingSphere.center.clone().applyMatrix4(mesh.matrixWorld).project(lab.camera);result.push({id,x:rect.x+(center.x+1)*rect.width/2,y:rect.y+(1-center.y)*rect.height/2});});}
    return result.filter(point=>point.x>rect.x+25&&point.x<rect.right-25&&point.y>rect.y+160&&point.y<rect.bottom-40);
  },props.map(object=>object.id));
  for(const point of candidates.slice(0,30)){
    const different=value.scene.objects.find(object=>object.id!==point.id);await select(different.id);await page.mouse.click(point.x,point.y);const after=await snapshot();
    if(after.scene.selectedId===point.id)return{point,id:point.id,shape:after.scene.selection.recipe.options.shape};
  }
  throw new Error('No tested visible prop center could be selected through the viewport.');
}
async function heldGalleryLoad(preset){
  await gallery();
  const card=await page.locator(`[data-scene-preset="${preset.id}"]`).boundingBox(),close=await page.locator('#close-scene-gallery').boundingBox(),dialog=await page.locator('#scene-gallery-dialog').boundingBox(),before=await snapshot();
  // Hold the real load at its existing animation-frame yield before committing
  // meshes. Preserve cancellation and restore native scheduling in every path.
  await page.evaluate(()=>{
    const request=window.requestAnimationFrame,cancel=window.cancelAnimationFrame,held=new Map();let next=-1;
    window.requestAnimationFrame=callback=>{const id=next--;held.set(id,callback);return id;};
    window.cancelAnimationFrame=id=>{if(!held.delete(id))cancel.call(window,id);};
    window.__releaseGalleryQaFrames=()=>{window.requestAnimationFrame=request;window.cancelAnimationFrame=cancel;for(const callback of held.values())request.call(window,callback);held.clear();delete window.__releaseGalleryQaFrames;};
  });
  let heldState;
  try{
    await page.mouse.click(card.x+card.width/2,card.y+card.height/2);
    heldState=await page.evaluate(()=>({open:document.querySelector('#scene-gallery-dialog').open,busy:window.rockLab.getGalleryState().busy,closeDisabled:document.querySelector('#close-scene-gallery').disabled,openerDisabled:document.querySelector('#open-scene-gallery').disabled,cardsDisabled:[...document.querySelectorAll('[data-scene-preset]')].every(card=>card.disabled)}));
    assert.ok(Object.values(heldState).every(Boolean));
    await page.mouse.click(close.x+close.width/2,close.y+close.height/2);await page.keyboard.press('Escape');await page.mouse.click(Math.max(1,dialog.x-15),Math.max(1,dialog.y-15));
    assert.equal(await page.locator('#scene-gallery-dialog').evaluate(dialog=>dialog.open),true,'Close, Escape, and backdrop cannot dismiss a pending load');
    await page.evaluate(async()=>{
      const transfer=new DataTransfer();transfer.items.add(new File([JSON.stringify({generator:'procedural-rock-lab',version:1,options:{shape:'sphere',surface:'obsidian',seed:987654}})],'dropped-during-load.json',{type:'application/json'}));
      document.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));await new Promise(resolve=>setTimeout(resolve,100));
    });
    assert.match(await page.locator('#toast').textContent(),/wait.*loading/i);const afterDrop=await snapshot();assert.deepEqual(durable(afterDrop),durable(before));assert.deepEqual(afterDrop.records,before.records);assert.equal(afterDrop.mode,before.mode);assert.equal(await page.locator('#scene-gallery-dialog').evaluate(dialog=>dialog.open),true);
  }finally{await page.evaluate(()=>window.__releaseGalleryQaFrames?.());}
  await page.waitForFunction(()=>!document.querySelector('#scene-gallery-dialog').open);await advance(400);const loaded=await snapshot();assert.equal(loaded.scene.instances,preset.objectCount);assert.equal(loaded.mode,'scene');assert.equal(await page.evaluate(()=>window.rockLab.getGalleryState().activeId),preset.id);assert.equal(await page.locator('#open-scene-gallery').isEnabled(),true);
  return{...heldState,closeEscapeBackdropBlocked:true,droppedRecipeRejected:true,previousSceneIntactUntilCommit:true,chosenSceneLoadsAfterRelease:true};
}

async function gizmoDrag(){
  await page.locator('#tab-scene').click();await page.locator('#scene-snap-mode').selectOption('grid');await numeric('scene-translation-snap',.25);await page.locator('#scene-snap').check();await page.locator('[data-scene-tool="translate"]').click();await page.locator('#scene-frame').click();await advance(600);
  const point=await page.evaluate(()=>{const lab=window.rockLab,control=lab.sceneEditor.getTransformControls(),helper=control.getHelper();helper.updateWorldMatrix(true,true);let group;helper.traverse(node=>{if(node.isTransformControlsGizmo)group=node.gizmo.translate;});const meshes=group.children.filter(node=>node.isMesh&&node.name==='X'&&node.visible);meshes.forEach(mesh=>mesh.geometry.computeBoundingSphere());const mesh=meshes.find(mesh=>mesh.geometry.boundingSphere.center.x>.1),rect=lab.renderer.domElement.getBoundingClientRect(),project=point=>{point.project(lab.camera);return{x:rect.x+(point.x+1)*rect.width/2,y:rect.y+(1-point.y)*rect.height/2};};const end=project(mesh.geometry.boundingSphere.center.clone().applyMatrix4(mesh.matrixWorld)),origin=project(control.object.getWorldPosition(mesh.position.clone()));return{...end,dx:end.x-origin.x,dy:end.y-origin.y};});
  const before=await snapshot(),length=Math.hypot(point.dx,point.dy);await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+point.dx/length*90,point.y+point.dy/length*90,{steps:18});const during=await snapshot();await page.mouse.up();await advance();const after=await snapshot();
  assert.equal(during.scene.dragging,true);assert.equal(during.orbit,false);assert.equal(after.orbit,true);assert.ok(Math.hypot(...after.camera.map((value,index)=>value-before.camera[index]))<1e-6,'Camera remains fixed during the native gizmo drag');assert.notEqual(after.scene.selection.position[0],before.scene.selection.position[0]);assert.ok(Math.abs(after.scene.selection.position[0]*4-Math.round(after.scene.selection.position[0]*4))<1e-6);
  for(const object of before.scene.objects)if(object.id!==before.scene.selectedId)assert.deepEqual(after.scene.objects.find(next=>next.id===object.id),object);
  return{before:before.scene.selection.position,after:after.scene.selection.position,otherObjectsUnchanged:true,snapped:true};
}
async function sheet(){
  const tab=await context.newPage();await tab.setViewportSize({width:1600,height:1000});const cards=await Promise.all(presets.map(async preset=>`<figure><img src="data:image/png;base64,${(await fs.readFile(path.join(output,`preset-${preset.id}.png`))).toString('base64')}"><figcaption>${preset.title}</figcaption></figure>`));
  await tab.setContent(`<style>body{margin:0;background:#11191e;color:#e0e8ed;font:16px system-ui}main{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:8px}figure{margin:0;background:#202b32}img{display:block;width:100%;height:280px;object-fit:contain}figcaption{padding:10px 14px}</style><main>${cards.join('')}</main>`);await tab.screenshot({path:path.join(output,'contact-sheet.png'),fullPage:true});await tab.close();
}

try{
  assert.equal(presets.length,8);await page.goto(report.url);await page.waitForFunction(()=>window.rockLab?.ready);const initial=await snapshot();assert.equal(initial.mode,'object');
  await gallery();assert.equal(await page.locator('[data-scene-preset]').count(),8);assert.equal(await page.locator('#restore-previous-scene').isEnabled(),false);
  const images=[];for(const preset of presets){const image=page.locator(`[data-scene-preset="${preset.id}"] img`);await image.scrollIntoViewIfNeeded();await image.evaluate(image=>image.decode());const value=await image.evaluate(image=>({src:image.currentSrc,width:image.naturalWidth,height:image.naturalHeight}));assert.ok(value.width>=320&&value.height>=160);images.push({id:preset.id,...value});}
  await page.locator('#close-scene-gallery').scrollIntoViewIfNeeded();await capture('gallery-desktop');assert.equal(await page.locator('#scene-gallery-dialog button[title],#scene-gallery-dialog button .parameter-help-label').count(),0);await page.keyboard.press('Escape');assert.equal(await page.locator('#scene-gallery-dialog').isVisible(),false);assert.equal(await page.locator('#open-scene-gallery').evaluate(node=>node===document.activeElement),true);assert.deepEqual((await snapshot()).recipe,initial.recipe);report.checks.objectGalleryAndThumbnails={images,objectUnchanged:true};

  // Create a recognizable user scene before browsing presets. Successive choices
  // must keep this one backup until the user explicitly restores it.
  await page.locator('#mode-scene').click();await page.locator('#tab-shape').click();await page.locator('[data-family="all"]').click();await page.locator('#shape-search').fill('');await page.locator('[data-shape="hammer"]').click();await advance();await page.locator('#tab-scene').click();await numeric('scene-name','My workshop arrangement');await numeric('scene-position-x',4.25);await numeric('scene-rotation-y',37);await numeric('scene-scale-y',1.2);const backup=await snapshot();
  report.checks.asyncModalGuard=await heldGalleryLoad(presets[0]);
  const defaults=new Map();
  for(const preset of presets){
    await choose(preset.id);const value=await snapshot(),projected=await fit();assert.ok(value.scene.instances>=3);assert.equal(value.scene.instances,preset.objectCount);assert.ok(value.scene.objects.some(object=>shapes[object.recipe.options.shape]?.kind==='terrain'));assert.ok(value.records.every(record=>record.meshes.length&&record.meshes.every(mesh=>mesh.finite)));
    assert.ok([...projected.min,...projected.max].every(Number.isFinite));assert.ok(projected.min.every(value=>value>-.99)&&projected.max.every(value=>value<.99));assert.ok(Math.max(projected.widthFraction,projected.heightFraction)>.4);
    const owned=value.records.map(record=>new Set(record.meshes.flatMap(mesh=>mesh.materials.map(material=>material.id))));for(let a=0;a<owned.length;a++)for(let b=a+1;b<owned.length;b++)assert.ok([...owned[a]].every(id=>!owned[b].has(id)),'Preset instances own independent materials');
    defaults.set(preset.id,durable(value));const click=await actualPropClick(value);await page.locator('#scene-frame-all').click();await page.locator('[data-scene-tool="select"]').click();const image=await capture(`preset-${preset.id}`,{canvas:true});report.presets[preset.id]={objects:value.scene.instances,pieces:value.scene.pieces,triangles:value.scene.triangles,fit:projected,actualPropClick:click,image};
  }
  await sheet();report.checks.allEightScenes={actualPresetImages:true,terrainAndProps:true,independentMaterials:true,eachHasRealPropClick:true};

  const editableBefore=await snapshot();report.checks.actualSnappedGizmo=await gizmoDrag();const selected=(await snapshot()).scene.selectedId;
  await page.locator('#tab-material').click();if(await page.locator('#material-slot').isVisible())await page.locator('#material-slot').selectOption('primary');await page.locator('#material-outer').click();await page.locator('[data-material-family="rock"]').click();await page.locator('[data-surface="obsidian"]').click();await advance();const materialEdited=await snapshot();assert.equal(materialEdited.scene.selection.recipe.options.surface,'obsidian');
  for(const record of editableBefore.records)if(record.id!==selected)assert.deepEqual(materialEdited.records.find(next=>next.id===record.id),record);report.checks.selectedOnlyMaterial=true;await capture('edited-preset');
  for(const mode of['wireframe','normals','collider','shaded']){await page.locator('#scene-render-mode').selectOption(mode);await advance();assert.equal((await snapshot()).scene.settings.renderMode,mode);}report.checks.renderModes=true;
  await gallery();const modalBefore=await snapshot();await page.locator('#close-scene-gallery').focus();
  for(const key of['q','w','e','r','Delete','Backspace','ControlOrMeta+d'])await page.keyboard.press(key);
  const modalAfter=await snapshot();assert.deepEqual(durable(modalAfter),durable(modalBefore),'Modal shortcuts must not transform or delete the underlying scene');
  let browserChromeStops=0;
  // Native dialog traversal may visit browser chrome between the last and first
  // controls. It must never focus an inert control in the underlying document.
  for(let i=0;i<14;i++){await page.keyboard.press('Tab');const focus=await page.evaluate(()=>({inside:document.querySelector('#scene-gallery-dialog').contains(document.activeElement),browserChrome:document.activeElement===document.body&&!document.hasFocus()}));assert.ok(focus.inside||focus.browserChrome,'Tab never reaches underlying page controls');if(focus.browserChrome)browserChromeStops++;}
  await page.keyboard.press('Escape');assert.equal(await page.locator('#scene-gallery-dialog').isVisible(),false);assert.equal(await page.locator('#open-scene-gallery').evaluate(node=>node===document.activeElement),true);report.checks.modalKeyboardSafety={sceneUnchanged:true,tabCannotReachUnderlyingControls:true,browserChromeStops};

  const exported=await exportFile();assert.equal(exported.data.version,6);assert.equal(exported.data.workspaceMode,'scene');await page.locator('#scene-delete').click();await importFile(exported.filename);assert.deepEqual((await snapshot()).recipe,exported.data);report.checks.nativeSceneFileRoundtrip={filename:exported.filename};
  await choose(presets.at(-1).id);assert.deepEqual((await snapshot()).scene.objects,defaults.get(presets.at(-1).id).objects,'Reopening the edited preset starts from a fresh authored arrangement');report.checks.freshPresetAfterEditing=true;await choose(presets[0].id);
  await gallery();assert.equal(await page.locator('#restore-previous-scene').isEnabled(),true);await page.locator('#restore-previous-scene').click();await page.waitForFunction(()=>!document.querySelector('#scene-gallery-dialog').open);await advance();assert.deepEqual(durable(await snapshot()),durable(backup),'All preset choices preserve the original user arrangement as one backup');await gallery();assert.equal(await page.locator('#restore-previous-scene').isEnabled(),false);await page.keyboard.press('Escape');report.checks.previousSceneRestoration={exactArrangement:true,oneBackupAcrossChoices:true,consumedOnRestore:true};
  await page.locator('#mode-object').click();assert.deepEqual((await snapshot()).recipe.options,initial.recipe.options);assert.deepEqual((await snapshot()).recipe.innerMaterial,initial.recipe.innerMaterial);report.checks.objectDraftPreserved=true;

  // Two identical complete cycles after shader warmup expose retained per-scene
  // geometry/material resources without mistaking a legitimate first compile.
  const resourceCycles=[];
  for(let pass=0;pass<2;pass++){const samples={};for(const preset of presets){await choose(preset.id);await advance(350);samples[preset.id]=(await snapshot()).resources;}resourceCycles.push(samples);}
  assert.deepEqual(resourceCycles[1],resourceCycles[0]);report.checks.presetCycleCleanup={cycles:2,resources:resourceCycles[1]};

  await page.setViewportSize({width:390,height:844});await gallery();const mobile=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,dialog:document.querySelector('#scene-gallery-dialog').getBoundingClientRect().toJSON()}));assert.ok(mobile.scroll<=mobile.width+1);assert.ok(mobile.dialog.left>=0&&mobile.dialog.right<=mobile.width+1);await capture('gallery-mobile');await choose(presets[1].id,{touch:true});assert.equal((await snapshot()).scene.instances,presets[1].objectCount);await page.locator('#open-scene-gallery').scrollIntoViewIfNeeded();await capture('preset-mobile');report.checks.mobile={...mobile,cardTapLoadsScene:true};await page.locator('#mode-object').tap();assert.deepEqual((await snapshot()).recipe.options,initial.recipe.options);assert.deepEqual((await snapshot()).recipe.innerMaterial,initial.recipe.innerMaterial);report.checks.directObjectEntryPreservesDraft=true;

  assert.deepEqual(report.errors,[]);assert.deepEqual(report.warnings,[]);assert.deepEqual(report.requestFailures,[]);assert.deepEqual(await hashes(),report.sourceHashes,'All gallery checks must use one frozen source revision');report.passed=true;console.log(JSON.stringify({passed:true,checks:Object.keys(report.checks),presets:Object.keys(report.presets),output,errors:report.errors},null,2));
}catch(error){report.passed=false;report.failure=error.stack;await capture('failure').catch(()=>{});throw error;}
finally{await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();}
