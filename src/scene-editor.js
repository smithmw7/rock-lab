import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

export const SCENE_LIMITS=Object.freeze({instances:64,pieces:512,triangles:300000});
export const SCENE_DEFAULTS=Object.freeze({tool:'select',space:'world',snap:false,translationSnap:.25,rotationSnap:15,scaleSnap:.1,renderMode:'shaded',grid:true});
const TOOLS=['select','translate','rotate','scale'],MODES=['shaded','wireframe','collider','normals'];
const SETTING_RANGES={translationSnap:[.01,10],rotationSnap:[1,90],scaleSnap:[.01,2]};
const TRANSFORM_RANGES={position:[-50,50],rotation:[-360,360],scale:[.05,10]};
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const identity=()=>({position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]});

function copyRecipe(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError('Each scene object needs a valid asset recipe.');
  const seen=new Set();
  function visit(item,depth=0){
    if(depth>40)throw new Error('The asset recipe is too deeply nested.');
    if(item===null||typeof item==='string'||typeof item==='boolean')return;
    if(typeof item==='number'){if(!Number.isFinite(item))throw new Error('Asset recipe numbers must be finite.');return;}
    if(typeof item!=='object'||seen.has(item))throw new Error('Asset recipes must contain ordinary JSON values without cycles.');
    if(!Array.isArray(item)&&Object.getPrototypeOf(item)!==Object.prototype&&Object.getPrototypeOf(item)!==null)throw new Error('Asset recipes must contain ordinary JSON objects.');
    seen.add(item);for(const child of Object.values(item))visit(child,depth+1);seen.delete(item);
  }
  visit(value);return JSON.parse(JSON.stringify(value));
}
function transformValues(input={},fallback=identity(),strict=false){
  const result={};
  for(const [key,range] of Object.entries(TRANSFORM_RANGES)){
    const values=input[key]??fallback[key];
    if(!Array.isArray(values)||values.length!==3||!values.every(value=>typeof value==='number'&&Number.isFinite(value)))throw new TypeError(`${key} needs three finite numbers.`);
    if(strict&&values.some(value=>value<range[0]||value>range[1]))throw new RangeError(`${key} is outside the supported scene range.`);
    result[key]=values.map(value=>clamp(value,...range));
  }
  return result;
}
function settingsValues(input={},fallback=SCENE_DEFAULTS,strict=false){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new TypeError('Scene settings must be an object.');
  const result={...fallback};
  for(const [key,allowed] of [['tool',TOOLS],['space',['world','local']],['renderMode',MODES]]){
    if(!(key in input))continue;
    if(!allowed.includes(input[key])){if(strict)throw new Error(`Unsupported scene ${key}.`);continue;}result[key]=input[key];
  }
  for(const key of ['snap','grid'])if(key in input){if(typeof input[key]!=='boolean'){if(strict)throw new Error(`Scene ${key} must be true or false.`);continue;}result[key]=input[key];}
  for(const [key,range] of Object.entries(SETTING_RANGES))if(key in input){
    if(typeof input[key]!=='number'||!Number.isFinite(input[key])){if(strict)throw new Error(`Scene ${key} must be finite.`);continue;}
    if(strict&&(input[key]<range[0]||input[key]>range[1]))throw new RangeError(`Scene ${key} is outside its supported range.`);
    result[key]=clamp(input[key],...range);
  }
  return result;
}
const readableName=(name,fallback='Asset')=>typeof name==='string'&&name.trim()?name.trim().slice(0,100):fallback;
const cleanNumber=value=>Math.round(value*1e8)/1e8||0;
function transformOf(node){return{position:node.position.toArray().map(cleanNumber),rotation:[node.rotation.x,node.rotation.y,node.rotation.z].map(value=>cleanNumber(THREE.MathUtils.radToDeg(value))),scale:node.scale.toArray().map(cleanNumber)};}
function applyTransform(node,transform){node.position.fromArray(transform.position);node.rotation.set(...transform.rotation.map(THREE.MathUtils.degToRad),'XYZ');node.scale.fromArray(transform.scale);node.updateMatrixWorld(true);}

/** Independent placed assets with their own recipe snapshots and transforms.
 * buildInstance is synchronous and must reject invalid recipes. Its returned
 * Group belongs to this editor until disposeInstance is called. The optional
 * disposer lets the application release its procedural uniforms and textures;
 * the fallback releases only unique geometries/materials, not shared textures.
 */
