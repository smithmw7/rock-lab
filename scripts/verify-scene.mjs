import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSceneEditor, SCENE_LIMITS } from '../src/scene-editor.js';

// TransformControls' CPU state uses the real Three implementation. Minimal
// event targets keep this ownership/import audit independent of browser QA;
// qa-scene.mjs separately performs real pointer drags and rendered checks.
const listeners=new Map(),document={defaultView:{},addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:type=>listeners.delete(type)};
const canvas={ownerDocument:document,style:{},addEventListener:()=>{},removeEventListener:()=>{},getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})};
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,4/3,.1,100),orbit={enabled:true};camera.position.set(6,5,8);camera.lookAt(0,0,0);
const messages=[];let builds=0,disposals=0,frames=0;
function build(recipe){
  if(recipe.invalid)throw new Error('Rejected asset recipe');
  builds++;const group=new THREE.Group();group.name='Test owned asset';group.userData.recipeType=recipe.type;
  const geometry=recipe.type==='hex'?new THREE.CylinderGeometry(.6,.9,1.4,6):new THREE.BoxGeometry(1,1.5,.8);
  const primary=new THREE.MeshStandardMaterial({color:0x987654}),second=new THREE.MeshStandardMaterial({color:0x334455});
  const mesh=new THREE.Mesh(geometry,[primary,second]);mesh.name='Independent material mesh';mesh.position.y=.75;mesh.userData.materialSlot='primary';group.add(mesh);
  if(recipe.type==='nested'){
    const wrapper=new THREE.Group();wrapper.position.set(1,.1,.4);wrapper.rotation.y=.5;wrapper.scale.setScalar(.6);
    const handle=new THREE.Mesh(geometry,second);handle.position.y=.75;handle.userData.materialSlot='handle';wrapper.add(handle);group.add(wrapper);
  }
  return group;
}
function dispose(group){
  disposals++;const geometries=new Set(),materials=new Set();group.traverse(mesh=>{if(mesh.isMesh){geometries.add(mesh.geometry);for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])materials.add(material);}});
  for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();
}
const editor=createSceneEditor({scene,camera,domElement:canvas,orbitControls:orbit,buildInstance:build,disposeInstance:dispose,onMessage:text=>messages.push(text),onFrame:()=>frames++});
const recipe={type:'nested',settings:{color:'#aabbcc'}},a=editor.add(recipe,{name:'First',transform:{position:[-2,0,0],rotation:[0,20,0],scale:[1,1,1]}});
recipe.settings.color='#000000';assert.equal(editor.serialize().objects[0].recipe.settings.color,'#aabbcc','Recipe snapshots must not alias the caller');
const b=editor.add({type:'hex'},{name:'Second',transform:{position:[2,0,0],rotation:[12,35,8],scale:[.7,1.3,.9]}});
editor.setActive(true);assert.equal(editor.getRoot().visible,true);assert.equal(editor.getSnapshot().instances,2);
const firstPose=structuredClone(editor.getSnapshot().objects.find(object=>object.id===a));
editor.setTransform({position:[3,.7,1],rotation:[30,70,10],scale:[.5,2,1]});
assert.deepEqual(editor.getSnapshot().objects.find(object=>object.id===a),firstPose,'Only the selected object may change');
editor.updateSettings({snap:true,translationSnap:.5,rotationSnap:15,scaleSnap:.25});
assert.equal(editor.getSnapshot().settings.snapMode,'surface');assert.equal(editor.getSnapshot().settings.snapDistance,.3);
assert.equal(editor.getTransformControls().translationSnap,null,'Surface snapping does not quantize movement to the grid');
editor.setTransform({position:[3.21,.74,-1.18],rotation:[17,39,-7],scale:[.61,1.86,.88]});
assert.deepEqual(editor.getSnapshot().selection.position,[3.21,.74,-1.18]);assert.deepEqual(editor.getSnapshot().selection.rotation,[17,39,-7]);assert.deepEqual(editor.getSnapshot().selection.scale,[.61,1.86,.88]);
const snappedPose=editor.getSnapshot().selection;editor.setTransform({position:[Infinity,0,0]});assert.deepEqual(editor.getSnapshot().selection,snappedPose,'Invalid numeric transform is atomic');
editor.setTransform({position:[500,-500,0],scale:[-5,500,0]});assert.deepEqual(editor.getSnapshot().selection.position,[50,-50,0]);assert.deepEqual(editor.getSnapshot().selection.scale,[.05,10,.05]);
editor.updateSettings({snap:false});editor.setTransform({position:[2,0,0],rotation:[12,35,8],scale:[.7,1.3,.9]});

