import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

// Independent Chrome session, real controls, native file picker/download, and
// GPU/geometry observations. Does not attach to the user's browser.
const project=fileURLToPath(new URL('..',import.meta.url));
const output=path.join(project,'output','scene-history');await fs.mkdir(output,{recursive:true});
const report={url:process.env.ROCK_LAB_URL||'http://127.0.0.1:5227/',checks:{},errors:[],warnings:[]};
const sources=['src/main.js','src/scene-editor.js','src/scene-ui.js','src/scene.css','src/tooltips.js','src/ground.js','src/scene-gallery.js','src/material.js','index.html'];
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async name=>[name,createHash('sha256').update(await fs.readFile(path.join(project,name))).digest('hex')])));
report.sourceHashes=await hashes();
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1,hasTouch:true,acceptDownloads:true});
page.setDefaultTimeout(45000);
page.on('pageerror',error=>report.errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());if(message.type()==='warning')report.warnings.push(message.text());});

function browserSnapshot(){
  const lab=window.rockLab,editor=lab.sceneEditor,instances=[];
  function signature(array){let hash=2166136261;const bytes=new Uint8Array(array.buffer,array.byteOffset,array.byteLength);for(const value of bytes)hash=Math.imul(hash^value,16777619);return hash>>>0;}
  for(const node of editor.getRoot().children){
    const meshes=[],content=node.children.find(child=>child.userData.sceneContent);
    content.traverse(mesh=>{if(mesh.isMesh)meshes.push({uuid:mesh.uuid,geometry:mesh.geometry.uuid,hash:signature(mesh.geometry.attributes.position.array),visible:mesh.visible,slot:mesh.userData.materialSlot??'primary',materials:(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(material=>({uuid:material.uuid,type:material.type,wireframe:material.wireframe,metalness:material.metalness,roughness:material.roughness,uniforms:JSON.parse(JSON.stringify(material.userData.rockUniforms??{}))}))});});
    instances.push({id:node.userData.sceneInstanceId,meshes});
  }
  const original=[];lab.scene.traverse(object=>{if(object.userData.generated&&object.userData.options){let ancestor=object,inScene=false,visible=true;while(ancestor){if(ancestor.userData.sceneEditorRoot)inScene=true;if(!ancestor.visible)visible=false;ancestor=ancestor.parent;}if(!inScene){const meshes=[];object.traverse(mesh=>{if(mesh.isMesh)meshes.push(signature(mesh.geometry.attributes.position.array));});original.push({visible,meshes});}}});
  return {mode:lab.workspaceMode,recipe:lab.recipe(),scene:editor.getSnapshot(),instances,original,camera:lab.camera.position.toArray(),target:lab.controls.target.toArray(),orbit:lab.controls.enabled,stats:lab.getStats(),resources:{...lab.renderer.info.memory,programs:lab.renderer.info.programs.length},grid:lab.scene.getObjectByName('Scene editor world-unit grid')?.visible};
}
const snapshot=()=>page.evaluate(browserSnapshot);
const advance=(ms=250)=>page.evaluate(ms=>window.advanceTime(ms),ms);
const distance=(a,b)=>Math.hypot(...a.map((value,index)=>value-b[index]));
const almost=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<1e-5,`${label}: ${actual} ≈ ${expected}`);
const vectors=(actual,expected,label)=>actual.forEach((value,index)=>almost(value,expected[index],`${label} ${index}`));
async function capture(name){await advance();await page.screenshot({path:path.join(output,`${name}.png`)});return page.evaluate(()=>{const canvas=document.createElement('canvas'),source=window.rockLab.renderer.domElement;canvas.width=source.width;canvas.height=source.height;const context=canvas.getContext('2d');context.drawImage(source,0,0);let hash=2166136261;for(const value of context.getImageData(0,0,canvas.width,canvas.height).data)hash=Math.imul(hash^value,16777619);return hash>>>0;});}
async function numeric(id,value){await page.locator(`#${id}`).fill(String(value));await page.locator(`#${id}`).press('Enter');await advance(30);}
async function shape(id){await page.locator('#tab-shape').click();await page.locator('[data-family="all"]').click();await page.locator('#shape-search').fill('');await page.locator(`#shapes [data-shape="${id}"]`).click();await page.waitForFunction(id=>window.rockLab.state.shape===id,id);await advance();}
async function select(id){await page.locator('#tab-scene').click();await page.locator(`[data-scene-object="${id}"]`).click();await page.waitForFunction(id=>window.rockLab.sceneEditor.getSnapshot().selectedId===id,id);}
async function importFile(filename,{invalid=false}={}){
  await page.evaluate(invalid=>{
    window.__sceneQaImportComplete=false;
    const toast=document.querySelector('#toast'),observer=new MutationObserver(()=>{const text=toast.textContent;const complete=invalid?text.startsWith('Could not load recipe:'):['Scene restored','Asset recipe restored'].includes(text);if(complete){window.__sceneQaImportComplete=true;observer.disconnect();}});
    observer.observe(toast,{childList:true,characterData:true,subtree:true});
  },invalid);
  await page.locator('#menu-file').click();const event=page.waitForEvent('filechooser');await page.locator('#load-recipe').click();await(await event).setFiles(filename);
  await page.waitForFunction(()=>window.__sceneQaImportComplete);await advance();
}
async function fixture(name,value){const filename=path.join(output,`${name}.json`);await fs.writeFile(filename,JSON.stringify(value,null,2));return filename;}
async function exportFile(name='actual-scene-v6'){await page.locator('#menu-file').click();const event=page.waitForEvent('download');await page.locator('#save-recipe').click();const download=await event,filename=path.join(output,`${name}.json`);await download.saveAs(filename);assert.equal(await download.failure(),null);return{filename,data:JSON.parse(await fs.readFile(filename,'utf8'))};}