export function createSceneEditor({scene,camera,domElement,orbitControls,buildInstance,disposeInstance,onChange=()=>{},onSelect=()=>{},onMessage=()=>{},onFrame=()=>{}}){
  if(!scene?.isScene||!camera?.isCamera||!domElement?.addEventListener||typeof buildInstance!=='function')throw new TypeError('Scene editor requires a scene, camera, canvas, and asset builder.');
  const root=new THREE.Group();root.name='Scene editor placed assets';root.visible=false;root.userData.sceneEditorRoot=true;scene.add(root);
  const grid=new THREE.GridHelper(100,100,0x768893,0x394b56);grid.name='Scene editor world-unit grid';grid.position.y=.008;grid.visible=false;grid.userData.sceneEditorHelper=true;grid.renderOrder=1;scene.add(grid);
  const selectedBox=new THREE.Box3(),selectionHelper=new THREE.Box3Helper(selectedBox,0xf4c983);selectionHelper.name='Selected object bounds';selectionHelper.visible=false;selectionHelper.userData.sceneEditorHelper=true;selectionHelper.renderOrder=9;selectionHelper.material.depthTest=false;selectionHelper.material.transparent=true;selectionHelper.material.opacity=.9;scene.add(selectionHelper);
  const originalTouchAction=domElement.style.touchAction;
  const gizmo=new TransformControls(camera,domElement),gizmoHelper=gizmo.getHelper();gizmoHelper.name='Scene transform gizmo';gizmoHelper.userData.sceneEditorHelper=true;gizmo.enabled=false;gizmoHelper.visible=false;gizmo.setSize(.86);scene.add(gizmoHelper);
  for(const axis of ['X','Y','Z']){gizmo[`min${axis}`]=-50;gizmo[`max${axis}`]=50;}
  const wireMaterial=new THREE.MeshBasicMaterial({color:0xc9dee8,wireframe:true});wireMaterial.name='Scene wireframe diagnostic';
  const normalMaterial=new THREE.MeshNormalMaterial();normalMaterial.name='Scene geometry normal diagnostic';
  const colliderMaterial=new THREE.MeshBasicMaterial({color:0x57d7b2,transparent:true,opacity:.23,depthWrite:false,side:THREE.DoubleSide});colliderMaterial.name='Scene convex collider volume';
  const colliderEdgeMaterial=new THREE.LineBasicMaterial({color:0x86efd0,transparent:true,opacity:.85});colliderEdgeMaterial.name='Scene convex collider edges';
  const records=new Map(),document=domElement.ownerDocument,raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),activePointers=new Set();
  let settings={...SCENE_DEFAULTS},active=false,selectedId=null,destroyed=false,serial=0,notifying=false,dragOrbitState=null,pointerStart=null;

  const say=text=>onMessage(text);
  const selected=()=>records.get(selectedId)??null;
  function totals(list=records.values()){const values=[...list];return{instances:values.length,pieces:values.reduce((n,record)=>n+record.pieces,0),triangles:values.reduce((n,record)=>n+record.triangles,0)};}
  function withinBudget(values){for(const key of Object.keys(SCENE_LIMITS))if(values[key]>SCENE_LIMITS[key])throw new Error(`Scene limit reached: ${SCENE_LIMITS[key].toLocaleString()} ${key}. Remove an object or use a simpler asset.`);}
  function objectSnapshot(record){return{id:record.id,name:record.name,recipe:copyRecipe(record.recipe),...transformOf(record.node),pieces:record.pieces,triangles:record.triangles};}
  function getSnapshot(){return{active,selectedId,selection:selected()?objectSnapshot(selected()):null,objects:[...records.values()].map(objectSnapshot),settings:{...settings},budgets:{...SCENE_LIMITS},...totals(),dragging:gizmo.dragging};}
  function notify(){if(destroyed||notifying)return;notifying=true;try{onChange(getSnapshot());}finally{notifying=false;}}
  function restoreOrbit(){if(dragOrbitState!==null&&orbitControls){orbitControls.enabled=dragOrbitState;dragOrbitState=null;}}
  function stopDrag(){if(gizmo.dragging)gizmo.dragging=false;restoreOrbit();pointerStart=null;activePointers.clear();}
  function updateSelection(){
    const record=selected();selectionHelper.visible=active&&!!record;
    if(record){record.node.updateWorldMatrix(true,true);selectedBox.setFromObject(record.content);selectionHelper.updateMatrixWorld(true);}
    if(active&&record&&settings.tool!=='select'){
      if(gizmo.object!==record.node)gizmo.attach(record.node);
      gizmo.enabled=true;gizmoHelper.visible=true;
    }else{gizmo.detach();gizmo.enabled=false;gizmoHelper.visible=false;}
  }
  function select(id){
    if(id!==null&&!records.has(id))return false;
    if(id===selectedId){updateSelection();return true;}
    stopDrag();selectedId=id;updateSelection();onSelect(id,selected()?objectSnapshot(selected()):null);notify();return true;
  }
  function restoreMaterials(record){for(const entry of record.meshes){entry.mesh.material=entry.material;entry.mesh.visible=entry.visible;}}
  function releaseDebug(record){
    if(record.colliderGroup){record.colliderGroup.removeFromParent();for(const geometry of record.debugGeometries)geometry.dispose();record.colliderGroup=null;record.debugGeometries.clear();}
  }
  function releaseRecord(record){
    if(!record)return;restoreMaterials(record);releaseDebug(record);record.node.removeFromParent();
    if(disposeInstance){disposeInstance(record.content,record.recipe);return;}
    const geometries=new Set(),materials=new Set();record.content.traverse(mesh=>{if(mesh.isMesh){geometries.add(mesh.geometry);for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])materials.add(material);}});
    for(const geometry of geometries)geometry?.dispose();for(const material of materials)material?.dispose();
  }
  function createRecord(recipe,{id,name,transform}={}){
    const snapshot=copyRecipe(recipe),pose=transformValues(transform),content=buildInstance(copyRecipe(snapshot));
    if(!content?.isGroup||content.parent)throw new TypeError('Asset builder must return a new, unattached owned Group.');
    const node=new THREE.Group(),record={id:id??`scene-${++serial}-${THREE.MathUtils.generateUUID().slice(0,8)}`,name:readableName(name,readableName(content.name,'Asset')),recipe:snapshot,node,content,meshes:[],pieces:0,triangles:0,colliderGroup:null,debugGeometries:new Set()};
    node.name=record.name;node.userData.sceneInstanceId=record.id;content.userData.sceneContent=true;node.add(content);applyTransform(node,pose);
    try{
      content.traverse(mesh=>{
        if(!mesh.isMesh)return;
        const geometry=mesh.geometry,position=geometry?.attributes.position;
        if(!position||position.count<3||!position.array.every(Number.isFinite))throw new Error('An asset contains invalid mesh positions.');
        const triangleCount=(geometry.index?.count??position.count)/3;if(!Number.isInteger(triangleCount))throw new Error('An asset has an incomplete triangle.');
        record.meshes.push({mesh,material:mesh.material,visible:mesh.visible});record.pieces++;record.triangles+=triangleCount;
      });
      if(!record.pieces)throw new Error('An asset recipe did not produce any meshes.');
      withinBudget({instances:1,pieces:record.pieces,triangles:record.triangles});
      const bounds=new THREE.Box3().setFromObject(content);
      if(bounds.isEmpty()||!bounds.min.toArray().concat(bounds.max.toArray()).every(Number.isFinite))throw new Error('An asset has invalid bounds.');
      return record;
    }catch(error){releaseRecord(record);throw error;}
  }
  function prepareCollider(record){
    if(record.colliderGroup)return;
    const group=new THREE.Group(),geometries=new Set(),cache=new Map();group.name='Actual per-mesh convex hulls';group.userData.sceneColliderGroup=true;group.visible=false;
    record.node.updateWorldMatrix(true,true);const inverse=new THREE.Matrix4().copy(record.node.matrixWorld).invert();
    try{
      for(const {mesh} of record.meshes){
        let entry=cache.get(mesh.geometry);
        if(!entry){
          const positions=mesh.geometry.attributes.position,seen=new Set(),points=[];
          for(let i=0;i<positions.count;i++){
            const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i),key=`${x},${y},${z}`;
            if(!seen.has(key)){seen.add(key);points.push(new THREE.Vector3(x,y,z));}
          }
          if(points.length<4)throw new Error('A mesh does not have enough points for a solid convex collider.');
          const hull=new ConvexGeometry(points);hull.userData.sceneColliderShape='convexHull';geometries.add(hull);
          if(!hull.attributes.position?.count)throw new Error('A flat mesh cannot form a solid convex collider.');
          const edges=new THREE.EdgesGeometry(hull,1);geometries.add(edges);entry={hull,edges};cache.set(mesh.geometry,entry);
        }
        mesh.updateWorldMatrix(true,false);const transform=inverse.clone().multiply(mesh.matrixWorld);
        const volume=new THREE.Mesh(entry.hull,colliderMaterial);volume.name=`Convex hull: ${mesh.name}`;volume.applyMatrix4(transform);
        volume.userData={sceneCollider:true,sourceMeshUuid:mesh.uuid,sourceGeometryUuid:mesh.geometry.uuid,sceneInstanceId:record.id};
        const lines=new THREE.LineSegments(entry.edges,colliderEdgeMaterial);lines.name=`Convex edges: ${mesh.name}`;lines.applyMatrix4(transform);lines.userData.sceneColliderEdges=true;
        group.add(volume,lines);
      }
      record.node.add(group);record.colliderGroup=group;record.debugGeometries=geometries;
    }catch(error){for(const geometry of geometries)geometry.dispose();throw error;}
  }
  function applyRenderMode(record){
    restoreMaterials(record);if(record.colliderGroup)record.colliderGroup.visible=false;
    if(settings.renderMode==='collider'){
      prepareCollider(record);record.colliderGroup.visible=true;for(const entry of record.meshes)entry.mesh.visible=false;
    }else if(settings.renderMode==='wireframe'||settings.renderMode==='normals'){
      for(const entry of record.meshes)entry.mesh.material=settings.renderMode==='wireframe'?wireMaterial:normalMaterial;
    }
  }
  function applySettings(){
    gizmo.setMode(settings.tool==='select'?'translate':settings.tool);gizmo.setSpace(settings.space);
    gizmo.setTranslationSnap(settings.snap?settings.translationSnap:null);gizmo.setRotationSnap(settings.snap?THREE.MathUtils.degToRad(settings.rotationSnap):null);gizmo.setScaleSnap(settings.snap?settings.scaleSnap:null);
    grid.visible=active&&settings.grid;for(const record of records.values())applyRenderMode(record);updateSelection();
  }
  function updateSettings(input){
    if(destroyed)return false;
    let next;try{next=settingsValues(input,settings);if(next.renderMode==='collider')for(const record of records.values())prepareCollider(record);}catch(error){say(error.message);return false;}
    stopDrag();settings=next;applySettings();notify();return true;
  }
  function add(recipe,options={}){
    if(destroyed)return null;let record;
    try{record=createRecord(recipe,{name:options.name,transform:options.transform});withinBudget(totals([...records.values(),record]));if(settings.renderMode==='collider')prepareCollider(record);}
    catch(error){if(record)releaseRecord(record);say(error.message);return null;}
    records.set(record.id,record);root.add(record.node);applyRenderMode(record);
    if(options.select!==false)select(record.id);else notify();return record.id;
  }
  function replaceSelected(recipe){
    const previous=selected();if(!previous||destroyed)return false;let record;
    try{
      record=createRecord(recipe,{id:previous.id,name:previous.name,transform:transformOf(previous.node)});
      withinBudget(totals([...records.values()].filter(value=>value!==previous).concat(record)));
      if(settings.renderMode==='collider')prepareCollider(record);
    }catch(error){if(record)releaseRecord(record);say(error.message);return false;}
    stopDrag();gizmo.detach();records.set(record.id,record);root.add(record.node);releaseRecord(previous);applyRenderMode(record);updateSelection();onSelect(record.id,objectSnapshot(record));notify();return true;
  }
  function duplicateSelected(){
    const record=selected();if(!record)return null;
    const transform=transformOf(record.node);transform.position[0]=clamp(transform.position[0]+.5,-50,50);transform.position[2]=clamp(transform.position[2]+.5,-50,50);
    return add(record.recipe,{name:`${record.name} copy`,transform});
  }
  function deleteSelected(){
    const record=selected();if(!record||destroyed)return false;stopDrag();gizmo.detach();records.delete(record.id);selectedId=null;releaseRecord(record);updateSelection();onSelect(null,null);notify();return true;
  }
  function setTransform(input){
    const record=selected();if(!record||destroyed)return false;
    try{
      const transform=transformValues(input,transformOf(record.node));
      applyTransform(record.node,transform);updateSelection();notify();return true;
    }catch(error){say(error.message);return false;}
  }
  function renameSelected(name){const record=selected();if(!record||typeof name!=='string'||!name.trim())return false;record.name=readableName(name);record.node.name=record.name;notify();return true;}
  function updateSelectedRecipe(recipe){const record=selected();if(!record||destroyed)return false;try{record.recipe=copyRecipe(recipe);notify();return true;}catch(error){say(error.message);return false;}}
  function setActive(value){if(destroyed)return;active=Boolean(value);if(!active)stopDrag();root.visible=active;applySettings();notify();}
  function serialize(){return{version:1,selectedId,objects:[...records.values()].map(record=>{const{id,name,recipe,position,rotation,scale}=objectSnapshot(record);return{id,name,recipe,position,rotation,scale};}),settings:{...settings}};}
  function load(data){
    if(destroyed)throw new Error('The scene editor is closed.');
    if(!data||typeof data!=='object'||data.version!==1||!Array.isArray(data.objects))throw new Error('Unsupported scene file.');
    if(data.objects.length>SCENE_LIMITS.instances)throw new Error(`Scene limit reached: ${SCENE_LIMITS.instances} instances.`);
    const nextSettings=settingsValues(data.settings??{},SCENE_DEFAULTS,true),ids=new Set(),specs=[];
    for(const item of data.objects){
      if(!item||typeof item!=='object'||typeof item.id!=='string'||!item.id||item.id.length>160||ids.has(item.id))throw new Error('Scene object IDs must be unique nonempty strings.');ids.add(item.id);
      if(typeof item.name!=='string'||!item.name.trim()||item.name.length>100)throw new Error('Scene objects need valid names of up to 100 characters.');
      for(const key of ['position','rotation','scale'])if(!(key in item))throw new Error(`Scene object ${item.name} is missing ${key}.`);
      specs.push({recipe:copyRecipe(item.recipe),id:item.id,name:item.name,transform:transformValues(item,identity(),true)});
    }
    if(data.selectedId!==undefined&&data.selectedId!==null&&(typeof data.selectedId!=='string'||!ids.has(data.selectedId)))throw new Error('The selected scene object does not exist.');
    // Nothing in the current scene, including its selection and display mode,
    // changes until every incoming object has built and passed the total cap.
    const staged=[];
    try{
      for(const spec of specs){const record=createRecord(spec.recipe,spec);staged.push(record);withinBudget(totals(staged));if(nextSettings.renderMode==='collider')prepareCollider(record);}
    }catch(error){for(const record of staged)releaseRecord(record);throw error;}
    stopDrag();gizmo.detach();for(const record of records.values())releaseRecord(record);records.clear();
    for(const record of staged){records.set(record.id,record);root.add(record.node);}
    selectedId=data.selectedId===undefined?(staged[0]?.id??null):data.selectedId;settings=nextSettings;applySettings();onSelect(selectedId,selected()?objectSnapshot(selected()):null);notify();return true;
  }
  function getBounds(selection=false){
    const bounds=new THREE.Box3();root.updateWorldMatrix(true,true);
    if(selection){const record=selected();if(record)bounds.setFromObject(record.content);}
    else for(const record of records.values())bounds.union(new THREE.Box3().setFromObject(record.content));
    return bounds;
  }
  function pick(clientX,clientY){
    const bounds=domElement.getBoundingClientRect();if(!bounds.width||!bounds.height)return;
    pointer.set((clientX-bounds.left)/bounds.width*2-1,-(clientY-bounds.top)/bounds.height*2+1);camera.updateMatrixWorld();root.updateMatrixWorld(true);raycaster.setFromCamera(pointer,camera);
    const targets=[];
    for(const record of records.values()){
      if(settings.renderMode==='collider')record.colliderGroup?.traverse(mesh=>{if(mesh.userData.sceneCollider)targets.push(mesh);});
      else for(const entry of record.meshes)if(entry.visible)targets.push(entry.mesh);
    }
    const hit=raycaster.intersectObjects(targets,false)[0];let object=hit?.object;
    while(object&&!object.userData.sceneInstanceId)object=object.parent;
    select(object?.userData.sceneInstanceId??null);
  }
  const onPointerDown=event=>{
    if(!active||event.button!==0)return;
    activePointers.add(event.pointerId);if(activePointers.size!==1){pointerStart=null;return;}
    pointerStart={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false,gizmo:gizmo.dragging||!!(gizmo.enabled&&gizmo.axis)};
  };
  const onPointerMove=event=>{if(pointerStart&&pointerStart.id===event.pointerId&&Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)>5)pointerStart.moved=true;};
  const onPointerUp=event=>{
    activePointers.delete(event.pointerId);
    const start=pointerStart;pointerStart=null;
    if(!active||!start||start.id!==event.pointerId||start.moved||start.gizmo||gizmo.dragging||Math.hypot(event.clientX-start.x,event.clientY-start.y)>5)return;
    pick(event.clientX,event.clientY);
  };
  const onPointerCancel=event=>{activePointers.delete(event.pointerId);pointerStart=null;stopDrag();};
  const onKeyDown=event=>{
    if(!active||event.defaultPrevented||event.altKey)return;
    const target=event.target;if(target?.closest?.('input,textarea,select,[contenteditable="true"],[role="textbox"]'))return;
    const key=event.key.toLowerCase();
    if((event.ctrlKey||event.metaKey)&&key==='d'){event.preventDefault();duplicateSelected();return;}
    if(event.ctrlKey||event.metaKey)return;
    const tool={q:'select',w:'translate',e:'rotate',r:'scale'}[key];
    if(tool){event.preventDefault();updateSettings({tool});}
    else if(key==='f'){event.preventDefault();onFrame(true);}
    else if(key==='delete'||key==='backspace'){event.preventDefault();deleteSelected();}
  };
  const onDragging=event=>{if(event.value){if(orbitControls&&dragOrbitState===null){dragOrbitState=orbitControls.enabled;orbitControls.enabled=false;}}else restoreOrbit();};
  const onObjectChange=()=>{
    const record=selected();if(!active||!record)return;
    const transform=transformValues(transformOf(record.node));applyTransform(record.node,transform);updateSelection();notify();
  };
  gizmo.addEventListener('dragging-changed',onDragging);gizmo.addEventListener('objectChange',onObjectChange);
  domElement.addEventListener('pointerdown',onPointerDown);domElement.addEventListener('pointermove',onPointerMove);domElement.addEventListener('pointerup',onPointerUp);domElement.addEventListener('pointercancel',onPointerCancel);document.addEventListener('keydown',onKeyDown);
  function destroy(){
    if(destroyed)return;stopDrag();active=false;gizmo.detach();gizmo.removeEventListener('dragging-changed',onDragging);gizmo.removeEventListener('objectChange',onObjectChange);gizmo.dispose();domElement.style.touchAction=originalTouchAction;gizmoHelper.removeFromParent();
    domElement.removeEventListener('pointerdown',onPointerDown);domElement.removeEventListener('pointermove',onPointerMove);domElement.removeEventListener('pointerup',onPointerUp);domElement.removeEventListener('pointercancel',onPointerCancel);document.removeEventListener('keydown',onKeyDown);
    for(const record of records.values())releaseRecord(record);records.clear();root.removeFromParent();grid.removeFromParent();grid.geometry.dispose();for(const material of Array.isArray(grid.material)?grid.material:[grid.material])material.dispose();selectionHelper.removeFromParent();selectionHelper.geometry.dispose();selectionHelper.material.dispose();
    for(const material of [wireMaterial,normalMaterial,colliderMaterial,colliderEdgeMaterial])material.dispose();destroyed=true;
  }
  return{setActive,add,replaceSelected,select,duplicateSelected,deleteSelected,setTool:tool=>updateSettings({tool}),updateSettings,setTransform,renameSelected,updateSelectedRecipe,serialize,load,getSnapshot,getRoot:()=>root,getBounds,
    getSelected:()=>{const record=selected();return record?{id:record.id,name:record.name,group:record.content,node:record.node,recipe:copyRecipe(record.recipe)}:null;},
    getTransformControls:()=>gizmo,getSelectionHelper:()=>selectionHelper,step:()=>{if(active&&!destroyed)updateSelection();},destroy};
}