const originals=[];editor.getRoot().traverse(mesh=>{if(mesh.isMesh)originals.push({mesh,material:mesh.material,visible:mesh.visible});});
for(const renderMode of ['wireframe','normals','collider','shaded']){
  assert.equal(editor.updateSettings({renderMode}),true);
  if(renderMode==='wireframe')assert.ok(originals.every(entry=>entry.mesh.material.wireframe));
  if(renderMode==='normals')assert.ok(originals.every(entry=>entry.mesh.material.isMeshNormalMaterial));
  if(renderMode==='collider'){
    const hulls=[];editor.getRoot().updateMatrixWorld(true);editor.getRoot().traverse(mesh=>{if(mesh.userData.sceneCollider)hulls.push(mesh);});assert.equal(hulls.length,3);
    for(const hull of hulls){
      const source=originals.find(entry=>entry.mesh.uuid===hull.userData.sourceMeshUuid).mesh;
      assert.equal(hull.geometry.constructor.name,'ConvexGeometry');assert.equal(hull.geometry.userData.sceneColliderShape,'convexHull');assert.equal(source.visible,false);
      const relative=new THREE.Matrix4().copy(hull.matrixWorld).invert().multiply(source.matrixWorld),points=source.geometry.attributes.position,hullPoints=hull.geometry.attributes.position;
      for(let index=0;index<hullPoints.count;index+=3){
        const aa=new THREE.Vector3().fromBufferAttribute(hullPoints,index),bb=new THREE.Vector3().fromBufferAttribute(hullPoints,index+1),cc=new THREE.Vector3().fromBufferAttribute(hullPoints,index+2),plane=new THREE.Plane().setFromCoplanarPoints(aa,bb,cc);
        for(let vertex=0;vertex<points.count;vertex++)assert.ok(plane.distanceToPoint(new THREE.Vector3().fromBufferAttribute(points,vertex).applyMatrix4(relative))<1e-5,'All source vertices must lie inside the actual convex collider');
      }
    }
    assert.equal(editor.getSelectionHelper().userData.sceneCollider,undefined,'Selection bounds must never be represented as a collider');
  }
  if(renderMode==='shaded')for(const entry of originals){assert.equal(entry.mesh.material,entry.material);assert.equal(entry.mesh.visible,entry.visible);}
}
editor.setTool('translate');const control=editor.getTransformControls();assert.equal(control.object,editor.getSelected().node);assert.equal(control.enabled,true);
control.dragging=true;assert.equal(orbit.enabled,false);control.dragging=false;assert.equal(orbit.enabled,true);
editor.updateSettings({snap:true,snapMode:'grid',translationSnap:.25,rotationSnap:30,scaleSnap:.1,space:'local'});assert.equal(control.translationSnap,.25);assert.equal(control.rotationSnap,Math.PI/6);assert.equal(control.space,'local');
const key=key=>({key,target:{closest:()=>null},preventDefault(){this.defaultPrevented=true;}});
listeners.get('keydown')(key('e'));assert.equal(editor.getSnapshot().settings.tool,'rotate');listeners.get('keydown')(key('f'));assert.equal(frames,1);
listeners.get('keydown')({...key('r'),target:{closest:()=>({})}});assert.equal(editor.getSnapshot().settings.tool,'rotate','Shortcuts must ignore focused form fields');

const saved=editor.serialize(),oldSnapshot=editor.getSnapshot(),beforeInvalid=disposals;
for(const change of [value=>{value.objects[1].recipe={invalid:true};},value=>{value.objects[1].position=[NaN,0,0];},value=>{value.objects[1].scale=[0,1,1];},value=>{value.objects[1].id=value.objects[0].id;},value=>{value.settings.renderMode='unknown';},value=>{value.selectedId='missing';}]){
  const invalid=structuredClone(saved);change(invalid);assert.throws(()=>editor.load(invalid));assert.deepEqual(editor.getSnapshot(),oldSnapshot,'A failed scene import must preserve objects, selection, and settings');
}
assert.ok(disposals>beforeInvalid,'An asset build failure must release already-staged owned objects');
editor.load(saved);assert.deepEqual(editor.serialize(),saved,'Round trip restores recipes, names, exact transforms, selection, and settings');
const c=editor.duplicateSelected();assert.ok(c&&c!==b);const duplicate=editor.getSelected();editor.select(b);assert.notEqual(editor.getSelected().group.children[0].geometry,duplicate.group.children[0].geometry,'Duplicated asset resources must be independent');
editor.select(c);editor.renameSelected('Renamed duplicate');editor.updateSelectedRecipe({type:'hex',custom:'kept'});assert.equal(editor.getSnapshot().selection.recipe.custom,'kept');
const keptPose=editor.getSnapshot().selection;assert.equal(editor.replaceSelected({invalid:true}),false);assert.deepEqual(editor.getSnapshot().selection,keptPose);assert.equal(editor.replaceSelected({type:'nested'}),true);assert.deepEqual(editor.getSnapshot().selection.position,keptPose.position);assert.equal(editor.getSnapshot().selection.name,'Renamed duplicate');
editor.deleteSelected();assert.equal(editor.getSnapshot().instances,2);assert.equal(editor.getSnapshot().selectedId,null);
editor.setActive(false);assert.equal(editor.getRoot().visible,false);assert.equal(control.enabled,false);listeners.get('keydown')(key('Delete'));assert.equal(editor.getSnapshot().instances,2,'Inactive scene shortcuts must not delete objects');editor.setActive(true);

editor.load({version:1,objects:[],selectedId:null,settings:{}});
for(let i=0;i<SCENE_LIMITS.instances;i++)assert.ok(editor.add({type:'hex'},{name:`Asset ${i}`,select:false}));
const budgetSnapshot=editor.serialize(),beforeOverflow=disposals;assert.equal(editor.add({type:'hex'}),null);assert.deepEqual(editor.serialize(),budgetSnapshot);assert.equal(disposals,beforeOverflow+1,'Rejected over-budget addition must dispose its staged asset');
const invalidBudget=structuredClone(budgetSnapshot);invalidBudget.objects.push({...invalidBudget.objects[0],id:'over-budget'});assert.throws(()=>editor.load(invalidBudget));assert.deepEqual(editor.serialize(),budgetSnapshot);
editor.destroy();assert.equal(scene.children.length,0,'Destroy must remove all helpers and owned objects');assert.equal(builds,disposals,'Every built owned Group must be disposed exactly once');
console.log(JSON.stringify({passed:true,builds,disposals,checks:['Independent recipes, transforms, and duplicate geometry','Exact clamped numeric inputs and native gizmo snapping','Original materials restored after every debug mode','Actual convex hull planes enclose transformed mesh vertices','Active-only shortcuts, focused fields, orbit drag restoration','Atomic malformed/over-budget import and replacement rollback','Exact scene round trip including selected object','Staged resource release, instance budget, full destroy']},null,2));