// Project a rendered native TransformControls cone, not a hand-invented click
// point. Dragging it must move the object while OrbitControls stays fixed.
async function dragGizmo(){
  const point=await page.evaluate(()=>{
    const lab=window.rockLab,control=lab.sceneEditor.getTransformControls(),helper=control.getHelper();helper.updateWorldMatrix(true,true);
    let group;helper.traverse(node=>{if(node.isTransformControlsGizmo)group=node.gizmo.translate;});
    const candidates=group.children.filter(node=>node.isMesh&&node.name==='X'&&node.visible);
    candidates.forEach(node=>node.geometry.computeBoundingSphere());
    const mesh=candidates.find(node=>node.geometry.boundingSphere.center.x>.1);
    if(!mesh)throw new Error('No visible positive X transform arrow.');
    const rect=lab.renderer.domElement.getBoundingClientRect(),project=value=>{value.project(lab.camera);return{x:rect.left+(value.x+1)*rect.width/2,y:rect.top+(1-value.y)*rect.height/2};};
    const end=project(mesh.geometry.boundingSphere.center.clone().applyMatrix4(mesh.matrixWorld)),origin=project(control.object.getWorldPosition(mesh.position.clone()));
    return{...end,dx:end.x-origin.x,dy:end.y-origin.y};
  });
  const length=Math.hypot(point.dx,point.dy),before=await snapshot();
  await page.mouse.move(point.x,point.y);await page.mouse.down();
  await page.mouse.move(point.x+point.dx/length*84,point.y+point.dy/length*84,{steps:16});
  const during=await snapshot();await page.mouse.up();await advance(120);const after=await snapshot();
  assert.equal(during.scene.dragging,true,'Pointer must engage the native transform control');assert.equal(during.orbit,false);
  assert.ok(Math.abs(after.scene.selection.position[0]-before.scene.selection.position[0])>.1,'X arrow changes position');
  almost(after.scene.selection.position[0]/after.scene.settings.translationSnap,Math.round(after.scene.selection.position[0]/after.scene.settings.translationSnap),'Gizmo position is snapped');
  vectors(after.scene.selection.position.slice(1),before.scene.selection.position.slice(1),'Other translation axes stay fixed');
  vectors(after.camera,before.camera,'Camera stays fixed during gizmo');assert.equal(after.scene.selectedId,before.scene.selectedId);assert.equal(after.orbit,true);assert.equal(after.scene.dragging,false);
  return {start:point,before:before.scene.selection.position,after:after.scene.selection.position,cameraFixed:true,snapped:true,beforeSnapshot:before,afterSnapshot:after};
}

