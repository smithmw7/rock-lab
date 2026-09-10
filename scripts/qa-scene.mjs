import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

// Independent Chrome session, real controls, native file picker/download, and
// GPU/geometry observations. Does not attach to the user's browser.
const project=fileURLToPath(new URL('..',import.meta.url));
const output=path.join(project,'output','scene');await fs.mkdir(output,{recursive:true});
const report={url:process.env.ROCK_LAB_URL||'http://127.0.0.1:5207/',checks:{},errors:[],warnings:[]};
const sources=['src/main.js','src/scene-editor.js','src/scene-ui.js','src/scene.css','src/tooltips.js','src/ground.js','index.html'];
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
  return {start:point,before:before.scene.selection.position,after:after.scene.selection.position,cameraFixed:true,snapped:true};
}

function inspectColliders(){
  const editor=window.rockLab.sceneEditor,root=editor.getRoot(),sources=new Map(),colliders=[];root.updateWorldMatrix(true,true);
  root.traverse(mesh=>{if(mesh.isMesh){if(mesh.userData.sceneCollider)colliders.push(mesh);else sources.set(mesh.uuid,mesh);}});
  let maxVertexError=0,maxOutside=0,triangles=0,hasCurvedHull=false;
  for(const collider of colliders){
    const source=sources.get(collider.userData.sourceMeshUuid);if(!source)throw new Error('Collider source is missing');if(source.visible)throw new Error('Collider mode must hide the rendered source');
    const points=[],attribute=source.geometry.attributes.position;
    for(let i=0;i<attribute.count;i++)points.push(source.position.clone().fromBufferAttribute(attribute,i).applyMatrix4(source.matrixWorld));
    const hull=collider.geometry.attributes.position,index=collider.geometry.index,hullPoints=[],unique=new Set();
    for(let i=0;i<hull.count;i++){const point=collider.position.clone().fromBufferAttribute(hull,i).applyMatrix4(collider.matrixWorld);hullPoints.push(point);unique.add(point.toArray().map(n=>n.toFixed(5)).join(','));maxVertexError=Math.max(maxVertexError,Math.sqrt(Math.min(...points.map(source=>source.distanceToSquared(point)))));}
    if(unique.size>8)hasCurvedHull=true;
    const count=index?.count??hull.count;
    for(let i=0;i<count;i+=3){const[a,b,c]=[0,1,2].map(offset=>hullPoints[index?index.getX(i+offset):i+offset]);const normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize();for(const point of points)maxOutside=Math.max(maxOutside,normal.dot(point.clone().sub(a)));triangles++;}
  }
  return {count:colliders.length,maxVertexError,maxOutside,triangles,hasCurvedHull};
}

