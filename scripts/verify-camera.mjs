import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createCameraRig } from '../src/camera-rig.js';
import { createSceneEditor } from '../src/scene-editor.js';

const close=(a,b,message,epsilon=1e-8)=>assert(Math.abs(a-b)<epsilon,`${message}: ${a} versus ${b}`);
const vectorClose=(a,b,message,epsilon=1e-8)=>assert(new THREE.Vector3().fromArray(a).distanceTo(new THREE.Vector3().fromArray(b))<epsilon,message);
function setup(){
  const camera=new THREE.OrthographicCamera(-5,5,4,-4,.1,1000);camera.position.set(7,5.1,8);
  const controls=new OrbitControls(camera);controls.target.set(.4,1.35,-.7);controls.enableDamping=true;controls.dampingFactor=.08;controls.minZoom=.45;controls.maxZoom=3;controls.minDistance=.5;controls.maxDistance=1000;controls.update(0);
  const changes=[],rig=createCameraRig({camera,controls,onCameraChange:next=>changes.push(next)});return{rig,controls,changes,camera};
}
function projectedSegment(rig){
  const camera=rig.camera,target=new THREE.Vector3().fromArray(rig.getState().target),up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion);
  const a=target.clone().addScaledVector(up,-.4).project(camera),b=target.clone().addScaledVector(up,.4).project(camera);return a.distanceTo(b);
}
const checks=[];function check(name,fn){fn();checks.push(name);}
let projectionCases=0;
check('Non-square projection toggles preserve target-plane size, target, direction and stable camera identities',()=>{
  for(const aspect of [.31,.75,1,1.8,3.7])for(const focal of [18,35,90,135])for(const zoom of [.02,.45,1,3,200]){
    const {rig,controls,camera,changes}=setup();rig.resize(aspect,6.2);rig.setFocalLength(focal);camera.zoom=zoom;camera.updateProjectionMatrix();
    const before=rig.getState(),size=projectedSegment(rig),direction=new THREE.Vector3().fromArray(before.position).sub(new THREE.Vector3().fromArray(before.target)).normalize();
    rig.setProjection('perspective');const perspective=rig.camera;close(projectedSegment(rig),size,'Perspective target-plane size',1e-6);vectorClose(rig.getState().target,before.target,'Target survives projection change');
    const afterDirection=rig.camera.position.clone().sub(controls.target).normalize();close(afterDirection.dot(direction),1,'View direction survives projection change');
    for(let i=0;i<10;i++)controls.update(1/60);close(projectedSegment(rig),size,'Projection survives subsequent controls update',1e-6);
    rig.setProjection('orthographic');assert.equal(rig.camera,camera);close(projectedSegment(rig),size,'Orthographic target-plane size',1e-6);
    for(let i=0;i<10;i++)controls.update(1/60);close(projectedSegment(rig),size,'Ortho zoom survives controls limits',1e-6);
    rig.setProjection('perspective');assert.equal(rig.camera,perspective);assert.equal(changes.length,3);projectionCases++;
  }
});
check('Lens millimetres survive aspect changes and perspective focal changes hold the camera pose',()=>{
  const {rig}=setup();rig.setProjection('perspective');rig.setFocalLength(45);const before=rig.getState(),size=projectedSegment(rig);
  rig.setFocalLength(90);vectorClose(rig.getState().position,before.position,'Changing focal length does not dolly');close(projectedSegment(rig),size*2,'Doubling focal length doubles projected target size');
  for(const aspect of [.3,1,3]){rig.resize(aspect,8);close(rig.camera.getFocalLength(),90,'True millimetres survive changing film aspect');vectorClose(rig.getState().position,before.position,'Resize never dollies');}
  rig.setFocalLength(999);assert.equal(rig.focalLength,135);rig.setFocalLength(1);assert.equal(rig.focalLength,18);
  assert.throws(()=>rig.setFocalLength(NaN));assert.throws(()=>rig.setProjection('invalid'));
});
check('All view directions snap with stable pole-safe top, no inertia drift, and custom detection on orbit',()=>{
  const {rig,controls}=setup();const startTarget=controls.target.toArray();
  for(const projection of ['orthographic','perspective']){
    rig.setProjection(projection);
    for(const view of ['top','left','right','front','back','iso']){
      controls.autoRotate=true;controls.rotateLeft(.12);const distance=rig.getState().distance,zoom=rig.camera.zoom;
      rig.setView(view);assert.equal(rig.getState().view,view);assert.equal(controls.autoRotate,false);assert.equal(controls.enableDamping,true);close(rig.getState().distance,distance,'View retains distance');close(rig.camera.zoom,zoom,'View retains zoom');
      const before=rig.getState();for(let i=0;i<180;i++)controls.update(1/60);vectorClose(rig.getState().position,before.position,'Snapped view does not drift');vectorClose(controls.target.toArray(),startTarget,'View retains target');
      assert(rig.camera.matrixWorld.elements.every(Number.isFinite));assert(rig.camera.projectionMatrix.elements.every(Number.isFinite));
      if(view==='top')assert(rig.camera.position.clone().sub(controls.target).normalize().dot(new THREE.Vector3(0,1,0))>1-1e-10);
    }
    controls.rotateLeft(.3);assert.equal(rig.sync().view,'custom');
  }
});
check('Framing is explicit and accounts for closest geometry depth',()=>{
  const {rig}=setup();rig.resize(1.4,9);rig.setProjection('perspective');rig.fitHeight(6,{depth:4});
  const state=rig.getState(),nearHeight=2*(state.distance-2)*Math.tan(THREE.MathUtils.degToRad(rig.camera.fov)*.5)/rig.camera.zoom;close(nearHeight,6,'Nearest bound fits requested vertical span');
  const position=rig.camera.position.toArray();for(let i=0;i<20;i++)rig.resize(1.4,9);vectorClose(rig.camera.position.toArray(),position,'Repeated resize is idempotent');
  rig.setProjection('orthographic');const orthoPosition=rig.camera.position.toArray();rig.fitHeight(7);close(rig.getState().visibleHeight,7,'Orthographic framing changes span');vectorClose(rig.camera.position.toArray(),orthoPosition,'Orthographic framing does not dolly');
});
check('Snapshots restore projection, lens, target and pose without restoring a stale viewport aspect',()=>{
  const {rig,controls}=setup();rig.resize(.8,11);rig.setProjection('perspective');rig.setView('left');rig.setFocalLength(83);controls.target.set(3,-2,1);rig.camera.position.add(new THREE.Vector3(3,-2,1));controls.update(0);rig.camera.far=2400;rig.camera.near=.03;
  const saved=rig.capture();rig.setProjection('orthographic');rig.setView('iso');rig.resize(2.1,3);rig.setFocalLength(18);rig.restore(saved);const restored=rig.capture();
  assert.equal(restored.projection,saved.projection);assert.equal(restored.focalLength,saved.focalLength);assert.equal(restored.aspect,2.1);assert.equal(restored.near,saved.near);assert.equal(restored.far,saved.far);close(restored.zoom,saved.zoom,'Snapshot zoom');
  vectorClose(restored.position,saved.position,'Snapshot position');vectorClose(restored.target,saved.target,'Snapshot target');vectorClose(restored.up,saved.up,'Snapshot up');
});
check('Scene camera replacement finishes a live transform and redirects both gizmo and real pointer picking',()=>{
  const handlers=new Map(),document={defaultView:{},addEventListener(){},removeEventListener(){}};
  const canvas={ownerDocument:document,style:{},addEventListener:(type,handler)=>handlers.set(type,handler),removeEventListener(){},getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})};
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-4,4,3,-3,.1,100),orbit={enabled:true};camera.position.set(0,0,10);camera.lookAt(0,0,0);
  const editor=createSceneEditor({scene,camera,domElement:canvas,orbitControls:orbit,buildInstance:()=>{const group=new THREE.Group();group.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()));return group;}});
  try{
    const near=editor.add({},{transform:{position:[0,0,0]}}),side=editor.add({},{transform:{position:[2,0,0]}});editor.setActive(true);editor.select(side);editor.clearHistory();editor.setTool('translate');
    const gizmo=editor.getTransformControls();gizmo.dragging=true;gizmo.object.position.y=.3;gizmo.dispatchEvent({type:'objectChange'});
    const next=new THREE.PerspectiveCamera(45,4/3,.1,100);next.position.set(10,0,0);next.lookAt(0,0,0);editor.setCamera(next);
    assert.equal(gizmo.camera,next);assert.equal(gizmo.dragging,false);assert.equal(orbit.enabled,true);assert.equal(editor.getHistoryState().undoCount,1);assert.equal(editor.getHistoryState().undoLabel,'Move object');
    editor.setTransform({position:[2,0,0]});editor.setTool('select');editor.select(null);
    handlers.get('pointerdown')({button:0,pointerId:1,clientX:400,clientY:300});handlers.get('pointerup')({pointerId:1,clientX:400,clientY:300});assert.equal(editor.getSelected().id,side,'The new +X perspective camera hits the X=2 object first');
    editor.setCamera(camera);editor.select(null);handlers.get('pointerdown')({button:0,pointerId:2,clientX:400,clientY:300});handlers.get('pointerup')({pointerId:2,clientX:400,clientY:300});assert.equal(editor.getSelected().id,near,'The original +Z orthographic camera hits the origin object');
  }finally{editor.destroy();}
});
console.log(JSON.stringify({passed:true,projectionCases,checks},null,2));