const history=value=>value.scene.history;
const semantic=value=>({objects:value.scene.objects,selectedId:value.scene.selectedId,instances:value.instances.map(instance=>({id:instance.id,meshes:instance.meshes.map(({uuid,geometry,...mesh})=>({...mesh,materials:mesh.materials.map(({uuid,...material})=>material)}))}))});
const sameScene=(actual,expected,label)=>assert.deepEqual(semantic(actual),semantic(expected),label);
async function undo(){await page.locator('#tab-scene').click();await page.locator('#scene-undo').click();await advance();return snapshot();}
async function redo(){await page.locator('#tab-scene').click();await page.locator('#scene-redo').click();await advance();return snapshot();}
async function roundtripEdit(before,after,label){
  assert.equal(history(after).undoCount,history(before).undoCount+1,`${label} is exactly one edit`);
  sameScene(await undo(),before,`${label} undo restores all objects and actual geometry/material values`);
  sameScene(await redo(),after,`${label} redo restores all objects and actual geometry/material values`);
}
async function dragRange(id,fraction){
  const slider=page.locator(`#${id}`);await slider.scrollIntoViewIfNeeded();
  const info=await slider.evaluate(input=>({value:+input.value,min:+input.min,max:+input.max,rect:input.getBoundingClientRect().toJSON()}));
  const x=t=>info.rect.x+8+t*(info.rect.width-16),y=info.rect.y+info.rect.height/2;
  const start=(info.value-info.min)/(info.max-info.min),before=await snapshot();
  await slider.evaluate(input=>{window.__historyRangeInputs=0;input.addEventListener('input',()=>window.__historyRangeInputs++);});
  await page.mouse.move(x(start),y);await page.mouse.down();
  await page.mouse.move(x(fraction),y,{steps:18});
  const during=await snapshot(),events=await page.evaluate(()=>window.__historyRangeInputs);
  await page.mouse.up();await advance(500);const after=await snapshot();
  assert.ok(events>=3,`${id}: a real drag emits multiple input changes`);
  assert.equal(history(during).undoCount,history(before).undoCount,`${id}: gesture remains open until pointer up`);
  assert.notEqual(after.scene.selection.recipe.options[id],before.scene.selection.recipe.options[id],`${id} changes selected recipe`);
  const selected=before.scene.selectedId;
  for(const instance of before.instances.filter(instance=>instance.id!==selected))assert.deepEqual(after.instances.find(other=>other.id===instance.id),instance,`${id}: other instances retain their GPU objects`);
  await roundtripEdit(before,after,`${id} pointer gesture`);
  return{inputs:events,before:before.scene.selection.recipe.options[id],after:after.scene.selection.recipe.options[id],beforeSnapshot:before,afterSnapshot:after};
}
async function shortcut(key){await page.locator('[data-scene-tool="select"]').focus();await page.keyboard.press(key);await advance();return snapshot();}
const conciseGesture=({beforeSnapshot,afterSnapshot,...data})=>data;