try{
  await page.goto(report.url);await page.waitForFunction(()=>window.rockLab?.ready&&window.rockLab.sceneEditor);
  const initial=await snapshot();assert.equal(initial.mode,'object');assert.equal(initial.scene.instances,0);assert.equal(await page.locator('#scene-toolbar').isVisible(),false);assert.ok(initial.original.length&&initial.original.every(root=>root.visible));
  report.checks.defaultObject={shape:initial.recipe.options.shape,visible:true};await capture('object-default');
  const untouched=await exportFile('untouched-object-v6');assert.equal(untouched.data.scene.initialized,false);await importFile(untouched.filename);const untouchedRestored=await snapshot();assert.equal(untouchedRestored.scene.instances,0);assert.deepEqual(untouchedRestored.recipe,untouched.data,'An untouched Object recipe roundtrips every field, including null scene environment');
  await page.locator('#mode-scene').click();let current=await snapshot();assert.equal(current.mode,'scene');assert.equal(current.scene.instances,1);assert.equal(current.scene.selection.recipe.options.shape,initial.recipe.options.shape);assert.equal(current.stats.fracture.enabled,false);assert.ok(current.original.every(root=>!root.visible));assert.equal(await page.locator('#tab-fracture').isVisible(),false);
  const first=current.scene.selectedId;await capture('scene-first-object');report.checks.firstSceneCopy={afterNativeUntouchedObjectRoundtrip:true,exactUntouchedObjectRecipe:true,instances:1};

  await shape('hammer');current=await snapshot();assert.equal(current.scene.instances,2);const second=current.scene.selectedId;
  await page.locator('#scene-add').click();current=await snapshot();assert.equal(current.scene.instances,3);const third=current.scene.selectedId;
  assert.equal(current.scene.objects.find(object=>object.id===second).recipe.options.shape,'hammer');assert.equal(current.scene.selection.recipe.options.shape,'hammer');
  const allMaterialIds=current.instances.map(instance=>new Set(instance.meshes.flatMap(mesh=>mesh.materials.map(material=>material.uuid))));
  assert.ok([...allMaterialIds[1]].every(id=>!allMaterialIds[2].has(id)),'Repeated instances own independent materials');
  report.checks.libraryAndAddCurrent={instances:3,independentMaterials:true};

  await select(second);const beforeEdit=await snapshot();
  await page.locator('#tab-material').click();await page.locator('#material-slot').selectOption('primary');await page.locator('#material-outer').click();await page.locator('[data-material-family="rock"]').click();await page.locator('[data-surface="obsidian"]').click();await advance();
  current=await snapshot();assert.equal(current.scene.selection.recipe.options.surface,'obsidian');assert.equal(current.scene.objects.find(object=>object.id===third).recipe.options.surface,beforeEdit.scene.objects.find(object=>object.id===third).recipe.options.surface);
  assert.deepEqual(current.instances.find(object=>object.id===third),beforeEdit.instances.find(object=>object.id===third));
  const beforeGeometry=await snapshot();await page.locator('#tab-shape').click();await page.locator('#bevel').evaluate(input=>{input.value='.85';input.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForFunction(id=>window.rockLab.sceneEditor.getSnapshot().objects.find(object=>object.id===id).recipe.options.bevel===.85,second);current=await snapshot();
  assert.notDeepEqual(current.instances.find(object=>object.id===second).meshes.map(mesh=>mesh.geometry),beforeGeometry.instances.find(object=>object.id===second).meshes.map(mesh=>mesh.geometry));
  for(const id of[first,third])assert.deepEqual(current.instances.find(object=>object.id===id),beforeGeometry.instances.find(object=>object.id===id));
  report.checks.selectedOnlyMaterialAndGeometry=true;

  await page.locator('#tab-scene').click();await numeric('scene-name','Obsidian hammer');
  await numeric('scene-translation-snap',.5);await numeric('scene-rotation-snap',15);await numeric('scene-scale-snap',.25);await page.locator('#scene-snap').check();
  for(const[id,value]of[['scene-position-x',1.24],['scene-position-y',.26],['scene-position-z',-1.26],['scene-rotation-y',22],['scene-scale-x',1.37]])await numeric(id,value);
  current=await snapshot();vectors(current.scene.selection.position,[1.24,.26,-1.26],'Exact numeric position with snap enabled');almost(current.scene.selection.rotation[1],22,'Exact rotation');almost(current.scene.selection.scale[0],1.37,'Exact scale');assert.equal(current.scene.selection.name,'Obsidian hammer');
  report.checks.exactNumericTransforms={position:current.scene.selection.position,rotation:current.scene.selection.rotation,scale:current.scene.selection.scale};
  await page.locator('[data-scene-tool="translate"]').click();await page.locator('#scene-frame').click();await advance(800);report.checks.nativeGizmo=await dragGizmo();await capture('native-snapped-transform');

  // A drag in the viewport orbits without changing selection or object transforms.
  await page.locator('[data-scene-tool="select"]').click();await page.locator('#scene-frame-all').click();await advance(800);const beforeOrbit=await snapshot(),canvas=await page.locator('#stage canvas').boundingBox();
  await page.mouse.move(canvas.x+canvas.width*.83,canvas.y+canvas.height*.79);await page.mouse.down();await page.mouse.move(canvas.x+canvas.width*.91,canvas.y+canvas.height*.83,{steps:12});await page.mouse.up();await advance(1000);current=await snapshot();assert.equal(current.scene.selectedId,beforeOrbit.scene.selectedId);assert.deepEqual(current.scene.objects,beforeOrbit.scene.objects);assert.ok(distance(current.camera,beforeOrbit.camera)>.05);
  // Actual canvas hit selects a different placed object using its visible mesh.
  const hit=await page.evaluate(id=>{const lab=window.rockLab,node=lab.sceneEditor.getRoot().children.find(node=>node.userData.sceneInstanceId===id),meshes=[];node.traverse(mesh=>{if(mesh.isMesh&&!mesh.userData.sceneCollider){mesh.geometry.computeBoundingSphere();meshes.push(mesh);}});meshes.sort((a,b)=>b.geometry.boundingSphere.radius-a.geometry.boundingSphere.radius);const mesh=meshes[0],point=mesh.geometry.boundingSphere.center.clone().applyMatrix4(mesh.matrixWorld).project(lab.camera),rect=lab.renderer.domElement.getBoundingClientRect();return{x:rect.x+(point.x+1)*rect.width/2,y:rect.y+(1-point.y)*rect.height/2};},third);
  await page.mouse.click(hit.x,hit.y);current=await snapshot();assert.equal(current.scene.selectedId,third);report.checks.viewportSelectionVersusOrbit={cameraMoved:true,selectedByPointer:true};

  // Curved, hollow tubing proves collider mode is a real per-mesh convex hull,
  // distinct from the yellow selection bounds and from the original concavity.
  await shape('metalTube');const tube=(await snapshot()).scene.selectedId;await page.locator('#scene-frame-all').click();await advance(500);
  const shadedMaterials=(await snapshot()).instances,renderHashes={};
  for(const mode of['shaded','wireframe','collider','normals']){
    await page.locator('#scene-render-mode').selectOption(mode);renderHashes[mode]=await capture(`render-${mode}`);current=await snapshot();assert.equal(current.scene.settings.renderMode,mode);
    if(mode==='wireframe')assert.ok(current.instances.every(instance=>instance.meshes.every(mesh=>mesh.materials.every(material=>material.wireframe))));
    if(mode==='normals')assert.ok(current.instances.every(instance=>instance.meshes.every(mesh=>mesh.materials.every(material=>material.type==='MeshNormalMaterial'))));
    if(mode==='collider'){const hull=await page.evaluate(inspectColliders);assert.ok(hull.count>0&&hull.hasCurvedHull);assert.ok(hull.maxVertexError<1e-5);assert.ok(hull.maxOutside<1e-4);report.checks.actualConvexColliders=hull;}
  }
  assert.equal(new Set(Object.values(renderHashes)).size,4,'All diagnostic modes change actual GPU pixels');
  await page.locator('#scene-render-mode').selectOption('shaded');assert.deepEqual((await snapshot()).instances,shadedMaterials);report.checks.renderModes={hashes:renderHashes,shadedMaterialsRestored:true};
  await page.locator('#scene-grid').uncheck();assert.equal((await snapshot()).grid,false);await page.locator('#scene-grid').check();assert.equal((await snapshot()).grid,true);report.checks.gridToggle=true;

  // First render all variants before checking steady-state resource cleanup.
  await select(tube);await page.locator('#scene-duplicate').click();await advance();await page.locator('#scene-delete').click();await advance();await select(tube);const resourceBaseline=(await snapshot()).resources;
  for(let i=0;i<4;i++){await page.locator('#scene-duplicate').click();current=await snapshot();assert.equal(current.scene.instances,5);assert.notEqual(current.scene.selectedId,tube);await advance();await page.locator('#scene-delete').click();await advance();await select(tube);assert.equal((await snapshot()).scene.instances,4);}
  const resourceAfter=(await snapshot()).resources;assert.deepEqual(resourceAfter,resourceBaseline,'Deleted instances release geometry and material variants');report.checks.duplicateDeleteCleanup={iterations:5,before:resourceBaseline,after:resourceAfter};
  await page.locator('#scene-name').focus();const toolBefore=(await snapshot()).scene.settings.tool;await page.keyboard.press('r');await page.keyboard.press('Delete');current=await snapshot();assert.equal(current.scene.instances,4);assert.equal(current.scene.settings.tool,toolBefore);await page.keyboard.press('Escape');
  await page.locator('[data-scene-tool="select"]').focus();await page.keyboard.press('w');assert.equal((await snapshot()).scene.settings.tool,'translate');await page.keyboard.press('e');assert.equal((await snapshot()).scene.settings.tool,'rotate');await page.keyboard.press('r');assert.equal((await snapshot()).scene.settings.tool,'scale');await page.keyboard.press('q');assert.equal((await snapshot()).scene.settings.tool,'select');
  await page.locator('#scene-duplicate').click();await page.locator('[data-scene-tool="select"]').focus();await page.keyboard.press('Delete');assert.equal((await snapshot()).scene.instances,4);await select(second);report.checks.keyboardInputGuards=true;

  const durable=(await snapshot()).scene;await page.locator('#mode-object').click();current=await snapshot();assert.equal(current.mode,'object');assert.deepEqual(current.recipe.options,initial.recipe.options);assert.deepEqual(current.recipe.innerMaterial,initial.recipe.innerMaterial);assert.deepEqual(current.original.map(root=>root.meshes),initial.original.map(root=>root.meshes));assert.ok(current.original.every(root=>root.visible));assert.equal(await page.locator('#scene-toolbar').isVisible(),false);
  await page.locator('#mode-scene').click();current=await snapshot();assert.deepEqual(current.scene.objects,durable.objects);assert.deepEqual(current.scene.settings,durable.settings);assert.equal(current.scene.selectedId,durable.selectedId);report.checks.modeRestoration=true;
  await page.locator('#mode-object').click();await page.locator('#tab-fracture').click();await page.locator('#fr-enabled').check();await page.waitForFunction(()=>window.rockLab.fracture?.getStats().enabled);
  await page.locator('#mode-scene').click();await page.waitForFunction(()=>!window.rockLab.fracture?.getStats().enabled);assert.equal(await page.locator('#tab-fracture').isVisible(),false);assert.deepEqual((await snapshot()).scene.objects,durable.objects);
  await page.locator('#mode-object').click();await page.waitForFunction(()=>window.rockLab.fracture?.getStats().enabled);await page.locator('#tab-fracture').click();await page.locator('#fr-enabled').uncheck();await page.waitForFunction(()=>!window.rockLab.fracture?.getStats().enabled);await page.locator('#mode-scene').click();report.checks.sceneDisablesAndRestoresObjectFracture=true;

  const exported=await exportFile();assert.equal(exported.data.version,6);assert.equal(exported.data.workspaceMode,'scene');assert.equal(exported.data.scene.version,1);assert.equal(exported.data.scene.objects.length,4);assert.equal(exported.data.scene.selectedId,second);assert.ok(exported.data.scene.environment.ground);
  await numeric('scene-position-x',9);await page.locator('#scene-delete').click();await page.locator('#scene-grid').uncheck();await importFile(exported.filename);current=await snapshot();assert.deepEqual(current.recipe,exported.data);report.checks.nativeV6Roundtrip={filename:exported.filename,objects:4,selectedId:second};

  // A file failure leaves live records, selection, materials, and settings intact.
  const invalids=[];
  for(const kind of['duplicate-id','invalid-scale','invalid-recipe','instance-budget']){
    const data=structuredClone(exported.data);
    if(kind==='duplicate-id')data.scene.objects[1].id=data.scene.objects[0].id;
    if(kind==='invalid-scale')data.scene.objects[1].scale[0]=0;
    if(kind==='invalid-recipe')data.scene.objects[1].recipe.options.shape='missing-shape';
    if(kind==='instance-budget')data.scene.objects=Array.from({length:65},(_,index)=>({...structuredClone(data.scene.objects[0]),id:`over-${index}`}));
    const before=await snapshot();await importFile(await fixture(kind,data),{invalid:true});const after=await snapshot();assert.deepEqual(after.recipe,before.recipe);assert.deepEqual(after.instances,before.instances);invalids.push(kind);
  }
  report.checks.atomicInvalidImports=invalids;
  const capped=structuredClone(exported.data),small=structuredClone(capped.scene.objects[0]);small.recipe.options.shape='smallBlock';small.recipe.options.facets=0;small.recipe.options.displacement=0;
  capped.scene.objects=Array.from({length:64},(_,index)=>({...structuredClone(small),id:`budget-${index}`,name:`Block ${index+1}`,position:[index%8-4,0,Math.floor(index/8)-4]}));capped.scene.selectedId='budget-63';
  await importFile(await fixture('budget-64',capped));assert.equal((await snapshot()).scene.instances,64);await page.locator('#scene-add').click();assert.equal((await snapshot()).scene.instances,64);assert.match(await page.locator('#toast').textContent(),/limit/i);report.checks.instanceBudget={instances:64,additionalAddRejected:true};await importFile(exported.filename);

  // A failed composite replacement must leave both the saved recipe and the
  // already-rendered material uniforms intact, not just retain old geometry.
  const capacity=structuredClone(exported.data),unit=structuredClone(small);
  unit.recipe.options.surface='obsidian';unit.name='Capacity block';
  const longPath=structuredClone(unit);Object.assign(longPath.recipe.options,{shape:'objectPath',pathObject:'smallBlock',pathObjectScale:.15,pathSpacing:.05,pathPoints:[{x:-11,z:-11},{x:11,z:-11},{x:11,z:11},{x:-11,z:11}],pathClosed:true});
  capacity.scene.objects=[...Array.from({length:3},()=>structuredClone(longPath)),...Array.from({length:31},()=>structuredClone(exported.data.scene.objects[0])),...Array.from({length:4},()=>structuredClone(unit))].map((object,index)=>({...object,id:`piece-budget-${index}`,position:[0,0,0]}));
  capacity.scene.selectedId=capacity.scene.objects.at(-1).id;
  await importFile(await fixture('piece-budget-512',capacity));let capacityBefore=await snapshot();assert.equal(capacityBefore.scene.pieces,512);
  await page.locator('[data-look="alpine"]').click();await advance();let capacityAfter=await snapshot();assert.equal(capacityAfter.scene.pieces,512);assert.deepEqual(capacityAfter.scene.objects,capacityBefore.scene.objects);assert.deepEqual(capacityAfter.instances,capacityBefore.instances,'Rejected world look retains geometry and actual uniforms');assert.match(await page.locator('#toast').textContent(),/limit/i);
  const pathCapacity=structuredClone(capacity);Object.assign(pathCapacity.scene.objects.at(-1).recipe.options,{shape:'objectPath',pathObject:'smallBlock',pathObjectScale:.15,pathSpacing:1,pathPoints:[{x:0,z:0},{x:.05,z:0}],pathClosed:false});
  await importFile(await fixture('piece-budget-single-path',pathCapacity));capacityBefore=await snapshot();assert.equal(capacityBefore.scene.pieces,512);await page.locator('#tab-path').click();await page.locator('#pathObject').selectOption('hammer');await advance();capacityAfter=await snapshot();
  assert.equal(capacityAfter.scene.pieces,512);assert.deepEqual(capacityAfter.scene.objects,capacityBefore.scene.objects);assert.deepEqual(capacityAfter.instances,capacityBefore.instances,'Rejected path source retains geometry and actual uniforms');assert.equal(await page.locator('#pathObject').inputValue(),'smallBlock');assert.match(await page.locator('#toast').textContent(),/limit/i);
  report.checks.transactionalPieceBudget={pieces:512,instances:38,rejectedWorldLook:true,rejectedCompositePathSource:true,recipeGeometryAndUniformsIntact:true};await importFile(exported.filename);

  const legacy=[];
  for(let version=1;version<=5;version++){
    const data={generator:'procedural-rock-lab',version,options:{shape:'block',surface:'stone',seed:91000+version,bevel:.4}};
    await importFile(await fixture(`legacy-v${version}`,data));current=await snapshot();assert.equal(current.mode,'object');assert.equal(current.recipe.options.seed,91000+version);assert.equal(current.recipe.options.shape,'block');assert.equal(current.scene.active,false);assert.equal(current.recipe.version,6);legacy.push(version);
  }
  report.checks.legacyFilesRemainObject=legacy;
  const emptyScene=structuredClone(exported.data);Object.assign(emptyScene.scene,{objects:[],selectedId:null,initialized:true});await importFile(await fixture('intentionally-empty-scene',emptyScene));assert.equal((await snapshot()).scene.instances,0);await page.locator('#mode-object').click();await page.locator('#mode-scene').click();assert.equal((await snapshot()).scene.instances,0);report.checks.intentionalEmptyScenePersists=true;await importFile(exported.filename);

  // Help belongs exclusively on parameter labels, including toolbar switches.
  await page.locator('#tab-scene').click();const help=await page.evaluate(()=>{
    const controls=[...document.querySelectorAll('#panel-scene input,#panel-scene select,#scene-toolbar input,#scene-toolbar select')];
    const labels=controls.map(control=>{const label=document.querySelector(`label[for="${control.id}"]`),trigger=label?.matches('.parameter-help-label')?label:label?.querySelector('.parameter-help-label');return{id:control.id,associated:!!label,help:!!trigger,description:control.getAttribute('aria-describedby')};});
    return{labels,buttonTooltips:document.querySelectorAll('button[title],button.parameter-help-label,button .parameter-help-label').length};
  });report.checks.parameterHelp=help;assert.ok(help.labels.length>=17);assert.ok(help.labels.every(label=>label.associated&&label.help&&label.description));assert.equal(help.buttonTooltips,0);
  const label=page.locator('label[for="scene-translation-snap"] .parameter-help-label, label[for="scene-translation-snap"].parameter-help-label').first();await label.hover();await page.waitForFunction(()=>[...document.querySelectorAll('.parameter-tooltip')].some(node=>!node.hidden));await page.keyboard.press('Escape');assert.equal(await page.locator('.parameter-tooltip:visible').count(),0);report.checks.parameterHelp=help;

  await page.setViewportSize({width:390,height:844});await advance(800);await page.locator('#mode-object').tap();await page.locator('#mode-scene').tap();await page.locator('#tab-scene').tap();await page.locator(`[data-scene-object="${second}"]`).tap();await numeric('scene-position-z',-2.5);almost((await snapshot()).scene.selection.position[2],-2.5,'Mobile numeric edit');
  const mobile=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,toolbar:document.querySelector('#scene-toolbar').getBoundingClientRect().toJSON()}));assert.ok(mobile.scroll<=mobile.width+1,`Mobile overflow ${mobile.scroll}/${mobile.width}`);assert.ok(mobile.toolbar.right<=mobile.width+1&&mobile.toolbar.left>=-1);await capture('scene-mobile-inspector');
  const touchLabel=page.locator('label[for="scene-name"] .parameter-help-label, label[for="scene-name"].parameter-help-label').first();await touchLabel.tap();assert.ok(await page.locator('.parameter-tooltip:visible').count()>0);await page.keyboard.press('Escape');report.checks.mobile={...mobile,touchSelection:true,numericEdit:true,touchHelp:true};await page.locator('#mode-scene').scrollIntoViewIfNeeded();await capture('scene-mobile');report.checks.mobile.toolbar=await page.locator('#scene-toolbar').boundingBox();

  assert.deepEqual(report.errors,[]);assert.deepEqual(report.warnings,[]);assert.deepEqual(await hashes(),report.sourceHashes,'Run must use one frozen runtime revision');report.passed=true;
  console.log(JSON.stringify({passed:true,checks:Object.keys(report.checks),output,errors:report.errors,warnings:report.warnings},null,2));
}catch(error){report.passed=false;report.failure=error.stack;await capture('failure').catch(()=>{});throw error;}
finally{await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();}
