import * as THREE from 'three';

export const CAMERA_FOCAL_RANGE=Object.freeze([18,135]);
const EPSILON=1e-6;
const VIEW_DIRECTIONS=Object.freeze({
  // OrbitControls deliberately clamps poles to one microradian. Starting at
  // that same safe angle gives a stable top view with screen-up toward -Z.
  top:new THREE.Vector3(0,1,EPSILON).normalize(),
  left:new THREE.Vector3(-1,0,0),right:new THREE.Vector3(1,0,0),
  front:new THREE.Vector3(0,0,1),back:new THREE.Vector3(0,0,-1),
  iso:new THREE.Vector3(1,1,1).normalize(),
});
const finitePositive=value=>Number.isFinite(value)&&value>0;
const clampFocal=value=>THREE.MathUtils.clamp(value,...CAMERA_FOCAL_RANGE);

/** Stable orthographic/perspective camera pair around an OrbitControls target.
 * Projection changes preserve the apparent scale at the target plane; changing
 * focal length leaves the camera in place. resize() changes only projection,
 * while fitHeight() explicitly reframes. sync() is safe in the render loop.
 */
export function createCameraRig({camera,controls,onCameraChange=()=>{}}){
  if(!camera?.isOrthographicCamera||controls?.object!==camera||!controls.target?.isVector3)throw new TypeError('Camera rig requires the current orthographic camera and its OrbitControls.');
  const orthographic=camera;
  let active=camera,aspect=Math.abs((camera.right-camera.left)/(camera.top-camera.bottom)),orthoHeight=camera.top-camera.bottom;
  const perspective=new THREE.PerspectiveCamera(40,aspect,camera.near,camera.far);
  perspective.name='Perspective asset camera';perspective.setFocalLength(50);
  let focalLength=50;

  const projection=()=>active.isOrthographicCamera?'orthographic':'perspective';
  const direction=()=>{
    const value=active.position.clone().sub(controls.target);
    return value.lengthSq()>1e-12?value.normalize():VIEW_DIRECTIONS.iso.clone();
  };
  const distance=()=>Math.max(EPSILON,active.position.distanceTo(controls.target));
  const visibleHeight=()=>active.isOrthographicCamera?(active.top-active.bottom)/active.zoom:2*distance()*Math.tan(THREE.MathUtils.degToRad(active.fov)*.5)/active.zoom;
  const pose=()=>({position:active.position.clone(),target:controls.target.clone(),up:active.up.clone(),quaternion:active.quaternion.clone(),zoom:active.zoom});
  function applyPose(value){active.position.copy(value.position);controls.target.copy(value.target);active.up.copy(value.up);active.quaternion.copy(value.quaternion);active.zoom=value.zoom;active.updateProjectionMatrix();}
  function updateMatrices(){active.updateProjectionMatrix();active.updateMatrixWorld(true);}
  function includeCurrentScaleInLimits(){
    if(active.isOrthographicCamera){
      controls.minZoom=Math.min(controls.minZoom,active.zoom);controls.maxZoom=Math.max(controls.maxZoom,active.zoom);
    }else{
      const radius=distance();controls.minDistance=Math.min(controls.minDistance,radius);controls.maxDistance=Math.max(controls.maxDistance,radius);
    }
  }
  function settle(operation,{stopRotation=false}={}){
    const saved=pose(),damping=controls.enableDamping,autoRotate=controls.autoRotate;
    controls.enableDamping=false;controls.autoRotate=false;
    try{
      // A public update without damping consumes pending rotation/pan. Restore
      // the visible pose before our operation so those deltas cannot move it.
      controls.update(0);applyPose(saved);operation();includeCurrentScaleInLimits();controls.update(0);updateMatrices();
    }finally{controls.enableDamping=damping;controls.autoRotate=stopRotation?false:autoRotate;}
  }
  function setProjection(mode,{preserveScale=true}={}){
    if(!['orthographic','perspective'].includes(mode))throw new RangeError('Unsupported camera projection.');
    if(mode===projection())return getState();
    const height=visibleHeight(),viewDirection=direction(),old=active,oldPose=pose(),oldDistance=distance();
    settle(()=>{
      active=mode==='orthographic'?orthographic:perspective;
      active.near=old.near;active.far=old.far;active.layers.mask=old.layers.mask;
      active.position.copy(oldPose.position);active.up.copy(oldPose.up);active.quaternion.copy(oldPose.quaternion);
      active.zoom=1;
      if(preserveScale){
        if(active.isOrthographicCamera)active.zoom=orthoHeight/height;
        else active.position.copy(controls.target).addScaledVector(viewDirection,height/(2*Math.tan(THREE.MathUtils.degToRad(active.fov)*.5)));
      }else active.position.copy(controls.target).addScaledVector(viewDirection,oldDistance);
      controls.object=active;
    });
    onCameraChange(active);return getState();
  }
  function setFocalLength(value){
    if(!finitePositive(value))throw new RangeError('Focal length must be a positive finite number.');
    focalLength=clampFocal(value);perspective.setFocalLength(focalLength);perspective.updateMatrixWorld(true);
    return getState();
  }
  function resize(nextAspect,nextHeight=orthoHeight){
    if(!finitePositive(nextAspect)||!finitePositive(nextHeight))return getState();
    aspect=nextAspect;orthoHeight=nextHeight;
    Object.assign(orthographic,{left:-orthoHeight*aspect/2,right:orthoHeight*aspect/2,top:orthoHeight/2,bottom:-orthoHeight/2});
    orthographic.updateProjectionMatrix();perspective.aspect=aspect;
    // Film height varies with aspect in Three. Reapply millimetres so the lens
    // itself stays constant when rotating a device or resizing the viewport.
    perspective.setFocalLength(focalLength);updateMatrices();return getState();
  }
  function setView(id){
    const desired=VIEW_DIRECTIONS[id];if(!desired)throw new RangeError('Unsupported camera view.');
    const radius=distance();
    settle(()=>{active.up.set(0,1,0);active.position.copy(controls.target).addScaledVector(desired,radius);active.lookAt(controls.target);},{stopRotation:true});
    return getState();
  }
  function fitHeight(height,{depth=0}={}){
    if(!finitePositive(height)||!Number.isFinite(depth)||depth<0)throw new RangeError('Camera framing requires a positive height and nonnegative depth.');
    const viewDirection=direction();
    settle(()=>{
      if(active.isOrthographicCamera)active.zoom=orthoHeight/height;
      else{
        const radius=height*active.zoom/(2*Math.tan(THREE.MathUtils.degToRad(active.fov)*.5))+depth/2;
        active.position.copy(controls.target).addScaledVector(viewDirection,radius);
      }
    });
    return getState();
  }
  function getState(){
    const viewDirection=direction();
    const view=Object.entries(VIEW_DIRECTIONS).find(([,candidate])=>viewDirection.dot(candidate)>1-1e-7)?.[0]??'custom';
    return{projection:projection(),focalLength,view,position:active.position.toArray(),target:controls.target.toArray(),up:active.up.toArray(),quaternion:active.quaternion.toArray(),zoom:active.zoom,distance:distance(),aspect,visibleHeight:visibleHeight()};
  }
  function capture(){
    return{...getState(),near:active.near,far:active.far,orthoHeight,orthographicZoom:orthographic.zoom,perspectiveZoom:perspective.zoom};
  }
  function restore(saved){
    if(!saved||!['orthographic','perspective'].includes(saved.projection))throw new TypeError('Invalid camera snapshot.');
    for(const key of ['position','target','up'])if(!Array.isArray(saved[key])||saved[key].length!==3||!saved[key].every(Number.isFinite))throw new TypeError('Invalid camera snapshot pose.');
    if(!finitePositive(saved.zoom)||!finitePositive(saved.near)||!finitePositive(saved.far)||saved.far<=saved.near)throw new TypeError('Invalid camera snapshot projection.');
    setFocalLength(saved.focalLength);
    // Keep the current viewport aspect. Saved camera framing can be restored
    // after the panel or viewport has changed size.
    resize(aspect,finitePositive(saved.orthoHeight)?saved.orthoHeight:orthoHeight);
    const next=saved.projection==='orthographic'?orthographic:perspective,changed=next!==active;
    settle(()=>{
      active=next;controls.object=active;active.position.fromArray(saved.position);controls.target.fromArray(saved.target);active.up.fromArray(saved.up);
      active.zoom=saved.zoom;active.near=saved.near;active.far=saved.far;active.lookAt(controls.target);
      if(finitePositive(saved.orthographicZoom)&&active!==orthographic)orthographic.zoom=saved.orthographicZoom;
      if(finitePositive(saved.perspectiveZoom)&&active!==perspective)perspective.zoom=saved.perspectiveZoom;
    });
    if(changed)onCameraChange(active);return getState();
  }
  function sync(){active.updateMatrixWorld(true);return getState();}
  return{get camera(){return active;},get projection(){return projection();},get focalLength(){return focalLength;},setProjection,setFocalLength,resize,setView,fitHeight,getState,capture,restore,sync};
}