try{
  await page.goto(report.url);await page.waitForFunction(()=>window.rockLab?.ready&&window.rockLab.sceneEditor);
  const objectDraft=(await snapshot()).recipe;
  await page.locator('#mode-scene').click();await page.locator('#tab-scene').click();let before=await snapshot();
  assert.equal(before.scene.instances,1);assert.equal(history(before).undoCount,0);assert.equal(history(before).redoCount,0);
  assert.equal(await page.locator('#scene-undo').isDisabled(),true);assert.equal(await page.locator('#scene-redo').isDisabled(),true);
  report.checks.initialScene={instances:1,undoDisabled:true,redoDisabled:true};

  await shape('hammer');let after=await snapshot();assert.equal(after.scene.instances,2);await roundtripEdit(before,after,'Library add with placement');
  before=await snapshot();await page.locator('#scene-add').click();after=await snapshot();assert.equal(after.scene.instances,3);await roundtripEdit(before,after,'Add current object with placement');
  report.checks.libraryAndAdd={instances:3,oneStepPerAdd:true};

  before=await snapshot();await page.locator('#scene-duplicate').click();after=await snapshot();assert.equal(after.scene.instances,4);await roundtripEdit(before,after,'Duplicate');
  before=await snapshot();await page.locator('#scene-delete').click();after=await snapshot();assert.equal(after.scene.instances,3);assert.equal(after.scene.selectedId,null);await roundtripEdit(before,after,'Delete');
  await select(after.scene.objects.at(-1).id);report.checks.duplicateDelete={exactIdsOrderSelection:true};

  before=await snapshot();await numeric('scene-name','History hammer');after=await snapshot();assert.equal(after.scene.selection.name,'History hammer');await roundtripEdit(before,after,'Rename');
  const numericCases=[];
  for(const[id,value]of[['scene-position-x',1.234],['scene-position-y',.327],['scene-rotation-y',23.75],['scene-scale-z',1.37]]){
    before=await snapshot();await numeric(id,value);after=await snapshot();await roundtripEdit(before,after,id);numericCases.push({id,value});
  }
  report.checks.renameAndNumericTransforms={name:'History hammer',numericCases,exactRestore:true};

  before=await snapshot();await numeric('scene-translation-snap',.5);await page.locator('#scene-snap').check();await page.locator('[data-scene-tool="translate"]').click();await page.locator('#scene-frame').click();await advance(800);
  assert.deepEqual(history(await snapshot()),history(before),'Review settings do not create history');
  const gizmo=await dragGizmo();await roundtripEdit(gizmo.beforeSnapshot,gizmo.afterSnapshot,'Native gizmo drag');
  report.checks.gizmo=conciseGesture(gizmo);await capture('undo-gizmo');

  await page.locator('#tab-shape').click();const geometryGesture=await dragRange('bevel',.87);
  assert.notDeepEqual(geometryGesture.beforeSnapshot.instances.find(instance=>instance.id===geometryGesture.beforeSnapshot.scene.selectedId).meshes.map(mesh=>mesh.hash),geometryGesture.afterSnapshot.instances.find(instance=>instance.id===geometryGesture.afterSnapshot.scene.selectedId).meshes.map(mesh=>mesh.hash),'Geometry slider alters real position buffers');
  report.checks.geometryGesture=conciseGesture(geometryGesture);
  await page.locator('#tab-material').click();await page.locator('#material-slot').selectOption('primary');await page.locator('#material-outer').click();
  const materialGesture=await dragRange('materialRoughness',.91),selected=materialGesture.beforeSnapshot.scene.selectedId;
  const beforeMaterial=materialGesture.beforeSnapshot.instances.find(instance=>instance.id===selected),afterMaterial=materialGesture.afterSnapshot.instances.find(instance=>instance.id===selected);
  assert.deepEqual(beforeMaterial.meshes.map(mesh=>mesh.geometry),afterMaterial.meshes.map(mesh=>mesh.geometry),'Material gesture preserves selected geometry resources');
  assert.notDeepEqual(beforeMaterial.meshes.map(mesh=>mesh.materials),afterMaterial.meshes.map(mesh=>mesh.materials),'Material gesture changes actual material values');
  report.checks.materialGesture=conciseGesture(materialGesture);await capture('undo-material');

  // Native range controls emit change on every repeated keydown. The whole
  // held key must still remain one transaction until its matching keyup.
  await page.locator('#tab-shape').click();await page.locator('#bevel').focus();before=await snapshot();
  for(let i=0;i<7;i++)await page.keyboard.down('ArrowLeft');
  const held=await snapshot();assert.equal(history(held).undoCount,history(before).undoCount,'Held range key stays uncommitted through native change events');
  await page.keyboard.up('ArrowLeft');await advance(400);after=await snapshot();assert.ok(after.scene.selection.recipe.options.bevel<before.scene.selection.recipe.options.bevel);await roundtripEdit(before,after,'Held range key');
  report.checks.keyboardRangeGesture={repeatedKeydowns:7,before:before.scene.selection.recipe.options.bevel,after:after.scene.selection.recipe.options.bevel};

  // A new branch must invalidate the old redo action immediately.
  await undo();before=await snapshot();assert.equal(history(before).canRedo,true);await numeric('scene-name','Branched hammer');after=await snapshot();
  assert.equal(history(after).canRedo,false);assert.equal(await page.locator('#scene-redo').isDisabled(),true);report.checks.branchInvalidation=true;

  before=await snapshot();await numeric('scene-position-z',-1.625);after=await snapshot();
  sameScene(await shortcut('Control+z'),before,'Control Z');sameScene(await shortcut('Control+Shift+z'),after,'Control Shift Z');
  sameScene(await shortcut('Meta+z'),before,'Command Z');sameScene(await shortcut('Control+y'),after,'Control Y');
  const formGuard=await snapshot();await page.locator('#scene-name').focus();await page.keyboard.press('Control+z');await page.keyboard.press('Meta+z');
  assert.deepEqual((await snapshot()).scene.objects,formGuard.scene.objects);assert.deepEqual(history(await snapshot()),history(formGuard));await page.keyboard.press('Escape');
  await page.locator('#scene-position-x').focus();await page.keyboard.press('Control+y');assert.deepEqual(history(await snapshot()),history(formGuard));await page.keyboard.press('Escape');
  await page.locator('#scene-space').focus();await page.keyboard.press('Control+z');assert.deepEqual(history(await snapshot()),history(formGuard));
  report.checks.keyboardAndForms={controlZ:true,commandZ:true,shiftZ:true,controlY:true,inputAndSelectGuard:true};

  await page.locator('#open-scene-gallery').click();await page.waitForFunction(()=>document.querySelector('#scene-gallery-dialog').open);const modalBefore=await snapshot();
  for(const key of['Control+z','Meta+z','Control+Shift+z','Control+y','Delete','Control+d'])await page.keyboard.press(key);
  sameScene(await snapshot(),modalBefore,'Modal shortcuts preserve the scene');assert.deepEqual(history(await snapshot()),history(modalBefore));
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#scene-gallery-dialog').open);report.checks.modalGuard=true;

  const kept=await snapshot();await page.locator('#mode-object').click();const objectMode=await snapshot();assert.equal(objectMode.mode,'object');assert.deepEqual(objectMode.recipe.options,objectDraft.options);
  await page.locator('#mode-object').focus();await page.keyboard.press('Control+z');assert.deepEqual(history(await snapshot()),history(kept));
  await page.locator('#mode-scene').click();sameScene(await snapshot(),kept,'Mode return preserves scene');assert.deepEqual(history(await snapshot()),history(kept));report.checks.modePersistence=true;

  // Render all retained variants before measuring repeated JSON-based restores.
  await page.locator('#tab-scene').click();before=await snapshot();await numeric('scene-position-y',.55);after=await snapshot();await undo();await redo();await advance(500);
  const resourcesBefore=(await snapshot()).resources;
  for(let i=0;i<8;i++){sameScene(await undo(),before,`Cycle ${i} undo`);sameScene(await redo(),after,`Cycle ${i} redo`);}
  const resourcesAfter=(await snapshot()).resources;assert.deepEqual(resourcesAfter,resourcesBefore,'Undo/redo releases replaced geometry and material programs');
  report.checks.undoRedoCleanup={cycles:8,before:resourcesBefore,after:resourcesAfter};
  await page.locator('#scene-frame-all').click();await advance(500);await capture('scene-history-desktop');

  const exported=await exportFile('scene-history-v6');assert.equal(exported.data.version,6);assert.equal(exported.data.workspaceMode,'scene');assert.equal('history' in exported.data.scene,false,'Transient Undo history is not serialized');
  await numeric('scene-name','Unsaved change');assert.equal(history(await snapshot()).canUndo,true);await importFile(exported.filename);after=await snapshot();assert.deepEqual(after.recipe,exported.data);assert.equal(history(after).undoCount,0);assert.equal(history(after).redoCount,0);
  assert.equal(await page.locator('#scene-undo').isDisabled(),true);report.checks.nativeRecipeImportClearsHistory={objects:after.scene.instances,exactRecipe:true};
  await numeric('scene-name','Before gallery');assert.equal(history(await snapshot()).canUndo,true);
  await page.locator('#open-scene-gallery').click();await page.locator('[data-scene-preset="artisan-terrace"]').click();await page.waitForFunction(()=>!document.querySelector('#scene-gallery-dialog').open);await advance(500);
  after=await snapshot();assert.equal(after.scene.instances,15);assert.equal(history(after).undoCount,0);assert.equal(history(after).redoCount,0);report.checks.galleryClearsHistory={preset:'artisan-terrace',instances:15};
  await importFile(exported.filename);await page.locator('#tab-scene').click();before=await snapshot();await numeric('scene-name','Touch undo');after=await snapshot();
  await page.setViewportSize({width:390,height:844});await advance(500);await page.locator('#scene-undo').tap();await advance();sameScene(await snapshot(),before,'Touch Undo');await page.locator('#scene-redo').tap();await advance();sameScene(await snapshot(),after,'Touch Redo');
  const mobile=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,buttonHelp:document.querySelectorAll('#scene-undo[title],#scene-redo[title],#scene-undo .parameter-help-label,#scene-redo .parameter-help-label').length}));
  assert.ok(mobile.scrollWidth<=mobile.width+1);assert.equal(mobile.buttonHelp,0);await capture('scene-history-mobile');report.checks.touchAndLayout=mobile;

  assert.deepEqual(report.errors,[]);assert.deepEqual(report.warnings,[]);assert.deepEqual(await hashes(),report.sourceHashes,'Frozen source during browser QA');report.passed=true;
  console.log(JSON.stringify({passed:true,checks:Object.keys(report.checks),output,errors:report.errors,warnings:report.warnings},null,2));
}catch(error){report.passed=false;report.failure=error.stack;await capture('failure').catch(()=>{});throw error;}
finally{await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();}
