import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildAsset, disposeAsset } from './geometry.js';
import { createRockMaterial, updateRockMaterial } from './material.js';
import { createGround, ASPHALT_DEFAULTS } from './ground.js';
import { normalizeGroundId } from './ground-catalog.js';
import { LIGHTING_PRESETS } from './lighting.js';
import { OPTICAL_DEFAULTS, OPTICAL_PRESETS } from './optical.js';
import { defaults, shapes, shapeGroups, shapeGroupFor, surfaces, grounds, looks } from './catalog.js';
import { createFractureLab, FRACTURE_DEFAULTS, sanitizeFractureOptions } from './fracture.js';
import { createFracturePanel } from './fracture-panel.js';
import { createRockAudio } from './audio.js';
import { setupMenus } from './menu.js';
import { setupParameterTooltips } from './tooltips.js';
import { createObjectLibrary } from './library.js';
import { WORKSHOP_DEFAULTS, WORKSHOP_RANGES, WORKSHOP_SHAPES, sanitizeWorkshopOptions } from './workshop-geometry.js';
import { WORKSHOP_MATERIAL_DEFAULTS, WORKSHOP_MATERIAL_RANGES, WORKSHOP_MATERIAL_FIELDS, WOOD_PATTERNS } from './workshop-materials.js';
import { createLatheEditor } from './lathe-editor.js';
import { PATH_DEFAULTS, PATH_RANGES, PATH_SHAPES, sanitizePathOptions } from './path-geometry.js';
import { createPathEditor } from './path-editor.js';
import { createSceneEditor } from './scene-editor.js';
import { createScenePanel } from './scene-ui.js';
import { SCENE_PRESETS, createScenePreset } from './scene-presets.js';
import { createSceneGallery } from './scene-gallery.js';
import './style.css';
import './menu.css';
import './library.css';
import './workshop.css';
import './workshop-materials.css';
import './path.css';
import './ground-styles.css';
import './studio.css';

const tintDefaults={tint:'#ffffff',tintAmount:0};
const state={...defaults,...ASPHALT_DEFAULTS,...OPTICAL_DEFAULTS,...WORKSHOP_DEFAULTS,...WORKSHOP_MATERIAL_DEFAULTS,...structuredClone(PATH_DEFAULTS),...tintDefaults};
const isPath=()=>PATH_SHAPES.has(state.shape);
const effectiveShape=()=>state.shape==='objectPath'?state.pathObject:state.shape;
let soundFamily='auto',pendingAudioUnlock=null;
const soundForSurface=surface=>surfaces[surface]?.family==='wood'?'wood':surfaces[surface]?.family==='ceramic'?'concrete':['ice','obsidian','glass','quartz','frozenGlass'].includes(surface)?'glass':['block','brick','wall'].includes(state.shape)?'concrete':'rock';
const getSoundFamily=(slot='primary')=>soundFamily!=='auto'?soundFamily:soundForSurface(slot==='primary'?state.surface:partStates[slot]?.outer.surface??state.surface);
const audio=createRockAudio({onChange:status=>syncAudio(status)});
function syncAudio(status=audio.getState()){
  const toggle=document.querySelector('#sound-toggle');
  toggle.querySelector('.sound-label').textContent=status.muted?'Sound off':'Sound on';
  toggle.setAttribute('aria-pressed',String(status.muted));
  toggle.setAttribute('aria-label',status.muted?'Unmute sound effects':'Mute sound effects');
  document.querySelector('#sfx-volume').value=status.volume;
  document.querySelector('#sfx-volume-value').value=`${Math.round(status.volume*100)}%`;
  const familyName={rock:'Rock',concrete:'Concrete',glass:'Glass',wood:'Wood'}[getSoundFamily()];
  document.querySelector('#sfx-status').textContent=status.error||status.failed? 'Some sounds could not load. Reload to retry.' :status.loaded<status.expected?'Loading sound effects…':`${familyName} breaks · softer debris impacts${status.muted?' · muted':''}`;
}
function unlockAudio(){
  const pending=Promise.resolve(audio.unlock()).catch(()=>{message('Click Sound on to enable sound effects.');return false;});
  pendingAudioUnlock=pending;
  pending.then(()=>{if(pendingAudioUnlock===pending)pendingAudioUnlock=null;});
  return pending;
}
document.querySelector('#sound-toggle').addEventListener('click',()=>{audio.setMuted(!audio.getState().muted);if(!audio.getState().muted)unlockAudio();});
document.querySelector('#sfx-volume').addEventListener('input',event=>{audio.setVolume(Number(event.target.value));if(Number(event.target.value)>0)unlockAudio();});
document.querySelector('#sfx-family').addEventListener('change',event=>{soundFamily=event.target.value;syncAudio();});
function handleFractureEvent(event){
  if(event.type==='break'){
    const family=getSoundFamily(event.materialSlot),status=audio.getState();
    // The first cut can finish before its native gesture resume resolves.
    // Only the sound waits; stop/mute invalidate the unlock's generation so
    // reset, disable, and regeneration cannot replay an obsolete break.
    if(pendingAudioUnlock&&(!status.unlocked||status.contextState!=='running'))pendingAudioUnlock.then(ready=>{
      if(ready&&fractureRequested&&fractureController?.getStats().enabled)audio.playBreak(family);
    });
    else audio.playBreak(family);
  }
  if(event.type==='collision')audio.playCollision(getSoundFamily(event.materialSlot),event.strength,event.pieceId);
}
const materialKeys=['surface','materialRoughness','contrast','snow','noiseScale','noiseAmount','normalStrength','detail','mapView','tint','tintAmount',...Object.keys(OPTICAL_DEFAULTS),...Object.keys(WORKSHOP_MATERIAL_DEFAULTS)];
const innerDefaults={...Object.fromEntries(materialKeys.map(key=>[key,state[key]])),surface:'limestone',materialRoughness:.93,snow:0,noiseAmount:.4,normalStrength:.25,tint:'#c9b99d',tintAmount:.12};
const innerState={...innerDefaults};
const baseMaterialState=Object.fromEntries(materialKeys.map(key=>[key,state[key]]));
const makePartState=surface=>({...baseMaterialState,...WORKSHOP_MATERIAL_DEFAULTS,...surfaces[surface].defaults,surface,materialRoughness:surfaces[surface].roughness,snow:0});
const partStates={handle:{outer:makePartState('oak'),inner:makePartState('oak')},trim:{outer:makePartState('brass'),inner:makePartState('brass')}};
let materialSlot='primary';
let materialTarget='outer',fractureController=null,fractureLoading=null,fractureRequested=false,fracturePanel=null;
let fractureOptions=sanitizeFractureOptions(FRACTURE_DEFAULTS);
const currentMaterialState=()=>materialSlot==='primary'?(materialTarget==='inner'?innerState:state):partStates[materialSlot][materialTarget];
let inspector='shape', viewMode='single', selectedLook='alpine';
let materialFamily='rock';
const materialFamilyFor=surface=>surfaces[surface]?.family||(Object.hasOwn(OPTICAL_PRESETS,surface)?'optical':'rock');
let rotation=false,lastGeneration=0,generationCount=0,pendingGenerate=0,frameSize=5.4,toastTimer;
let assets=[];
let pathFrameBounds=null,sceneFrameBounds=null;
let workspaceMode='object',sceneEditor=null,scenePanel=null,objectDraft=null,sceneCamera=null,sceneEnvironment=null,sceneInitialized=false,loadingSceneSelection=false;
const inScene=()=>workspaceMode==='scene';
let sceneGallery=null,activeScenePreset=null,galleryBackup=null,galleryBusy=false,recipeLoading=false;
const stage=document.querySelector('#stage');
const scene=new THREE.Scene();
scene.background=new THREE.Color('#151d25');
scene.fog=new THREE.Fog('#151d25',19,38);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.75));
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.1;
renderer.transmissionResolutionScale=.75;
stage.prepend(renderer.domElement);
renderer.domElement.setAttribute('aria-label','Interactive 3D procedural asset preview');
const camera=new THREE.OrthographicCamera(-5,5,4,-4,.1,100);
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.dampingFactor=.08;
const turntableSpeed=.24;
controls.autoRotateSpeed=turntableSpeed*60/(Math.PI*2);
controls.maxPolarAngle=Math.PI*.49;controls.minPolarAngle=Math.PI*.08;
controls.minZoom=.45;controls.maxZoom=3;controls.enablePan=true;
const hemi=new THREE.HemisphereLight('#c5d7ef','#353440',.85);scene.add(hemi);
const key=new THREE.DirectionalLight('#ffe5bf',2.7);
key.position.set(-4,7,5);key.castShadow=true;key.shadow.mapSize.set(2048,2048);
key.shadow.camera.left=key.shadow.camera.bottom=-12;
key.shadow.camera.right=key.shadow.camera.top=12;
key.shadow.camera.near=.1;key.shadow.camera.far=35;
key.shadow.normalBias=.018;key.shadow.bias=-.00015;key.shadow.radius=4;scene.add(key);
const rim=new THREE.DirectionalLight('#789bdc',1.9);rim.position.set(4,3,-4);scene.add(rim);
const fill=new THREE.DirectionalLight('#a0bcd5',.6);fill.position.set(2,2,5);scene.add(fill);
const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();
const environment=pmrem.fromScene(room,.025);
scene.environment=environment.texture;scene.environmentIntensity=.7;
room.dispose();pmrem.dispose();
const ground=createGround(renderer,scene,state);scene.add(ground.group);
const assembly=new THREE.Group();scene.add(assembly);
const material=createRockMaterial(state);
const innerMaterial=createRockMaterial({...innerState,seed:state.seed,fractureInterior:true});
const partMaterials=Object.fromEntries(Object.entries(partStates).map(([slot,pair])=>[slot,{outer:createRockMaterial({...pair.outer,seed:state.seed}),inner:createRockMaterial({...pair.inner,seed:state.seed,fractureInterior:true})}]));
const primaryMaterialPairs={primary:{outer:material,inner:innerMaterial},...partMaterials};
const variationMaterials=new Map(),meshMaterialPairs=new WeakMap();
const flattenMaterialPairs=pairs=>Object.values(pairs).flatMap(pair=>[pair.outer,pair.inner]);
const allMaterials=()=>[...flattenMaterialPairs(primaryMaterialPairs),...[...variationMaterials.values()].flatMap(flattenMaterialPairs)];
function updateMaterialPairs(pairs,seed){
  const options={primary:{outer:state,inner:innerState},...partStates};
  for(const [slot,pair] of Object.entries(pairs))for(const side of ['outer','inner'])updateRockMaterial(pair[side],{...options[slot][side],seed,fractureInterior:side==='inner'});
}
function createVariationMaterials(seed){
  const options={primary:{outer:state,inner:innerState},...partStates};
  const pairs=Object.fromEntries(Object.entries(options).map(([slot,pair])=>[slot,Object.fromEntries(['outer','inner'].map(side=>{
    const mat=createRockMaterial({...pair[side],seed,fractureInterior:side==='inner'});mat.wireframe=material.wireframe;return[side,mat];
  }))]));
  variationMaterials.set(seed,pairs);return pairs;
}
function updateMaterials(){
  if(inScene()){updateSceneMaterials();return;}
  updateMaterialPairs(primaryMaterialPairs,state.seed);
  for(const [seed,pairs] of variationMaterials)updateMaterialPairs(pairs,seed);
}
function materialsForMesh(mesh){
  const pairs=meshMaterialPairs.get(mesh)??primaryMaterialPairs;
  const pair=pairs[mesh.userData.materialSlot]??pairs.primary;
  return pair?{outerMaterial:pair.outer,innerMaterial:pair.inner}:{outerMaterial:material,innerMaterial};
}
function applySurface(target,id){
  target.surface=id;target.materialRoughness=surfaces[id].roughness;
  Object.assign(target,WORKSHOP_MATERIAL_DEFAULTS,surfaces[id].defaults);
  if(OPTICAL_PRESETS[id])Object.assign(target,OPTICAL_DEFAULTS,OPTICAL_PRESETS[id]);
}
const variationSeed=(index)=>((state.seed-1+index*137)%999999)+1;
const specs=[
  ...Object.entries({pathWidth:'Path width',pathSpacing:'Piece gap',pathPieceSize:'Piece size',pathThickness:'Piece thickness',pathSmoothness:'Curve smoothness',pathOffset:'Lateral offset',pathJitter:'Shape variation',pathRotation:'Random rotation',pathObjectScale:'Object scale'}).map(([key,label])=>({key,label,parent:key==='pathObjectScale'?'path-object-controls':['pathJitter','pathRotation'].includes(key)?'path-variation-controls':'path-layout-controls',kind:'geometry',min:PATH_RANGES[key][0],max:PATH_RANGES[key][1],step:.01,format:['pathJitter','pathRotation','pathSmoothness'].includes(key)?undefined:key==='pathObjectScale'?'preciseScale':'units'})),
  {key:'facets',label:'Plane cuts',parent:'geometry-controls',kind:'geometry'},
  {key:'roughness',label:'Irregularity',parent:'geometry-controls',kind:'geometry'},
  {key:'bevel',label:'Chipped edges',parent:'geometry-controls',kind:'geometry'},
  {key:'displacement',label:'Displacement',parent:'displacement-controls',kind:'geometry'},
  {key:'geometryNoiseScale',label:'Shape noise scale',parent:'displacement-controls',kind:'geometry',min:.3,max:8,step:.1,format:'scale'},
  {key:'tintAmount',label:'Tint amount',parent:'finish-controls',kind:'material'},
  {key:'materialRoughness',label:'Surface roughness',parent:'finish-controls',kind:'material'},
  {key:'contrast',label:'Color contrast',parent:'finish-controls',kind:'material'},
  {key:'snow',label:'Snow dusting',parent:'finish-controls',kind:'material'},
  {key:'noiseScale',label:'Texture noise scale',parent:'noise-controls',kind:'material',min:.3,max:8,step:.1,format:'scale'},
  {key:'noiseAmount',label:'Noise amount',parent:'noise-controls',kind:'material'},
  {key:'normalStrength',label:'Normal relief',parent:'noise-controls',kind:'material'},
  {key:'detail',label:'Cracks & grain',parent:'noise-controls',kind:'material'},
  {key:'transmission',label:'Transmission',parent:'optical-refraction-controls',kind:'material'},
  {key:'ior',label:'Refraction index (IOR)',parent:'optical-refraction-controls',kind:'material',min:1,max:2.333,step:.001,format:'number'},
  {key:'thickness',label:'Optical thickness',parent:'optical-refraction-controls',kind:'material',min:0,max:4,step:.05,format:'units'},
  {key:'attenuationDistance',label:'Absorption distance',parent:'optical-color-controls',kind:'material',min:.1,max:10,step:.05,format:'units'},
  {key:'dispersion',label:'Color dispersion',parent:'optical-color-controls',kind:'material'},
  {key:'iridescence',label:'Iridescent sheen',parent:'optical-color-controls',kind:'material'},
  {key:'cloudiness',label:'Cloudiness',parent:'optical-volume-controls',kind:'material'},
  {key:'inclusions',label:'Mineral inclusions',parent:'optical-volume-controls',kind:'material'},
  {key:'inclusionScale',label:'Inclusion scale',parent:'optical-volume-controls',kind:'material',min:.5,max:8,step:.1,format:'preciseScale'},
  {key:'internalCracks',label:'Internal cracks',parent:'optical-volume-controls',kind:'material'},
  {key:'asphaltRoughness',label:'Asphalt roughness',parent:'asphalt-finish-controls',kind:'ground'},
  {key:'asphaltRoughnessVariation',label:'Roughness breakup',parent:'asphalt-finish-controls',kind:'ground'},
  {key:'asphaltNormalStrength',label:'Normal strength',parent:'asphalt-normal-controls',kind:'ground',min:0,max:2,step:.01,format:'preciseScale'},
  {key:'asphaltNoiseScale',label:'Normal detail scale',parent:'asphalt-normal-controls',kind:'ground',min:.25,max:4,step:.05,format:'preciseScale'},
  {key:'asphaltReflectionDistortion',label:'Reflection distortion',parent:'asphalt-normal-controls',kind:'ground'},
  {key:'asphaltRippleStrength',label:'Puddle ripples',parent:'asphalt-normal-controls',kind:'ground'},
  {key:'asphaltRippleSpeed',label:'Ripple speed',parent:'asphalt-normal-controls',kind:'ground',min:0,max:2,step:.05,format:'preciseScale'},
  {key:'reflection',label:'Reflection strength',parent:'ground-controls',kind:'ground'},
  {key:'groundWetness',label:'Wetness',parent:'ground-controls',kind:'ground'},
  {key:'groundScale',label:'Ground texture scale',parent:'ground-controls',kind:'ground',min:.3,max:4,step:.1,format:'scale'},
  ...Object.entries({handleLength:'Handle length',headScale:'Head / blade size',wallThickness:'Wall thickness',latheHeight:'Height',latheWidth:'Width',latheBelly:'Belly width',latheNeck:'Neck width',latheLip:'Lip width',latheSegments:'Radial segments',profileSmoothness:'Spline smoothness'}).map(([key,label])=>({key,label,parent:['handleLength','headScale'].includes(key)?'composite-controls':'lathe-controls',kind:'geometry',min:WORKSHOP_RANGES[key][0],max:WORKSHOP_RANGES[key][1],step:key==='latheSegments'?1:.01,format:key==='latheSegments'?'integer':key==='wallThickness'?'units':key==='profileSmoothness'?undefined:'preciseScale'})),
  ...Object.entries({metalBrushing:'Brushing',metalWear:'Metal wear',woodGrainScale:'Grain scale',woodGrainStrength:'Grain strength',woodVariation:'Grain variation',woodKnots:'Knots',woodSpiral:'Spiral curl',woodCracks:'Heavy cracks',woodBark:'Bark coverage',woodRelief:'Raised grain',woodWarmth:'Wood warmth',ceramicGlaze:'Glaze coat',ceramicSpeckle:'Clay speckles'}).map(([key,label])=>({key,label,parent:key.startsWith('metal')?'metal-controls':key.startsWith('wood')?'wood-controls':'ceramic-controls',kind:'material',min:WORKSHOP_MATERIAL_RANGES[key][0],max:WORKSHOP_MATERIAL_RANGES[key][1],step:.01,format:key==='woodGrainScale'?'preciseScale':undefined})),
];
for(const spec of specs){
  const el=document.createElement('div');el.className='slider-control';
  el.innerHTML=`<label class="range-label" for="${spec.key}"><span id="${spec.key}-label">${spec.label}</span><output id="${spec.key}-value"></output></label><input id="${spec.key}" type="range" min="${spec.min??0}" max="${spec.max??1}" step="${spec.step??.01}" value="${state[spec.key]}" />`;
  document.getElementById(spec.parent).append(el);
  el.querySelector('input').addEventListener('input',event=>{
    (spec.kind==='material'?currentMaterialState():state)[spec.key]=Number(event.target.value);selectedLook='';
    if(spec.kind==='geometry')queueGenerate();
    if(spec.kind==='material')updateMaterials();
    if(spec.kind==='ground')ground.update(state);
    syncInputs();
  });
}
for(const [id,pattern] of Object.entries(WOOD_PATTERNS)){
  const option=document.createElement('option');option.value=id;option.textContent=pattern.label;document.querySelector('#woodPattern').append(option);
}
document.querySelector('#woodPattern').addEventListener('change',event=>{
  const pattern=WOOD_PATTERNS[event.target.value];if(!pattern)return;
  const sceneEdit=inScene();if(sceneEdit)sceneEditor.beginEdit?.(`Apply ${pattern.label.toLowerCase()}`);
  try{Object.assign(currentMaterialState(),pattern.options);selectedLook='';updateMaterials();syncInputs();}
  finally{if(sceneEdit)sceneEditor.endEdit?.();}
});
const objectLibrary=createObjectLibrary({
  root:document.querySelector('#object-library'),shapes,groups:shapeGroups,selected:state.shape,
  onSelect:id=>selectObject(id),
});
const latheEditor=createLatheEditor({state,getShape:effectiveShape,onChange:()=>{selectedLook='';queueGenerate();}});
function selectObject(id){
  cancelAnimationFrame(pendingGenerate);pendingGenerate=0;
  const adding=inScene();loadingSceneSelection=adding;
  const changed=state.shape!==id;state.shape=id;selectedLook='';materialSlot='primary';
  if(changed&&(WORKSHOP_SHAPES.has(id)||['terrain','wood'].includes(shapes[id].kind)||isPath())){
    state.latheProfile=null;applyObjectSurface(id==='objectPath'?state.pathObject:id);
  }
  if(isPath()){
    viewMode='single';syncViewButtons();setInspector('path');
  }
  materialFamily=materialFamilyFor(currentMaterialState().surface);loadingSceneSelection=false;
  if(adding){addSceneObject();return;}
  generate(true);
}
function applyObjectSurface(id){
  const entry=shapes[id];
  if(entry.defaultSurface){applySurface(state,entry.defaultSurface);applySurface(innerState,entry.defaultSurface);}
  else if(isPath()){applySurface(state,'stone');applySurface(innerState,'limestone');}
  if(WOOD_PATTERNS[entry.woodPattern])Object.assign(state,WOOD_PATTERNS[entry.woodPattern].options);
  if(id==='splitLog')state.woodBark=.6;
  if(entry.kind==='composite')for(const side of ['outer','inner']){
    applySurface(partStates.handle[side],entry.defaultHandleSurface||'oak');applySurface(partStates.trim[side],'brass');
  }
  if(!inScene())updateMaterials();
}
const pathEditor=createPathEditor({state,onChange:()=>{selectedLook='';queueGenerate();}});
for(const group of shapeGroups){
  const optgroup=document.createElement('optgroup');optgroup.label=group.label;
  for(const id of group.shapes.filter(id=>!PATH_SHAPES.has(id))){const option=document.createElement('option');option.value=id;option.textContent=shapes[id].label;optgroup.append(option);}
  if(optgroup.children.length)document.querySelector('#pathObject').append(optgroup);
}
document.querySelectorAll('[data-path-style]').forEach(button=>button.addEventListener('click',()=>selectObject(button.dataset.pathStyle)));
document.querySelector('#pathObject').addEventListener('change',event=>{state.pathObject=event.target.value;state.latheProfile=null;applyObjectSurface(state.pathObject);if(!shapes[state.pathObject].defaultSurface){applySurface(state,'stone');applySurface(innerState,'limestone');if(!inScene())updateMaterials();}selectedLook='';materialFamily=materialFamilyFor(state.surface);generate(true);});
for(const key of ['pathAlign','pathClosed'])document.getElementById(key).addEventListener('change',event=>{state[key]=event.target.checked;selectedLook='';queueGenerate();});
for(const key of ['hammerHead','knifeBlade'])document.getElementById(key).addEventListener('change',event=>{state[key]=event.target.value;selectedLook='';queueGenerate();});
document.querySelector('#edit-parts').addEventListener('click',()=>{materialSlot='primary';selectMaterialTarget('outer');});
document.querySelector('#material-slot').addEventListener('change',event=>{materialSlot=event.target.value;materialFamily=materialFamilyFor(currentMaterialState().surface);syncInputs();});
document.querySelector('#shape-count').textContent=`${Object.keys(shapes).length} objects`;
document.querySelector('#material-count').textContent=`${Object.keys(surfaces).length} types`;
document.querySelector('#asset-counts').textContent=`${Object.keys(shapes).length} objects · ${Object.keys(surfaces).length} materials · ${Object.keys(grounds).length} grounds`;
document.querySelector('#ground-count').textContent=`${Object.keys(grounds).length} types`;
function renderShapes(options={}){objectLibrary.select(state.shape,options);}
for(const [id,entry] of Object.entries(surfaces)){
  const button=document.createElement('button');button.dataset.surface=id;button.className='material-card';
  button.innerHTML=`<i class="material-swatch ${id}" aria-hidden="true"></i><strong>${entry.label}</strong>`;
  button.addEventListener('click',()=>{applySurface(currentMaterialState(),id);materialFamily=materialFamilyFor(id);selectedLook='';updateMaterials();syncInputs();});
  document.querySelector('#materials').append(button);
}
for(const button of document.querySelectorAll('[data-material-family]'))button.addEventListener('click',()=>{materialFamily=button.dataset.materialFamily;syncInputs();});
for(const [id,entry] of Object.entries(grounds)){
  const button=document.createElement('button');button.dataset.ground=id;
  button.innerHTML=`<i class="ground-swatch ${id}"></i><span>${entry.label}</span>`;
  button.addEventListener('click',()=>{Object.assign(state,{ground:id,reflection:entry.reflection,groundWetness:entry.wetness,groundScale:entry.scale});selectedLook='';ground.update(state);syncInputs();});
  document.querySelector('#grounds').append(button);
}
for(const [id,label] of Object.entries({beauty:'Material',normal:'Normal',height:'Height',roughness:'Roughness'})){
  const button=document.createElement('button');button.dataset.channel=id;button.textContent=label;
  button.addEventListener('click',()=>{currentMaterialState().mapView=id;updateMaterials();syncInputs();});document.querySelector('#channels').append(button);
}
const lookList=document.querySelector('#looks');
for(const [id,look] of Object.entries(looks)){
  const button=document.createElement('button');button.dataset.look=id;
  const swatch=document.createElement('i');swatch.className='look-swatch';swatch.setAttribute('aria-hidden','true');
  swatch.style.background=`linear-gradient(145deg,${look.swatch.join(',')})`;
  const text=document.createElement('span'),name=document.createElement('strong'),category=document.createElement('small');
  name.textContent=look.label;category.textContent=look.category;text.append(name,category);button.append(swatch,text);
  button.addEventListener('click',()=>applyLook(id));lookList.append(button);
}
function freshSeed(previous=state.seed){
  // Always change even if a random draw happens to match the current seed.
  return ((previous-1+1+Math.floor(Math.random()*999998))%999999)+1;
}
document.querySelector('#random-look').addEventListener('click',()=>{
  const candidates=Object.keys(looks).filter(id=>id!==selectedLook);
  applyLook(candidates[Math.floor(Math.random()*candidates.length)],{randomize:true});
});
lookList.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  const buttons=[...lookList.querySelectorAll('button')],index=buttons.indexOf(event.target.closest('button'));
  if(index<0)return;event.preventDefault();
  const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:Math.max(0,Math.min(buttons.length-1,index+(event.key==='ArrowRight'?1:-1)));
  buttons[next].focus();buttons[next].scrollIntoView({block:'nearest',inline:'nearest'});
});
lookList.addEventListener('wheel',event=>{
  if(event.ctrlKey||Math.abs(event.deltaX)>=Math.abs(event.deltaY)||lookList.scrollWidth<=lookList.clientWidth)return;
  const before=lookList.scrollLeft;lookList.scrollLeft+=event.deltaY;
  if(lookList.scrollLeft!==before)event.preventDefault();
},{passive:false});
function applyLook(id,{randomize=false}={}){
  const look=looks[id];if(!look)return;
  if(inspector==='path')setInspector('shape');
  const seed=selectedLook===id||randomize?freshSeed():look.options.seed;
  if(inScene())sceneEditor.beginEdit?.(`Apply ${look.label}`);
  try{
    materialSlot='primary';materialTarget='outer';
    Object.assign(state,ASPHALT_DEFAULTS,OPTICAL_DEFAULTS,WORKSHOP_DEFAULTS,WORKSHOP_MATERIAL_DEFAULTS,structuredClone(PATH_DEFAULTS),tintDefaults,surfaces[look.options.surface]?.defaults,OPTICAL_PRESETS[look.options.surface],structuredClone(look.options),{seed});
    Object.assign(innerState,innerDefaults);applySurface(innerState,state.surface==='stone'?'limestone':state.surface);
    for(const slot of ['handle','trim'])for(const side of ['outer','inner'])Object.assign(partStates[slot][side],makePartState(slot==='handle'?'oak':'brass'));
    selectedLook=id;materialFamily=materialFamilyFor(state.surface);
    renderShapes({reveal:true});if(!inScene())updateMaterials();ground.update(state);applyLighting();
    if(!generate(true))return;
    // Restoring the selected object's inspector clears its preset marker.
    // Keep the successfully applied look active for repeat-tap variations.
    selectedLook=id;syncInputs();
    message(`${look.label} · seed ${state.seed}`);
  }finally{if(inScene())sceneEditor.endEdit?.();}
}
for(const [id,preset] of Object.entries(LIGHTING_PRESETS)){
  const option=document.createElement('option');option.value=id;option.textContent=preset.label;document.querySelector('#lighting').append(option);
}
function setInspector(id){
  if(id==='fracture'&&inScene())id='scene';
  if(id==='scene'&&!inScene())id='shape';
  if(id==='path'&&!isPath()){state.pathObject=state.shape;selectObject('steppingStonePath');return;}
  inspector=id;
  document.querySelectorAll('[data-panel]').forEach(el=>{const active=el.dataset.panel===id;el.setAttribute('aria-selected',active);el.tabIndex=active?0:-1;});
  document.querySelectorAll('aside > section[role="tabpanel"]').forEach(el=>el.hidden=el.id!==`panel-${id}`);
  document.querySelector('aside').scrollTop=0;
  if(id==='shape')requestAnimationFrame(()=>objectLibrary.revealSelection());
}
document.querySelectorAll('[data-panel]').forEach(el=>el.addEventListener('click',()=>setInspector(el.dataset.panel)));
for(const tablist of document.querySelectorAll('[role="tablist"]'))tablist.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  const items=[...tablist.querySelectorAll('[role="tab"]')].filter(item=>!item.hidden&&!item.disabled);let index=items.indexOf(document.activeElement);
  if(index<0)return;event.preventDefault();
  index=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowRight'?1:-1)+items.length)%items.length;
  items[index].click();items[index].focus();
});
function message(text){const el=document.querySelector('#toast');el.textContent=text;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),2800);}
function syncInputs(){
  const source=effectiveShape(),composite=shapes[source].kind==='composite',lathe=shapes[source].kind==='lathe',hasParts=composite||source==='woodenCandlestick';
  syncViewButtons();
  document.querySelector('#path-source-row').hidden=state.shape!=='objectPath';document.querySelector('#path-object-controls').hidden=state.shape!=='objectPath';
  document.querySelector('#pathObject').value=state.pathObject;
  const fitted=['brickPath','cobblePath'].includes(state.shape);
  document.querySelector('#pathRotation').closest('.slider-control').hidden=fitted;
  for(const key of ['pathPieceSize','pathThickness'])document.getElementById(key).closest('.slider-control').hidden=state.shape==='objectPath';
  document.querySelector('#pathAlign').closest('label').hidden=state.shape!=='objectPath';
  for(const key of ['facets','roughness'])document.getElementById(key).closest('.slider-control').hidden=isPath()&&state.shape!=='objectPath';
  for(const key of ['pathAlign','pathClosed'])document.getElementById(key).checked=state[key];
  document.querySelector('#pathClosed').disabled=state.pathPoints.length<3;
  document.querySelectorAll('[data-path-style]').forEach(el=>{el.classList.toggle('active',el.dataset.pathStyle===state.shape);el.setAttribute('aria-pressed',String(el.dataset.pathStyle===state.shape));});
  if(isPath()){
    pathEditor.sync();const p=(inScene()?sceneEditor?.getSelected()?.group:assets[0])?.userData.path,status=document.querySelector('#path-status');
    const warnings=[...(p?.warnings??[]),...(p&&p.pieces===0?['No pieces fit this route. Move the points farther apart or reduce Piece size and Piece gap.']:[])];status.classList.toggle('warning',Boolean(warnings.length||p?.truncated));
    status.textContent=p?`${p.length.toFixed(2)} units · ${p.pieces} pieces${p.truncated?' · Layout budget reached':''}${warnings.length?' · '+warnings.join(' '):''}`:'Editing route…';
  }
  if(!hasParts||(!composite&&materialSlot==='handle'))materialSlot='primary';
  for(const spec of specs){const value=(spec.kind==='material'?currentMaterialState():state)[spec.key];document.getElementById(spec.key).value=value;document.getElementById(`${spec.key}-value`).textContent=spec.format==='integer'?`${Math.round(value)}`:spec.format==='number'?`${Number(value.toFixed(3))}`:spec.format==='units'?`${Number(value.toFixed(2))} u`:spec.format==='scale'?`${value.toFixed(1)}×`:spec.format==='preciseScale'?`${Number(value.toFixed(2))}×`:`${Math.round(value*100)}%`;}
  document.querySelector('#composite-controls-panel').hidden=!composite;
  document.querySelector('#hammer-head-row').hidden=source!=='hammer';
  document.querySelector('#knife-blade-row').hidden=source!=='knife';
  document.querySelector('#hammerHead').value=state.hammerHead;document.querySelector('#knifeBlade').value=state.knifeBlade;
  document.querySelector('#lathe-controls-panel').hidden=!lathe;
  document.querySelector('#material-slot-row').hidden=!hasParts;document.querySelector('#material-slot').value=materialSlot;
  document.querySelector('#material-slot option[value="primary"]').textContent=composite?(source==='hammer'?'Hammer head':'Blade'):'Body';
  document.querySelector('#material-slot option[value="handle"]').hidden=!composite;document.querySelector('#material-slot option[value="handle"]').disabled=!composite;
  if(lathe)latheEditor.sync();
  document.querySelector('#material-tint').value=currentMaterialState().tint;
  document.querySelector('#absorptionColor').value=currentMaterialState().absorptionColor;
  const optical=materialFamilyFor(currentMaterialState().surface)==='optical';
  for(const family of ['metal','wood','ceramic'])document.getElementById(`${family}-controls-panel`).hidden=materialFamilyFor(currentMaterialState().surface)!==family;
  document.querySelector('#woodPattern').value=Object.entries(WOOD_PATTERNS).find(([,pattern])=>WORKSHOP_MATERIAL_FIELDS.wood.every(key=>Math.abs(currentMaterialState()[key]-pattern.options[key])<1e-6))?.[0]??'custom';
  document.querySelector('#optical-controls-panel').hidden=!optical;
  document.querySelector('#noise-section-index').textContent=optical?'04':'02';
  document.querySelector('#channel-section-index').textContent=optical?'05':'03';
  document.querySelectorAll('[data-material-family]').forEach(el=>{const active=el.dataset.materialFamily===materialFamily;el.setAttribute('aria-selected',active);el.tabIndex=active?0:-1;});
  document.querySelectorAll('[data-surface]').forEach(el=>{el.hidden=materialFamilyFor(el.dataset.surface)!==materialFamily;});
  document.querySelectorAll('[data-material-target]').forEach(el=>{const active=el.dataset.materialTarget===materialTarget;el.setAttribute('aria-selected',active);el.tabIndex=active?0:-1;});
  document.querySelector('#material-editor').setAttribute('aria-labelledby',`material-${materialTarget}`);
  const partName=hasParts?`${{primary:composite?(source==='hammer'?'Head':'Blade'):'Body',handle:'Handle',trim:'Fittings'}[materialSlot]} · `:'';
  document.querySelector('#material-target-note').textContent=partName+(materialTarget==='inner'?'New cut faces exposed by fracture. Break the asset to see this material.':'The original outside surface of the asset.');
  document.querySelector('#seed').value=state.seed;document.querySelector('#lighting').value=state.lighting;
  for(const [attr,value] of [['shape',state.shape],['surface',currentMaterialState().surface],['ground',state.ground],['channel',currentMaterialState().mapView],['look',selectedLook]]){
    document.querySelectorAll(`[data-${attr}]`).forEach(el=>{const active=el.dataset[attr]===value;el.classList.toggle('active',active);el.setAttribute('aria-pressed',active);});
  }
  objectLibrary.select(state.shape);
  const primitive=['primitives','architecture','furniture'].includes(shapeGroupFor(state.shape))||WORKSHOP_SHAPES.has(state.shape);
  document.querySelector('#facets-label').textContent=primitive?'Geometry detail':'Plane cuts';
  document.querySelector('#roughness-label').textContent=primitive?'Distortion':'Irregularity';
  document.querySelector('#bevel-label').textContent=primitive?'Edge bevel':'Chipped edges';
  document.querySelector('#asset-title').textContent=shapes[state.shape].title;
  stage.dataset.ground=state.ground;
  document.querySelector('#asset-subtitle').textContent=`Seed ${state.seed} · ${surfaces[state.surface].short}${composite?` + ${surfaces[partStates.handle.outer.surface].short}`:''}${state.snow>.05?' + snow':''}${state.mapView!=='beauty'?` · ${state.mapView} channel`:''}`;
  document.querySelector('#ground-description').textContent=grounds[state.ground].description;
  document.querySelector('#asphalt-controls-panel').hidden=state.ground!=='asphalt';
  document.querySelector('#surface-status').textContent=`${grounds[state.ground].label} · ${state.reflection>.001?'Planar reflection':'Reflection off'}`;
  document.querySelector('#look-note').textContent=selectedLook?looks[selectedLook].note:'Create a family of reusable assets.';
  syncDestruction();
  syncAudio();
  if(inScene()){sceneEnvironment=captureEnvironment();syncScenePanel();}
}
function selectMaterialTarget(target){
  materialTarget=target==='inner'?'inner':'outer';materialFamily=materialFamilyFor(currentMaterialState().surface);setInspector('material');syncInputs();
}
for(const el of document.querySelectorAll('[data-material-target]'))el.addEventListener('click',()=>selectMaterialTarget(el.dataset.materialTarget));
document.querySelector('#material-tint').addEventListener('input',event=>{currentMaterialState().tint=event.target.value;selectedLook='';updateMaterials();syncInputs();});
document.querySelector('#absorptionColor').addEventListener('input',event=>{currentMaterialState().absorptionColor=event.target.value;selectedLook='';updateMaterials();syncInputs();});
document.querySelector('#reset-optical').addEventListener('click',()=>{const target=currentMaterialState();Object.assign(target,OPTICAL_DEFAULTS,OPTICAL_PRESETS[target.surface]);target.materialRoughness=surfaces[target.surface].roughness;selectedLook='';updateMaterials();syncInputs();message('Optical preset restored');});
function syncDestruction(stats=fractureController?.getStats()){
  if(inScene()){document.querySelector('#destruction-hud').hidden=true;syncScenePanel();return;}
  const data=stats??{enabled:false,paused:false,busy:false,meshes:0,fragments:0};
  fracturePanel?.setStatus({...data,enabled:fractureRequested,loading:fractureRequested&&!fractureController});
  document.querySelector('#destruction-hud').hidden=!fractureRequested;
  let displayTriangles=data.enabled?data.triangles:0;
  if(!data.enabled)assembly.traverse(mesh=>{if(mesh.isMesh)displayTriangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3;});
  if(Number.isFinite(displayTriangles))document.querySelector('#triangles').textContent=displayTriangles.toLocaleString();
  document.querySelector('#destruction-status').textContent=data.busy?'Creating fracture pieces…':!fractureController?'Loading destruction…':data.fragments>0?`${data.fragments} fragments · ${data.paused?'Paused':'Tap a piece to break it again'}`:'Tap an asset to fracture';
  document.querySelector('#stage-hint').innerHTML=fractureRequested?'Tap to break <i>·</i> Drag to orbit':viewMode==='lineup'?'Click an asset to keep its seed <i>·</i> Drag to orbit':'Drag to orbit <i>·</i> Scroll to zoom';
}
async function ensureFracture(){
  if(fractureController)return fractureController;
  if(!fractureLoading)fractureLoading=createFractureLab({scene,outerMaterial:material,innerMaterial,getMaterials:materialsForMesh,onChange:stats=>syncDestruction(stats),onMessage:message,onEvent:handleFractureEvent}).then(controller=>{
    fractureController=controller;controller.update(fractureOptions);return controller;
  }).catch(error=>{fractureLoading=null;throw error;});
  return fractureLoading;
}
function ensurePathFractureBudget(){
  if(!isPath()||fractureOptions.maxFragments>=160)return;
  fractureOptions=sanitizeFractureOptions({...fractureOptions,maxFragments:160});
  fracturePanel?.setOptions(fractureOptions);fractureController?.update(fractureOptions);
  message('Path destruction: live piece limit raised to 160.');
}
async function setFractureEnabled(enabled){
  if(enabled&&inScene()){message('Switch to Object mode to test destruction.');return;}
  fractureRequested=Boolean(enabled);
  if(!enabled){audio.stop();fractureController?.setEnabled(false);syncDestruction();return;}
  if(viewMode!=='single')setViewMode('single');
  ensurePathFractureBudget();
  syncDestruction();
  try{
    const controller=await ensureFracture();
    if(!fractureRequested)return;
    assembly.updateMatrixWorld(true);controller.setSource(assembly);controller.setPaused(false);controller.update(fractureOptions);fractureRequested=await controller.setEnabled(true);syncDestruction();
  }catch(error){fractureRequested=false;fractureController?.setEnabled(false);message(`Destruction could not start: ${error.message}`);syncDestruction();}
}
async function handleFractureAction(action,value){
  try{
    if(action==='outer'||action==='inner'){selectMaterialTarget(action);return;}
    // Regeneration stops old audio, so finish the lineup transition before
    // unlocking inside this gesture. Mark enable intent before any await.
    if((action==='break'||(action==='enable'&&value))&&viewMode!=='single')setViewMode('single');
    if(action==='break'||(action==='enable'&&value)||(action==='pause'&&!value))unlockAudio();
    if(action==='enable'){await setFractureEnabled(value);return;}
    if(action==='break'){
      if(!fractureRequested)await setFractureEnabled(true);
      if(fractureRequested)await fractureController?.fractureAll();
    }
    if(action==='reset'&&fractureController?.getStats().enabled){
      fractureController.reset();audio.stop();
      const ready=await unlockAudio();
      if(ready&&fractureController.getStats().enabled)audio.playRestore();
    }
    if(action==='pause'){fractureController?.setPaused(value);if(value)audio.stop();}
    syncDestruction();
  }catch(error){message(`Fracture failed: ${error.message}`);syncDestruction();}
}
document.querySelector('#restore-asset').addEventListener('click',()=>handleFractureAction('reset'));
function positionKeyLight(center=new THREE.Vector3(),scale=1){
  const p=LIGHTING_PRESETS[state.lighting]??LIGHTING_PRESETS.alpine;
  key.position.fromArray(p.keyPosition??[-4,7,5]).multiplyScalar(scale).add(center);
  key.target.position.copy(center);key.target.updateMatrixWorld();
}
function applyLighting(){
  const p=LIGHTING_PRESETS[state.lighting]??LIGHTING_PRESETS.alpine;
  key.color.set(p.key);key.intensity=p.ki;hemi.color.set(p.sky);hemi.intensity=p.hi;rim.color.set(p.rim);rim.intensity=p.ri;
  rim.position.fromArray(p.rimPosition??[4,3,-4]);
  positionKeyLight(key.target.position.clone(),inScene()||isPath()?Math.max(1,key.shadow.camera.right/4):1);
  scene.background.set(p.bg);scene.fog.color.set(p.bg);ground.update({studioColor:p.bg});
}
function frameAsset(){
  if(inScene()){frameScene(false);return;}
  if(!fractureRequested)assembly.rotation.y=0;
  if(isPath()){camera.position.set(7,8,9);controls.target.set(0,0,0);fitPathCamera();return;}
  frameSize=viewMode==='lineup'?7.6:5.4;
  camera.position.set(...(viewMode==='lineup'?[2.5,4.5,14]:[7,5.1,8]));camera.zoom=1;
  controls.target.set(0,viewMode==='lineup'?.85:1.35,0);controls.update(0);resize();
}
function fitPathCamera(){
  if(!assets.length)return;
  assembly.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(assembly);
  if(bounds.isEmpty()){
    for(const p of state.pathPoints)bounds.expandByPoint(new THREE.Vector3(p.x,0,p.z));
    bounds.expandByVector(new THREE.Vector3(state.pathWidth/2,.05,state.pathWidth/2));
  }
  const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
  const direction=camera.position.clone().sub(controls.target).normalize(),distance=Math.max(12,size.length()*1.8);
  controls.target.copy(center);camera.position.copy(center).addScaledVector(direction,distance);camera.zoom=1;controls.update(0);camera.updateMatrixWorld();
  const projected=new THREE.Box3();
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])projected.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse));
  const extent=projected.getSize(new THREE.Vector3()),aspect=Math.max(.2,stage.clientWidth/stage.clientHeight);
  pathFrameBounds={width:extent.x*1.3,height:extent.y*1.3};
  frameSize=Math.max(2.8,pathFrameBounds.height,pathFrameBounds.width/aspect);
  scene.fog.near=distance+size.length()*1.5;scene.fog.far=scene.fog.near+35;
  const shadowSize=Math.max(12,size.length());positionKeyLight(center,shadowSize/4);
  Object.assign(key.shadow.camera,{left:-shadowSize,right:shadowSize,top:shadowSize,bottom:-shadowSize,far:shadowSize*5});key.shadow.camera.updateProjectionMatrix();
  resize();
}
function resize(){
  const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;
  renderer.setSize(w,h);ground.resize(w,h);const aspect=w/h;
  const height=inScene()?Math.max(4,sceneFrameBounds?.height??frameSize,(sceneFrameBounds?.width??frameSize)/aspect):isPath()&&pathFrameBounds?Math.max(2.8,pathFrameBounds.height,pathFrameBounds.width/aspect):viewMode==='lineup'?Math.max(5.2,14.5/aspect):(aspect<1?frameSize/aspect:frameSize);
  camera.left=-height*aspect/2;camera.right=height*aspect/2;camera.top=height/2;camera.bottom=-height/2;camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
function generate(resetCamera=false){
  pendingGenerate=0;
  if(inScene()){
    const start=performance.now();
    if(!loadingSceneSelection&&sceneEditor?.getSelected()){
      if(!sceneEditor.replaceSelected(objectRecipe())){loadSceneSelection();return false;}
      lastGeneration=performance.now()-start;generationCount++;
    }
    document.querySelector('#generation-time').textContent=lastGeneration.toFixed(1);syncInputs();return true;
  }
  audio.stop();
  const start=performance.now();
  for(const asset of assets){assembly.remove(asset);disposeAsset(asset);}assets=[];
  for(const pairs of variationMaterials.values())for(const mat of flattenMaterialPairs(pairs))mat.dispose();variationMaterials.clear();
  updateMaterials();
  if(isPath())viewMode='single';
  const count=viewMode==='lineup'?5:1;
  for(let i=0;i<count;i++){
    const seed=variationSeed(i),pairs=i===0?primaryMaterialPairs:createVariationMaterials(seed);
    const asset=buildAsset({...state,seed},pairs.primary.outer);
    asset.traverse(obj=>{if(obj.isMesh){meshMaterialPairs.set(obj,pairs);obj.castShadow=true;obj.receiveShadow=true;obj.material=materialsForMesh(obj).outerMaterial;}});
    if(count>1){asset.scale.setScalar(.65);asset.position.set((i-2)*2.65,0,0);}assembly.add(asset);assets.push(asset);
  }
  assembly.updateMatrixWorld(true);
  if(fractureRequested)ensurePathFractureBudget();
  fractureController?.setSource(assembly);
  if(fractureRequested&&fractureController&&!fractureController.getStats().enabled)fractureRequested=false;
  lastGeneration=performance.now()-start;generationCount++;
  let triangles=0;assembly.traverse(obj=>{if(obj.isMesh)triangles+=(obj.geometry.index?.count??obj.geometry.attributes.position.count)/3;});
  document.querySelector('#triangles').textContent=triangles.toLocaleString();document.querySelector('#generation-time').textContent=lastGeneration.toFixed(1);
  syncInputs();
  if(isPath()){if(resetCamera)frameAsset();else fitPathCamera();}
  else{scene.fog.near=19;scene.fog.far=38;positionKeyLight();Object.assign(key.shadow.camera,{left:-12,right:12,top:12,bottom:-12,far:35});key.shadow.camera.updateProjectionMatrix();if(resetCamera)frameAsset();}
  return true;
}
function queueGenerate(){cancelAnimationFrame(pendingGenerate);pendingGenerate=requestAnimationFrame(()=>generate());}
document.querySelector('#seed').addEventListener('change',event=>{state.seed=Math.max(1,Math.min(999999,Math.round(Number(event.target.value)||defaults.seed)));selectedLook='';generate();});
document.querySelector('#new-seed').addEventListener('click',()=>{state.seed=1+crypto.getRandomValues(new Uint32Array(1))[0]%999999;selectedLook='';generate();});
document.querySelector('#lighting').addEventListener('change',event=>{state.lighting=event.target.value;selectedLook='';applyLighting();syncInputs();});
document.querySelector('#wireframe').addEventListener('change',event=>{if(inScene()){sceneEditor.updateSettings({renderMode:event.target.checked?'wireframe':'shaded'});return;}for(const mat of allMaterials())mat.wireframe=event.target.checked;});
document.querySelector('#rotate').addEventListener('change',event=>{rotation=event.target.checked;});
document.querySelector('#frame').addEventListener('click',frameAsset);
document.querySelector('#help-dialog').addEventListener('click',event=>{if(event.target===event.currentTarget)event.currentTarget.close();});
function syncViewButtons(){
  for(const m of ['single','lineup']){const el=document.querySelector(`#view-${m}`);el.classList.toggle('active',m===viewMode);el.setAttribute('aria-pressed',m===viewMode);if(m==='lineup')el.disabled=isPath();}
  document.querySelector('[data-menu-action="lineup"]').disabled=inScene()||isPath();
  document.querySelector('[data-menu-action="single"]').disabled=inScene();
}
function setViewMode(mode){
  if(inScene())return;
  if(mode==='lineup'&&isPath()){message('Paths use the single-layout view. Change Seed to make a variation.');return;}
  if(mode==='lineup'&&fractureRequested)setFractureEnabled(false);
  viewMode=mode;
  for(const m of ['single','lineup']){const el=document.querySelector(`#view-${m}`);el.classList.toggle('active',m===mode);el.setAttribute('aria-pressed',m===mode);}
  document.querySelector('#stage-hint').innerHTML=mode==='lineup'?'Click an asset to keep its seed <i>·</i> Drag to orbit':'Drag to orbit <i>·</i> Scroll to zoom';generate(true);
}
for(const mode of ['single','lineup'])document.querySelector(`#view-${mode}`).addEventListener('click',()=>setViewMode(mode));
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),activePointers=new Set();let pointerStart=null;
renderer.domElement.addEventListener('pointerdown',event=>{if(inScene())return;if(fractureRequested)unlockAudio();activePointers.add(event.pointerId);pointerStart=event.button===0&&activePointers.size===1?{id:event.pointerId,x:event.clientX,y:event.clientY,moved:false}:null;});
renderer.domElement.addEventListener('pointermove',event=>{if(pointerStart&&Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)>5)pointerStart.moved=true;});
renderer.domElement.addEventListener('pointercancel',event=>{activePointers.delete(event.pointerId);pointerStart=null;});
renderer.domElement.addEventListener('pointerup',event=>{
  if(inScene())return;
  activePointers.delete(event.pointerId);
  if(!pointerStart||pointerStart.id!==event.pointerId||pointerStart.moved||Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)>5){pointerStart=null;return;}
  pointerStart=null;
  if(viewMode!=='lineup'&&!fractureRequested)return;
  const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
  raycaster.setFromCamera(pointer,camera);
  if(fractureRequested){fractureController?.tap(raycaster).catch(error=>message(`Fracture failed: ${error.message}`));return;}
  const hit=raycaster.intersectObjects(assets,true)[0];if(!hit)return;
  let selected=hit.object;while(selected.parent!==assembly&&selected.parent)selected=selected.parent;
  const index=assets.indexOf(selected);if(index<0)return;state.seed=variationSeed(index);selectedLook='';setViewMode('single');
});
document.querySelector('#reset-asphalt').addEventListener('click',()=>{Object.assign(state,ASPHALT_DEFAULTS);selectedLook='';ground.update(state);syncInputs();message('Asphalt detail restored');});
document.querySelector('#reset').addEventListener('click',()=>{
  if(inScene())setWorkspaceMode('object');
  if(inspector==='path')setInspector('shape');
  setFractureEnabled(false);fractureOptions=sanitizeFractureOptions(FRACTURE_DEFAULTS);fractureController?.update(fractureOptions);fracturePanel.setOptions(fractureOptions);
  Object.assign(state,defaults,ASPHALT_DEFAULTS,OPTICAL_DEFAULTS,WORKSHOP_DEFAULTS,WORKSHOP_MATERIAL_DEFAULTS,structuredClone(PATH_DEFAULTS),tintDefaults);Object.assign(innerState,innerDefaults);
  for(const slot of ['handle','trim'])for(const side of ['outer','inner'])Object.assign(partStates[slot][side],makePartState(slot==='handle'?'oak':'brass'));
  materialSlot='primary';materialTarget='outer';materialFamily='rock';selectedLook='alpine';rotation=false;for(const mat of allMaterials())mat.wireframe=false;
  document.querySelector('#rotate').checked=false;document.querySelector('#wireframe').checked=false;
  renderShapes({reveal:true,resetFilters:true});updateMaterials();ground.update(state);applyLighting();generate(true);setFractureEnabled(true);message('Default studio restored');
});
function download(data,name,type){
  const url=URL.createObjectURL(data instanceof Blob?data:new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function objectRecipe(){return{generator:'procedural-rock-lab',version:5,options:structuredClone(state),innerMaterial:{...innerState},partMaterials:structuredClone(partStates),fracture:{...structuredClone(fractureOptions),enabled:fractureRequested}};}
document.querySelector('#save-recipe').addEventListener('click',()=>{download(JSON.stringify(recipe(),null,2),`${inScene()?'scene':'rock'}-${state.shape}-${state.seed}.json`,'application/json');message(inScene()?'Scene download started. Load the JSON to restore it.':'Recipe download started. Load the JSON to restore it.');});
document.querySelector('#export-png').addEventListener('click',()=>{
  renderer.render(scene,camera);renderer.domElement.toBlob(blob=>{if(blob){download(blob,`rock-${state.shape}-${state.seed}.png`,'image/png');message('Image download started');}else message('Image export failed. Please try again.');},'image/png');
});
function normalizeObjectRecipe(data){
  if(!data||data.generator!=='procedural-rock-lab'||![1,2,3,4,5,6].includes(data.version)||!data.options||!Object.hasOwn(shapes,data.options.shape))throw new Error('Unsupported rock recipe');
  const state={},innerState={},partStates={handle:{outer:{},inner:{}},trim:{outer:{},inner:{}}};
  const options=data.options;Object.assign(state,defaults,ASPHALT_DEFAULTS,OPTICAL_DEFAULTS,WORKSHOP_DEFAULTS,WORKSHOP_MATERIAL_DEFAULTS,structuredClone(PATH_DEFAULTS),OPTICAL_PRESETS[data.options.surface],tintDefaults);Object.assign(innerState,innerDefaults,OPTICAL_PRESETS[data.innerMaterial?.surface]);
  for(const spec of specs)if(Number.isFinite(options[spec.key]))state[spec.key]=THREE.MathUtils.clamp(options[spec.key],spec.min??0,spec.max??1);
  state.seed=Number.isFinite(options.seed)?THREE.MathUtils.clamp(Math.round(options.seed),1,999999):defaults.seed;
  state.shape=options.shape;state.surface=Object.hasOwn(surfaces,options.surface)?options.surface:'stone';
  Object.assign(state,sanitizeWorkshopOptions(options),sanitizePathOptions(options));
  if(!Object.hasOwn(shapes,state.pathObject)||PATH_SHAPES.has(state.pathObject))state.pathObject='boulder';
  if(!Number.isFinite(options.materialRoughness))state.materialRoughness=surfaces[state.surface].roughness;
  state.lighting=Object.hasOwn(LIGHTING_PRESETS,options.lighting)?options.lighting:'alpine';
  state.ground=normalizeGroundId(options.ground);
  state.mapView=['beauty','normal','height','roughness'].includes(options.mapView)?options.mapView:'beauty';
  if(/^#[0-9a-f]{6}$/i.test(options.tint||''))state.tint=options.tint;
  if(/^#[0-9a-f]{6}$/i.test(options.absorptionColor||''))state.absorptionColor=options.absorptionColor;
  if(data.version>=3&&data.innerMaterial){
    const saved=data.innerMaterial;
    for(const spec of specs.filter(spec=>spec.kind==='material'))if(Number.isFinite(saved[spec.key]))innerState[spec.key]=THREE.MathUtils.clamp(saved[spec.key],spec.min??0,spec.max??1);
    if(Object.hasOwn(surfaces,saved.surface))innerState.surface=saved.surface;
    if(/^#[0-9a-f]{6}$/i.test(saved.tint||''))innerState.tint=saved.tint;
    if(/^#[0-9a-f]{6}$/i.test(saved.absorptionColor||''))innerState.absorptionColor=saved.absorptionColor;
    if(['beauty','normal','height','roughness'].includes(saved.mapView))innerState.mapView=saved.mapView;
  }
  for(const slot of ['handle','trim'])for(const side of ['outer','inner']){
    const target=partStates[slot][side];Object.assign(target,makePartState(slot==='handle'?'oak':'brass'));
    const saved=data.version>=4?data.partMaterials?.[slot]?.[side]:null;if(!saved)continue;
    if(Object.hasOwn(surfaces,saved.surface))applySurface(target,saved.surface);
    for(const spec of specs.filter(spec=>spec.kind==='material'))if(Number.isFinite(saved[spec.key]))target[spec.key]=THREE.MathUtils.clamp(saved[spec.key],spec.min??0,spec.max??1);
    for(const key of ['tint','absorptionColor'])if(/^#[0-9a-f]{6}$/i.test(saved[key]||''))target[key]=saved[key];
    if(['beauty','normal','height','roughness'].includes(saved.mapView))target.mapView=saved.mapView;
  }
  return {generator:'procedural-rock-lab',version:5,options:state,innerMaterial:innerState,partMaterials:partStates,fracture:{...sanitizeFractureOptions({...FRACTURE_DEFAULTS,...(data.version>=3?data.fracture:{})}),enabled:Boolean(data.version>=3&&data.fracture?.enabled)}};
}
function applyRecipeState(data,{keepEnvironment=false}={}){
  const savedEnvironment=keepEnvironment?captureEnvironment():null;
  Object.assign(state,structuredClone(data.options));Object.assign(innerState,structuredClone(data.innerMaterial));
  for(const slot of ['handle','trim'])for(const side of ['outer','inner'])Object.assign(partStates[slot][side],structuredClone(data.partMaterials[slot][side]));
  if(savedEnvironment)Object.assign(state,savedEnvironment);
  materialSlot='primary';materialFamily=materialFamilyFor(currentMaterialState().surface);selectedLook='';
}
function recipe(){
  if(pendingGenerate){cancelAnimationFrame(pendingGenerate);generate();}
  return {...(inScene()&&objectDraft?structuredClone(objectDraft.recipe):objectRecipe()),version:6,workspaceMode,
    scene:{...sceneEditor.serialize(),...(activeScenePreset?{presetId:activeScenePreset}:{}),initialized:sceneInitialized,environment:inScene()?captureEnvironment():sceneEnvironment}};
}
async function loadRecipe(data){
  if(recipeLoading)throw new Error('A recipe is still loading. Please wait.');
  recipeLoading=true;sceneGallery?.setState(getGalleryState());
  try{return await restoreRecipeData(data);}
  finally{recipeLoading=false;sceneGallery?.setState(getGalleryState());}
}
async function restoreRecipeData(data){
  // Validate the object and every scene instance before replacing either workspace.
  const normalized=normalizeObjectRecipe(data);
  if(data.version===6){
    if(!['object','scene'].includes(data.workspaceMode))throw new Error('Unsupported workspace mode');
    if(!data.scene)throw new Error('Missing scene data');
    loadingSceneSelection=true;
    try{sceneEditor.load(data.scene);}finally{loadingSceneSelection=false;}
    sceneInitialized=data.workspaceMode==='scene'||data.scene.objects.length>0||data.scene.initialized===true;sceneCamera=null;
    sceneEnvironment=!sceneInitialized&&data.scene.environment==null?null:sanitizeEnvironment(data.scene.environment??normalized.options);
  }
  cancelAnimationFrame(pendingGenerate);pendingGenerate=0;
  await setFractureEnabled(false);workspaceMode='object';sceneEditor.setActive(false);assembly.visible=true;
  applyRecipeState(normalized);fractureOptions=sanitizeFractureOptions(normalized.fracture);
  fracturePanel.setOptions(fractureOptions);fractureController?.update(fractureOptions);
  rotation=false;document.querySelector('#rotate').checked=false;document.querySelector('#wireframe').checked=false;
  for(const mat of allMaterials())mat.wireframe=false;
  materialSlot='primary';materialTarget='outer';viewMode='single';objectDraft=null;
  renderShapes({reveal:true});updateMaterials();ground.update(state);applyLighting();generate(true);
  setInspector(isPath()?'path':'shape');syncScenePanel();
  if(data.version===6&&data.workspaceMode==='scene'){
    setWorkspaceMode('scene');objectDraft.recipe.fracture.enabled=normalized.fracture.enabled;
  }else if(normalized.fracture.enabled)await setFractureEnabled(true);
  activeScenePreset=data.version===6&&SCENE_PRESETS.some(preset=>preset.id===data.scene?.presetId)?data.scene.presetId:null;
  syncScenePanel();
}
// Object and Scene use separate drafts, cameras, and owned rendering resources.
const environmentKeys=['lighting','ground',...specs.filter(spec=>spec.kind==='ground').map(spec=>spec.key)];
function captureEnvironment(){return Object.fromEntries(environmentKeys.map(key=>[key,state[key]]));}
function sanitizeEnvironment(input){
  const options=normalizeObjectRecipe({generator:'procedural-rock-lab',version:5,options:{...input,shape:'boulder'}}).options;
  return Object.fromEntries(environmentKeys.map(key=>[key,options[key]]));
}
function captureCamera(){return {
  position:camera.position.toArray(),target:controls.target.toArray(),zoom:camera.zoom,far:camera.far,frameSize,pathFrameBounds:structuredClone(pathFrameBounds),sceneFrameBounds:structuredClone(sceneFrameBounds),
  fog:[scene.fog.near,scene.fog.far],keyPosition:key.position.toArray(),keyTarget:key.target.position.toArray(),
  shadow:Object.fromEntries(['left','right','top','bottom','far'].map(k=>[k,key.shadow.camera[k]])),
};}
function restoreCamera(saved){
  if(!saved)return;
  controls.autoRotate=false;const damping=controls.enableDamping;controls.enableDamping=false;controls.update(0);
  camera.position.fromArray(saved.position);controls.target.fromArray(saved.target);camera.zoom=saved.zoom;camera.far=saved.far;
  frameSize=saved.frameSize;pathFrameBounds=structuredClone(saved.pathFrameBounds);sceneFrameBounds=structuredClone(saved.sceneFrameBounds);[scene.fog.near,scene.fog.far]=saved.fog;
  key.position.fromArray(saved.keyPosition);key.target.position.fromArray(saved.keyTarget);key.target.updateMatrixWorld();
  Object.assign(key.shadow.camera,saved.shadow);key.shadow.camera.updateProjectionMatrix();controls.update(0);controls.enableDamping=damping;resize();
}
function frameScene(selection=false){
  const bounds=sceneEditor.getBounds(selection);if(bounds.isEmpty()){bounds.set(new THREE.Vector3(-2,0,-2),new THREE.Vector3(2,2,2));}
  const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
  const direction=camera.position.clone().sub(controls.target).normalize();if(direction.lengthSq()<.1)direction.set(7,6,8).normalize();
  const distance=Math.max(14,size.length()*1.8);controls.autoRotate=false;
  const damping=controls.enableDamping;controls.enableDamping=false;controls.update(0);
  camera.position.copy(center).addScaledVector(direction,distance);controls.target.copy(center);camera.zoom=1;camera.far=Math.max(100,distance+size.length()*3);
  controls.update(0);controls.enableDamping=damping;camera.updateMatrixWorld();
  const projected=new THREE.Box3();
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])projected.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse));
  const extent=projected.getSize(new THREE.Vector3()),aspect=Math.max(.2,stage.clientWidth/stage.clientHeight);
  sceneFrameBounds={width:extent.x*1.45,height:extent.y*1.45};
  frameSize=Math.max(4,sceneFrameBounds.height,sceneFrameBounds.width/aspect);
  scene.fog.near=distance+size.length()*1.5;scene.fog.far=scene.fog.near+60;
  const shadowSize=Math.max(12,size.length());positionKeyLight(center,shadowSize/4);
  Object.assign(key.shadow.camera,{left:-shadowSize,right:shadowSize,top:shadowSize,bottom:-shadowSize,far:shadowSize*5});key.shadow.camera.updateProjectionMatrix();resize();
}
function buildSceneInstance(input){
  const data=normalizeObjectRecipe(input),pairs={};
  const options={primary:{outer:data.options,inner:data.innerMaterial},...data.partMaterials};
  let group;
  try{
    for(const [slot,pair] of Object.entries(options))pairs[slot]={outer:createRockMaterial({...pair.outer,seed:data.options.seed}),inner:createRockMaterial({...pair.inner,seed:data.options.seed,fractureInterior:true})};
    group=buildAsset(data.options,pairs.primary.outer);
    group.traverse(mesh=>{if(mesh.isMesh){mesh.material=(pairs[mesh.userData.materialSlot]??pairs.primary).outer;mesh.castShadow=true;mesh.receiveShadow=true;}});
    group.userData.sceneMaterials=pairs;return group;
  }catch(error){if(group)disposeAsset(group);for(const pair of Object.values(pairs))for(const mat of Object.values(pair))mat.dispose();throw error;}
}
function disposeSceneInstance(group){
  disposeAsset(group);
  for(const pair of Object.values(group.userData.sceneMaterials??{}))for(const mat of Object.values(pair))mat.dispose();
}
function updateSceneMaterials(){
  if(loadingSceneSelection||!sceneEditor?.getSelected())return;
  const record=sceneEditor.getSelected(),pairs=record.group.userData.sceneMaterials;
  updateMaterialPairs(pairs,record.recipe.options.seed);
  const saved=record.recipe;
  // A material edit must not commit a pending geometry edit before its budget check.
  for(const key of materialKeys)saved.options[key]=structuredClone(state[key]);
  saved.innerMaterial=structuredClone(innerState);saved.partMaterials=structuredClone(partStates);
  sceneEditor.updateSelectedRecipe(saved);
}
function syncScenePanel(){
  if(!sceneEditor)return;
  const snapshot=sceneEditor.getSnapshot();scenePanel?.sync({...snapshot,active:inScene(),objects:snapshot.objects.map(record=>({...record,shape:record.recipe.options.shape,label:shapes[record.recipe.options.shape].label}))});
  sceneGallery?.setState(getGalleryState());
  document.querySelector('#save-recipe span').textContent=inScene()?'Save scene…':'Save recipe…';
  document.querySelector('[data-menu-action="frame"] span').textContent=inScene()?'Frame scene':'Frame asset';
  if(!inScene())return;
  document.querySelector('#asset-title').textContent=SCENE_PRESETS.find(preset=>preset.id===activeScenePreset)?.title??'Scene builder';
  document.querySelector('#asset-subtitle').textContent=`${snapshot.instances} object${snapshot.instances===1?'':'s'} · ${snapshot.selection?.name??'Choose an object to edit'}`;
  document.querySelector('#triangles').textContent=snapshot.triangles.toLocaleString();
  document.querySelector('#wireframe').checked=snapshot.settings.renderMode==='wireframe';
  document.querySelector('#stage-hint').textContent=snapshot.settings.tool==='select'?'Click to select · Drag to orbit · Add objects from Shapes':'Drag an axis to transform · Drag empty space to orbit';
}
function loadSceneSelection(){
  if(!inScene()||loadingSceneSelection)return;
  // A queued geometry edit belongs to the old selection, never the new one.
  cancelAnimationFrame(pendingGenerate);pendingGenerate=0;
  const record=sceneEditor.getSelected();
  if(record){loadingSceneSelection=true;applyRecipeState(normalizeObjectRecipe(record.recipe),{keepEnvironment:true});loadingSceneSelection=false;}
  if(inspector==='path'&&!isPath())setInspector('scene');
  syncInputs();
}
function addSceneObject({first=false}={}){
  if(!inScene())return;
  sceneEditor.beginEdit?.('Add object');
  try{
  const previous=sceneEditor.getBounds(),data=normalizeObjectRecipe(objectRecipe());data.fracture.enabled=false;
  const id=sceneEditor.add(data,{name:shapes[state.shape].label});
  if(!id){loadSceneSelection();return;}
  if(!first&&!previous.isEmpty()){
    const bounds=sceneEditor.getBounds(true),x=Math.min(50,previous.max.x+.7-bounds.min.x);
    sceneEditor.setTransform({position:[x,0,0]});
  }
  frameScene(false);syncInputs();
  }finally{sceneEditor.endEdit?.();}
}
function setWorkspaceMode(mode){
  if(!['object','scene'].includes(mode)||mode===workspaceMode)return;
  if(pendingGenerate){cancelAnimationFrame(pendingGenerate);generate();}
  pointerStart=null;activePointers.clear();
  if(mode==='scene'){
    objectDraft=captureObjectDraft();
    setFractureEnabled(false);workspaceMode='scene';assembly.visible=false;rotation=false;document.querySelector('#rotate').checked=false;
    if(!sceneEnvironment)sceneEnvironment=captureEnvironment();Object.assign(state,sceneEnvironment);ground.update(state);applyLighting();
    sceneEditor.setActive(true);
    if(!sceneInitialized){sceneInitialized=true;addSceneObject({first:true});sceneEditor.clearHistory?.();}
    else{loadSceneSelection();if(sceneCamera)restoreCamera(sceneCamera);else frameScene(false);}
    setInspector('scene');
  }else{
    sceneCamera=captureCamera();sceneEnvironment=captureEnvironment();workspaceMode='object';sceneEditor.setActive(false);assembly.visible=true;
    if(objectDraft)restoreObjectDraft(objectDraft);
  }
  syncInputs();syncScenePanel();
}
function captureObjectDraft(){return {recipe:objectRecipe(),camera:captureCamera(),viewMode,inspector,materialSlot,materialTarget,materialFamily,selectedLook,rotation,wireframe:material.wireframe,assemblyRotation:assembly.rotation.toArray()};}
function restoreObjectDraft(saved){
  applyRecipeState(saved.recipe);viewMode=saved.viewMode;selectedLook=saved.selectedLook;materialSlot=saved.materialSlot;materialTarget=saved.materialTarget;materialFamily=saved.materialFamily??materialFamilyFor(currentMaterialState().surface);
  fractureOptions=sanitizeFractureOptions(saved.recipe.fracture);fracturePanel.setOptions(fractureOptions);fractureController?.update(fractureOptions);
  rotation=saved.rotation;document.querySelector('#rotate').checked=rotation;document.querySelector('#wireframe').checked=saved.wireframe;
  if(saved.assemblyRotation)assembly.rotation.fromArray(saved.assemblyRotation);
  for(const mat of allMaterials())mat.wireframe=saved.wireframe;
  updateMaterials();ground.update(state);applyLighting();generate();restoreCamera(saved.camera);setInspector(saved.inspector==='scene'?'shape':saved.inspector);
  if(saved.recipe.fracture.enabled)return setFractureEnabled(true);
}
function getGalleryState(){return {activeId:activeScenePreset,canRestore:Boolean(galleryBackup),busy:galleryBusy||recipeLoading};}
function captureGalleryWorkspace(){
  const data=recipe();
  return {recipe:data,camera:captureCamera(),sceneCamera:structuredClone(sceneCamera),objectContext:structuredClone(inScene()?objectDraft:captureObjectDraft()),inspectorRecipe:objectRecipe(),inspector,materialSlot,materialTarget,materialFamily,selectedLook,rotation,activeId:activeScenePreset};
}
async function loadScenePreset(id){
  if(galleryBusy||recipeLoading)return false;
  const preset=SCENE_PRESETS.find(preset=>preset.id===id);if(!preset){message('This example scene is unavailable.');return false;}
  galleryBusy=true;sceneGallery?.setState(getGalleryState());
  try{
    const previous=galleryBackup??captureGalleryWorkspace(),data=createScenePreset(id),environment=sanitizeEnvironment(data.environment);
    // Paint the loading state before building the new, independently owned meshes.
    await new Promise(resolve=>requestAnimationFrame(resolve));
    loadingSceneSelection=true;
    try{sceneEditor.load(data);}finally{loadingSceneSelection=false;}
    galleryBackup=previous;activeScenePreset=id;sceneInitialized=true;sceneEnvironment=environment;sceneCamera=null;
    if(!inScene())setWorkspaceMode('scene');
    else{Object.assign(state,environment);ground.update(state);applyLighting();loadSceneSelection();}
    rotation=false;document.querySelector('#rotate').checked=false;
    camera.position.set(7,5.1,8);controls.target.set(0,0,0);frameScene(false);setInspector('scene');syncInputs();
    message(`${preset.title} loaded. Click an object to move it.`);return true;
  }catch(error){message(`Could not open scene: ${error.message}`);return false;}
  finally{galleryBusy=false;sceneGallery?.setState(getGalleryState());}
}
async function restorePreviousScene(){
  if(galleryBusy||recipeLoading||!galleryBackup)return false;
  const saved=galleryBackup;galleryBusy=true;sceneGallery?.setState(getGalleryState());
  try{
    await new Promise(resolve=>requestAnimationFrame(resolve));
    await loadRecipe(saved.recipe);
    if(saved.recipe.workspaceMode==='object')await restoreObjectDraft(saved.objectContext);
    else{
      objectDraft=structuredClone(saved.objectContext);
      // An unselected inspector still holds the recipe for the next added object.
      if(!sceneEditor.getSelected())applyRecipeState(saved.inspectorRecipe,{keepEnvironment:true});
      materialSlot=saved.materialSlot;materialTarget=saved.materialTarget;materialFamily=saved.materialFamily;selectedLook=saved.selectedLook;
      rotation=saved.rotation;document.querySelector('#rotate').checked=rotation;restoreCamera(saved.camera);setInspector(saved.inspector);
    }
    sceneCamera=structuredClone(saved.sceneCamera);activeScenePreset=saved.activeId;galleryBackup=null;syncInputs();syncScenePanel();
    message('Previous workspace restored.');return true;
  }catch(error){galleryBackup=saved;message(`Could not restore scene: ${error.message}`);return false;}
  finally{galleryBusy=false;sceneGallery?.setState(getGalleryState());}
}

function initializeSceneWorkspace(){
  sceneEditor=createSceneEditor({scene,camera,domElement:renderer.domElement,orbitControls:controls,buildInstance:buildSceneInstance,disposeInstance:disposeSceneInstance,
    onChange:syncScenePanel,onSelect:loadSceneSelection,onMessage:message,onFrame:()=>frameScene(true)});
  scenePanel=createScenePanel({onMode:setWorkspaceMode,onSelect:id=>sceneEditor.select(id),onRename:name=>sceneEditor.renameSelected(name),
    onSettings:settings=>{if(settings.tool)sceneEditor.setTool(settings.tool);sceneEditor.updateSettings(settings);},onTransform:transform=>sceneEditor.setTransform(transform),
    onAction:action=>{
      if(action==='undo'||action==='redo'){
        if(pendingGenerate){cancelAnimationFrame(pendingGenerate);generate();}
        sceneEditor.endEdit?.();sceneEditor[action]?.();return;
      }
      if(action==='add')addSceneObject();if(action==='duplicate'){sceneEditor.duplicateSelected();frameScene(false);}if(action==='delete')sceneEditor.deleteSelected();if(action==='frame')frameScene(true);if(action==='frame-all')frameScene(false);
    },
  });
  sceneGallery=createSceneGallery({presets:SCENE_PRESETS.map(preset=>({...preset,thumbnail:import.meta.env.BASE_URL+preset.thumbnail})),onChoose:loadScenePreset,onRestore:restorePreviousScene});
  syncScenePanel();
}

// A whole slider or spline gesture is one scene edit, including its final
// queued mesh regeneration. Keep text-field undo native to the browser.
const historyEvents=new AbortController();let inspectorGesture=null;
const isHistoryControl=target=>target?.closest?.('aside input[type="range"],aside input[type="color"],#lathe-profile,#path-editor');
function beginInspectorEdit(target,kind,key=null){
  const control=isHistoryControl(target);
  if(!inScene()||!control)return;
  if(inspectorGesture?.control===control&&inspectorGesture.kind===kind)return;
  endInspectorEdit();
  const parameter=specs.find(spec=>spec.key===control.id);
  sceneEditor.beginEdit?.(parameter?`Change ${parameter.label.toLowerCase()}`:'Edit object');inspectorGesture={control,kind,key};
}
function endInspectorEdit(){
  if(!inspectorGesture)return;
  if(pendingGenerate){cancelAnimationFrame(pendingGenerate);generate();}
  inspectorGesture=null;sceneEditor.endEdit?.();
}
const historyListen={signal:historyEvents.signal,capture:true};
document.addEventListener('pointerdown',event=>{
  if(inspectorGesture&&!inspectorGesture.control.contains(event.target))endInspectorEdit();
  beginInspectorEdit(event.target,event.target.matches?.('input[type="color"]')?'color':'pointer');
},historyListen);
document.addEventListener('pointerup',()=>{if(inspectorGesture?.kind==='pointer')endInspectorEdit();},historyListen);
document.addEventListener('pointercancel',()=>{if(inspectorGesture?.kind==='pointer')endInspectorEdit();},historyListen);
document.addEventListener('keydown',event=>{
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key))beginInspectorEdit(event.target,'keyboard',event.key);
  if(['Enter',' '].includes(event.key)&&event.target.matches?.('input[type="color"]'))beginInspectorEdit(event.target,'color');
  if(inScene()&&(event.metaKey||event.ctrlKey)&&['z','y'].includes(event.key.toLowerCase())&&!event.target?.closest?.('input,textarea,select,[contenteditable="true"],[role="textbox"]')){
    if(pendingGenerate){cancelAnimationFrame(pendingGenerate);generate();}endInspectorEdit();
  }
},historyListen);
document.addEventListener('keyup',event=>{if(inspectorGesture?.kind==='keyboard'&&event.key===inspectorGesture.key)endInspectorEdit();},historyListen);
document.addEventListener('change',event=>{if(inspectorGesture?.kind==='color'&&event.target===inspectorGesture.control)endInspectorEdit();},{signal:historyEvents.signal});
document.addEventListener('focusout',event=>{
  // Pointer capture begins before the browser blurs the previously focused tab
  // or button. Only losing the gesture's own control can finish this edit.
  if(inspectorGesture?.control.contains(event.target)&&!inspectorGesture.control.contains(event.relatedTarget))endInspectorEdit();
},{signal:historyEvents.signal});
window.addEventListener('blur',()=>{if(inspectorGesture?.kind!=='color')endInspectorEdit();},{signal:historyEvents.signal});

async function readRecipe(file){
  if(!file)return;
  if(galleryBusy){message('Wait for the scene to finish loading.');return;}
  try{
    const data=JSON.parse(await file.text());
    if(galleryBusy){message('Wait for the scene to finish loading.');return;}
    await loadRecipe(data);message(inScene()?'Scene restored':'Asset recipe restored');
  }catch(error){message(`Could not load recipe: ${error.message}`);}
}
document.addEventListener('dragover',event=>event.preventDefault());document.addEventListener('drop',event=>{event.preventDefault();readRecipe(event.dataTransfer.files[0]);});
document.querySelector('#load-recipe').addEventListener('click',()=>document.querySelector('#recipe-file').click());
document.querySelector('#recipe-file').addEventListener('change',event=>{readRecipe(event.target.files[0]);event.target.value='';});
// Rapier stores bodies in world coordinates. Orbit the inspection camera during
// destruction, and keep the hidden source at the orientation cloned by physics.
function stepPreview(delta){
  controls.autoRotate=rotation&&(fractureRequested||inScene())&&!sceneEditor?.getTransformControls().dragging;
  if(rotation&&!fractureRequested&&!inScene())assembly.rotation.y+=delta*turntableSpeed;
  if(!inScene())fractureController?.step(delta);ground.step(delta);if(controls.enabled)controls.update(delta);sceneEditor?.step();
}
let lastFrame=performance.now(),fpsStart=lastFrame,frames=0;
renderer.setAnimationLoop(now=>{
  const delta=Math.min((now-lastFrame)/1000,.05);lastFrame=now;
  stepPreview(delta);renderer.render(scene,camera);frames++;
  if(now-fpsStart>700){document.querySelector('#fps').textContent=`${Math.round(frames*1000/(now-fpsStart))} FPS`;frames=0;fpsStart=now;}
});
fracturePanel=createFracturePanel(document.querySelector('#fracture-controls'),{onOptions:options=>{fractureOptions=sanitizeFractureOptions(options);fractureController?.update(fractureOptions);},onAction:handleFractureAction});
document.querySelector('#fr-message').after(document.querySelector('#sound-settings'));
fracturePanel.setOptions(fractureOptions);
initializeSceneWorkspace();
renderShapes();setInspector('shape');applyLighting();generate(true);
const menus=setupMenus(document.querySelector('.app-menubar'),{
  getState:()=>({viewMode:inScene()?'scene':viewMode,rotation,wireframe:inScene()?sceneEditor.getSnapshot().settings.renderMode==='wireframe':material.wireframe}),
  onAction:action=>{
    if(action==='new-seed')document.querySelector('#new-seed').click();
    if(action==='reset')document.querySelector('#reset').click();
    if(action==='single'||action==='lineup')setViewMode(action);
    if(action==='frame')frameAsset();
    if(action==='turntable'||action==='wireframe'){
      const control=document.querySelector(action==='turntable'?'#rotate':'#wireframe');
      control.checked=!control.checked;control.dispatchEvent(new Event('change',{bubbles:true}));
    }
    if(action==='controls')document.querySelector('#help-dialog').showModal();
    if(action==='guide'){
      setInspector('studio');
      if(window.innerWidth<=720)document.querySelector('#panel-studio').scrollIntoView({behavior:'smooth',block:'start'});
    }
  },
});
const cleanupTooltips=setupParameterTooltips();
void audio.load().catch(()=>syncAudio());
window.addEventListener('pagehide',()=>audio.stop());
if(import.meta.hot)import.meta.hot.dispose(()=>{historyEvents.abort();audio.dispose();menus.destroy();objectLibrary.destroy();latheEditor.destroy();pathEditor.destroy();scenePanel.destroy();sceneGallery.destroy();sceneEditor.destroy();cleanupTooltips();});
window.rockLab={scenePresets:SCENE_PRESETS,loadScenePreset,restorePreviousScene,getGalleryState,sceneEditor,setWorkspaceMode,get workspaceMode(){return workspaceMode;},controls,state,innerState,partStates,partMaterials,recipe,loadRecipe,generate,renderer,scene,camera,material,innerMaterial,ground,audio,setFractureEnabled,get fracture(){return fractureController;},getStats:()=>({triangles:Number(document.querySelector('#triangles').textContent.replaceAll(',','')),generationMs:lastGeneration,generationCount,drawCalls:renderer.info.render.calls,geometries:renderer.info.memory.geometries,programs:renderer.info.programs?.length,workspaceMode,scene:sceneEditor.getSnapshot(),viewMode,turntable:rotation,turntableMode:fractureRequested||inScene()?'camera':'asset',path:assets[0]?.userData.path,ground:ground.getStats(),audio:audio.getState(),fracture:fractureController?.getStats()??{enabled:false}}),ready:false};

window.render_game_to_text=()=>JSON.stringify({
  workspaceMode,scenePreset:activeScenePreset,scene:inScene()?sceneEditor.getSnapshot():undefined,
  coordinates:'Y up; floor y=0; x right and z depth in world space',
  shape:state.shape,seed:state.seed,preset:selectedLook,lighting:state.lighting,outer:state.surface,inner:innerState.surface,ground:state.ground,
  path:isPath()?{...assets[0]?.userData.path,points:state.pathPoints}:undefined,
  parts:shapes[effectiveShape()].kind==='composite'?Object.fromEntries(Object.entries(partStates).map(([slot,pair])=>[slot,{outer:pair.outer.surface,inner:pair.inner.surface}])):undefined,
  turntable:{enabled:rotation,mode:fractureRequested||inScene()?'camera':'asset'},
  destruction:fractureController?.getStats()??{enabled:false},
  audio:audio.getState(),
  pieces:fractureController?.getMeshes().slice(0,48).map(mesh=>({position:mesh.getWorldPosition(new THREE.Vector3()).toArray().map(n=>+n.toFixed(3)),generation:mesh.userData.generation??0}))??[],
});
window.advanceTime=ms=>{const steps=Math.max(1,Math.ceil(ms/(1000/60)));for(let i=0;i<steps;i++){const dt=Math.min(ms/steps/1000,1/60);stepPreview(dt);}renderer.render(scene,camera);};

const fractureQuery=new URLSearchParams(location.search).get('fracture');
if(fractureQuery==='1')setInspector('fracture');
if(fractureQuery!=='0')await setFractureEnabled(true);
window.rockLab.ready=true;
