import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildAsset, disposeAsset } from './geometry.js';
import { createRockMaterial, updateRockMaterial } from './material.js';
import { createGround, ASPHALT_DEFAULTS } from './ground.js';
import { OPTICAL_DEFAULTS, OPTICAL_PRESETS } from './optical.js';
import { defaults, shapes, shapeGroups, shapeGroupFor, surfaces, grounds, looks } from './catalog.js';
import { createFractureLab, FRACTURE_DEFAULTS, sanitizeFractureOptions } from './fracture.js';
import { createFracturePanel } from './fracture-panel.js';
import { createRockAudio } from './audio.js';
import { setupMenus } from './menu.js';
import { setupParameterTooltips } from './tooltips.js';
import { createObjectLibrary } from './library.js';
import { WORKSHOP_DEFAULTS, WORKSHOP_RANGES, WORKSHOP_SHAPES, sanitizeWorkshopOptions } from './workshop-geometry.js';
import { WORKSHOP_MATERIAL_DEFAULTS, WORKSHOP_MATERIAL_RANGES } from './workshop-materials.js';
import { createLatheEditor } from './lathe-editor.js';
import { PATH_DEFAULTS, PATH_RANGES, PATH_SHAPES, sanitizePathOptions } from './path-geometry.js';
import { createPathEditor } from './path-editor.js';
import './style.css';
import './menu.css';
import './library.css';
import './workshop.css';
import './workshop-materials.css';
import './path.css';

const tintDefaults={tint:'#ffffff',tintAmount:0};
const state={...defaults,...ASPHALT_DEFAULTS,...OPTICAL_DEFAULTS,...WORKSHOP_DEFAULTS,...WORKSHOP_MATERIAL_DEFAULTS,...structuredClone(PATH_DEFAULTS),...tintDefaults};
const isPath=()=>PATH_SHAPES.has(state.shape);
const effectiveShape=()=>state.shape==='objectPath'?state.pathObject:state.shape;
let soundFamily='auto';
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
function unlockAudio(){return Promise.resolve(audio.unlock()).catch(()=>{message('Click Sound on to enable sound effects.');return false;});}
document.querySelector('#sound-toggle').addEventListener('click',()=>{audio.setMuted(!audio.getState().muted);if(!audio.getState().muted)unlockAudio();});
document.querySelector('#sfx-volume').addEventListener('input',event=>{audio.setVolume(Number(event.target.value));if(Number(event.target.value)>0)unlockAudio();});
document.querySelector('#sfx-family').addEventListener('change',event=>{soundFamily=event.target.value;syncAudio();});
function handleFractureEvent(event){
  if(event.type==='break')audio.playBreak(getSoundFamily(event.materialSlot));
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
let pathFrameBounds=null;
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
const innerMaterial=createRockMaterial({...innerState,fractureInterior:true});
const partMaterials=Object.fromEntries(Object.entries(partStates).map(([slot,pair])=>[slot,{outer:createRockMaterial(pair.outer),inner:createRockMaterial({...pair.inner,fractureInterior:true})}]));
const allMaterials=()=>[material,innerMaterial,...Object.values(partMaterials).flatMap(pair=>[pair.outer,pair.inner])];
function updateMaterials(){
  updateRockMaterial(material,state);updateRockMaterial(innerMaterial,{...innerState,fractureInterior:true});
  for(const [slot,pair] of Object.entries(partMaterials)){
    updateRockMaterial(pair.outer,partStates[slot].outer);updateRockMaterial(pair.inner,{...partStates[slot].inner,fractureInterior:true});
  }
}
function materialsForMesh(mesh){
  const pair=partMaterials[mesh.userData.materialSlot];
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
  ...Object.entries({metalBrushing:'Brushing',metalWear:'Metal wear',woodGrainScale:'Grain scale',woodGrainStrength:'Grain strength',woodKnots:'Knots',woodWarmth:'Wood warmth',ceramicGlaze:'Glaze coat',ceramicSpeckle:'Clay speckles'}).map(([key,label])=>({key,label,parent:key.startsWith('metal')?'metal-controls':key.startsWith('wood')?'wood-controls':'ceramic-controls',kind:'material',min:WORKSHOP_MATERIAL_RANGES[key][0],max:WORKSHOP_MATERIAL_RANGES[key][1],step:.01,format:key==='woodGrainScale'?'preciseScale':undefined})),
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
const objectLibrary=createObjectLibrary({
  root:document.querySelector('#object-library'),shapes,groups:shapeGroups,selected:state.shape,
  onSelect:id=>selectObject(id),
});
const latheEditor=createLatheEditor({state,getShape:effectiveShape,onChange:()=>{selectedLook='';queueGenerate();}});
function selectObject(id){
  const changed=state.shape!==id;state.shape=id;selectedLook='';materialSlot='primary';
  if(changed&&(WORKSHOP_SHAPES.has(id)||shapes[id].kind==='terrain'||isPath())){
    state.latheProfile=null;applyObjectSurface(id==='objectPath'?state.pathObject:id);
  }
  if(isPath()){
    viewMode='single';syncViewButtons();setInspector('path');
  }
  materialFamily=materialFamilyFor(currentMaterialState().surface);generate(true);
}
function applyObjectSurface(id){
  const entry=shapes[id];
  if(entry.defaultSurface){applySurface(state,entry.defaultSurface);applySurface(innerState,entry.defaultSurface);}
  else if(isPath()){applySurface(state,'stone');applySurface(innerState,'limestone');}
  if(entry.kind==='composite')for(const side of ['outer','inner']){
    applySurface(partStates.handle[side],entry.defaultHandleSurface||'oak');applySurface(partStates.trim[side],'brass');
  }
  updateMaterials();
}
const pathEditor=createPathEditor({state,onChange:()=>{selectedLook='';queueGenerate();}});
for(const group of shapeGroups){
  const optgroup=document.createElement('optgroup');optgroup.label=group.label;
  for(const id of group.shapes.filter(id=>!PATH_SHAPES.has(id))){const option=document.createElement('option');option.value=id;option.textContent=shapes[id].label;optgroup.append(option);}
  if(optgroup.children.length)document.querySelector('#pathObject').append(optgroup);
}
document.querySelectorAll('[data-path-style]').forEach(button=>button.addEventListener('click',()=>selectObject(button.dataset.pathStyle)));
document.querySelector('#pathObject').addEventListener('change',event=>{state.pathObject=event.target.value;state.latheProfile=null;applyObjectSurface(state.pathObject);if(!shapes[state.pathObject].defaultSurface){applySurface(state,'stone');applySurface(innerState,'limestone');updateMaterials();}selectedLook='';materialFamily=materialFamilyFor(state.surface);generate(true);});
for(const key of ['pathAlign','pathClosed'])document.getElementById(key).addEventListener('change',event=>{state[key]=event.target.checked;selectedLook='';queueGenerate();});
for(const key of ['hammerHead','knifeBlade'])document.getElementById(key).addEventListener('change',event=>{state[key]=event.target.value;selectedLook='';queueGenerate();});
document.querySelector('#edit-parts').addEventListener('click',()=>{materialSlot='primary';selectMaterialTarget('outer');});
document.querySelector('#material-slot').addEventListener('change',event=>{materialSlot=event.target.value;materialFamily=materialFamilyFor(currentMaterialState().surface);syncInputs();});
document.querySelector('#shape-count').textContent=`${Object.keys(shapes).length} objects`;
document.querySelector('#material-count').textContent=`${Object.keys(surfaces).length} types`;
document.querySelector('#asset-counts').textContent=`${Object.keys(shapes).length} objects · ${Object.keys(surfaces).length} materials · ${Object.keys(grounds).length} grounds`;
function renderShapes(options={}){objectLibrary.select(state.shape,options);}
for(const [id,entry] of Object.entries(surfaces)){
  const button=document.createElement('button');button.dataset.surface=id;button.className='material-card';
  button.innerHTML=`<i class="material-swatch ${id}"></i><span><strong>${entry.label}</strong><small>${entry.description}</small></span>`;
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
for(const [id,look] of Object.entries(looks)){
  const button=document.createElement('button');button.dataset.look=id;
  button.innerHTML=`<i class="look-swatch ${id}"></i>${look.label}`;
  button.addEventListener('click',()=>applyLook(id));document.querySelector('#looks').append(button);
}
function applyLook(id){
  if(inspector==='path')setInspector('shape');
  materialSlot='primary';Object.assign(state,ASPHALT_DEFAULTS,OPTICAL_DEFAULTS,WORKSHOP_DEFAULTS,WORKSHOP_MATERIAL_DEFAULTS,structuredClone(PATH_DEFAULTS),tintDefaults,looks[id].options);selectedLook=id;materialFamily=materialFamilyFor(currentMaterialState().surface);
  renderShapes({reveal:true});updateMaterials();ground.update(state);applyLighting();generate(true);
}
function setInspector(id){
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
  const items=[...tablist.querySelectorAll('[role="tab"]')];let index=items.indexOf(document.activeElement);
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
    pathEditor.sync();const p=assets[0]?.userData.path,status=document.querySelector('#path-status');
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
}
function selectMaterialTarget(target){
  materialTarget=target==='inner'?'inner':'outer';materialFamily=materialFamilyFor(currentMaterialState().surface);setInspector('material');syncInputs();
}
for(const el of document.querySelectorAll('[data-material-target]'))el.addEventListener('click',()=>selectMaterialTarget(el.dataset.materialTarget));
document.querySelector('#material-tint').addEventListener('input',event=>{currentMaterialState().tint=event.target.value;selectedLook='';updateMaterials();syncInputs();});
document.querySelector('#absorptionColor').addEventListener('input',event=>{currentMaterialState().absorptionColor=event.target.value;selectedLook='';updateMaterials();syncInputs();});
document.querySelector('#reset-optical').addEventListener('click',()=>{const target=currentMaterialState();Object.assign(target,OPTICAL_DEFAULTS,OPTICAL_PRESETS[target.surface]);target.materialRoughness=surfaces[target.surface].roughness;selectedLook='';updateMaterials();syncInputs();message('Optical preset restored');});
function syncDestruction(stats=fractureController?.getStats()){
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
function applyLighting(){
  const presets={
    alpine:{key:'#ffe5bf',sky:'#c5d7ef',rim:'#789bdc',ki:2.7,ri:1.9,hi:.85,bg:'#151d25'},
    soft:{key:'#fff4e9',sky:'#d7e4ec',rim:'#b6ccd8',ki:2.2,ri:.8,hi:1.2,bg:'#252c31'},
    sunset:{key:'#ffc781',sky:'#c4bccc',rim:'#92a8e9',ki:3.0,ri:1.8,hi:.75,bg:'#241f26'},
  };
  const p=presets[state.lighting];key.color.set(p.key);key.intensity=p.ki;hemi.color.set(p.sky);hemi.intensity=p.hi;rim.color.set(p.rim);rim.intensity=p.ri;
  scene.background.set(p.bg);scene.fog.color.set(p.bg);ground.update({studioColor:p.bg});
}
function frameAsset(){
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
  const shadowSize=Math.max(12,size.length());key.position.copy(center).add(new THREE.Vector3(-shadowSize,shadowSize*1.5,shadowSize));key.target.position.copy(center);key.target.updateMatrixWorld();
  Object.assign(key.shadow.camera,{left:-shadowSize,right:shadowSize,top:shadowSize,bottom:-shadowSize,far:shadowSize*5});key.shadow.camera.updateProjectionMatrix();
  resize();
}
function resize(){
  const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;
  renderer.setSize(w,h);ground.resize(w,h);const aspect=w/h;
  const height=isPath()&&pathFrameBounds?Math.max(2.8,pathFrameBounds.height,pathFrameBounds.width/aspect):viewMode==='lineup'?Math.max(5.2,14.5/aspect):(aspect<1?frameSize/aspect:frameSize);
  camera.left=-height*aspect/2;camera.right=height*aspect/2;camera.top=height/2;camera.bottom=-height/2;camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
function generate(resetCamera=false){
  audio.stop();
  const start=performance.now();
  for(const asset of assets){assembly.remove(asset);disposeAsset(asset);}assets=[];
  if(isPath())viewMode='single';
  const count=viewMode==='lineup'?5:1;
  for(let i=0;i<count;i++){
    const asset=buildAsset({...state,seed:variationSeed(i)},material);
    asset.traverse(obj=>{if(obj.isMesh){obj.castShadow=true;obj.receiveShadow=true;obj.material=materialsForMesh(obj).outerMaterial;}});
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
  else{scene.fog.near=19;scene.fog.far=38;key.position.set(-4,7,5);key.target.position.set(0,0,0);key.target.updateMatrixWorld();Object.assign(key.shadow.camera,{left:-12,right:12,top:12,bottom:-12,far:35});key.shadow.camera.updateProjectionMatrix();if(resetCamera)frameAsset();}
}
function queueGenerate(){cancelAnimationFrame(pendingGenerate);pendingGenerate=requestAnimationFrame(()=>generate());}
document.querySelector('#seed').addEventListener('change',event=>{state.seed=Math.max(1,Math.min(999999,Math.round(Number(event.target.value)||defaults.seed)));selectedLook='';generate();});
document.querySelector('#new-seed').addEventListener('click',()=>{state.seed=1+crypto.getRandomValues(new Uint32Array(1))[0]%999999;selectedLook='';generate();});
document.querySelector('#lighting').addEventListener('change',event=>{state.lighting=event.target.value;selectedLook='';applyLighting();syncInputs();});
document.querySelector('#wireframe').addEventListener('change',event=>{for(const mat of allMaterials())mat.wireframe=event.target.checked;});
document.querySelector('#rotate').addEventListener('change',event=>{rotation=event.target.checked;});
document.querySelector('#frame').addEventListener('click',frameAsset);
document.querySelector('#help-dialog').addEventListener('click',event=>{if(event.target===event.currentTarget)event.currentTarget.close();});
function syncViewButtons(){
  for(const m of ['single','lineup']){const el=document.querySelector(`#view-${m}`);el.classList.toggle('active',m===viewMode);el.setAttribute('aria-pressed',m===viewMode);if(m==='lineup')el.disabled=isPath();}
  document.querySelector('[data-menu-action="lineup"]').disabled=isPath();
}
function setViewMode(mode){
  if(mode==='lineup'&&isPath()){message('Paths use the single-layout view. Change Seed to make a variation.');return;}
  if(mode==='lineup'&&fractureRequested)setFractureEnabled(false);
  viewMode=mode;
  for(const m of ['single','lineup']){const el=document.querySelector(`#view-${m}`);el.classList.toggle('active',m===mode);el.setAttribute('aria-pressed',m===mode);}
  document.querySelector('#stage-hint').innerHTML=mode==='lineup'?'Click an asset to keep its seed <i>·</i> Drag to orbit':'Drag to orbit <i>·</i> Scroll to zoom';generate(true);
}
for(const mode of ['single','lineup'])document.querySelector(`#view-${mode}`).addEventListener('click',()=>setViewMode(mode));
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),activePointers=new Set();let pointerStart=null;
renderer.domElement.addEventListener('pointerdown',event=>{if(fractureRequested)unlockAudio();activePointers.add(event.pointerId);pointerStart=event.button===0&&activePointers.size===1?{id:event.pointerId,x:event.clientX,y:event.clientY,moved:false}:null;});
renderer.domElement.addEventListener('pointermove',event=>{if(pointerStart&&Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)>5)pointerStart.moved=true;});
renderer.domElement.addEventListener('pointercancel',event=>{activePointers.delete(event.pointerId);pointerStart=null;});
renderer.domElement.addEventListener('pointerup',event=>{
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
  if(inspector==='path')setInspector('shape');
  setFractureEnabled(false);fractureOptions=sanitizeFractureOptions(FRACTURE_DEFAULTS);fractureController?.update(fractureOptions);fracturePanel.setOptions(fractureOptions);
  Object.assign(state,defaults,ASPHALT_DEFAULTS,OPTICAL_DEFAULTS,WORKSHOP_DEFAULTS,WORKSHOP_MATERIAL_DEFAULTS,structuredClone(PATH_DEFAULTS),tintDefaults);Object.assign(innerState,innerDefaults);
  for(const slot of ['handle','trim'])for(const side of ['outer','inner'])Object.assign(partStates[slot][side],makePartState(slot==='handle'?'oak':'brass'));
  materialSlot='primary';materialTarget='outer';materialFamily='rock';selectedLook='alpine';rotation=false;for(const mat of allMaterials())mat.wireframe=false;
  document.querySelector('#rotate').checked=false;document.querySelector('#wireframe').checked=false;
  renderShapes({reveal:true,resetFilters:true});updateMaterials();ground.update(state);applyLighting();generate(true);message('Default studio restored');
});
function download(data,name,type){
  const url=URL.createObjectURL(data instanceof Blob?data:new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function recipe(){return{generator:'procedural-rock-lab',version:5,options:structuredClone(state),innerMaterial:{...innerState},partMaterials:structuredClone(partStates),fracture:{...structuredClone(fractureOptions),enabled:fractureRequested}};}
document.querySelector('#save-recipe').addEventListener('click',()=>{download(JSON.stringify(recipe(),null,2),`rock-${state.shape}-${state.seed}.json`,'application/json');message('Recipe download started. Load the JSON to restore it.');});
document.querySelector('#export-png').addEventListener('click',()=>{
  renderer.render(scene,camera);renderer.domElement.toBlob(blob=>{if(blob){download(blob,`rock-${state.shape}-${state.seed}.png`,'image/png');message('Image download started');}else message('Image export failed. Please try again.');},'image/png');
});
async function loadRecipe(data){
  if(data.generator!=='procedural-rock-lab'||![1,2,3,4,5].includes(data.version)||!data.options||!shapes[data.options.shape])throw new Error('Unsupported rock recipe');
  await setFractureEnabled(false);
  const options=data.options;Object.assign(state,defaults,ASPHALT_DEFAULTS,OPTICAL_DEFAULTS,WORKSHOP_DEFAULTS,WORKSHOP_MATERIAL_DEFAULTS,structuredClone(PATH_DEFAULTS),OPTICAL_PRESETS[data.options.surface],tintDefaults);Object.assign(innerState,innerDefaults,OPTICAL_PRESETS[data.innerMaterial?.surface]);
  for(const spec of specs)if(Number.isFinite(options[spec.key]))state[spec.key]=THREE.MathUtils.clamp(options[spec.key],spec.min??0,spec.max??1);
  state.seed=Number.isFinite(options.seed)?THREE.MathUtils.clamp(Math.round(options.seed),1,999999):defaults.seed;
  state.shape=options.shape;state.surface=surfaces[options.surface]?options.surface:'stone';
  Object.assign(state,sanitizeWorkshopOptions(options),sanitizePathOptions(options));
  if(!shapes[state.pathObject]||PATH_SHAPES.has(state.pathObject))state.pathObject='boulder';
  if(!Number.isFinite(options.materialRoughness))state.materialRoughness=surfaces[state.surface].roughness;
  state.lighting=['alpine','soft','sunset'].includes(options.lighting)?options.lighting:'alpine';
  state.ground=grounds[options.ground]?options.ground:'studio';
  state.mapView=['beauty','normal','height','roughness'].includes(options.mapView)?options.mapView:'beauty';
  if(/^#[0-9a-f]{6}$/i.test(options.tint||''))state.tint=options.tint;
  if(/^#[0-9a-f]{6}$/i.test(options.absorptionColor||''))state.absorptionColor=options.absorptionColor;
  if(data.version>=3&&data.innerMaterial){
    const saved=data.innerMaterial;
    for(const spec of specs.filter(spec=>spec.kind==='material'))if(Number.isFinite(saved[spec.key]))innerState[spec.key]=THREE.MathUtils.clamp(saved[spec.key],spec.min??0,spec.max??1);
    if(surfaces[saved.surface])innerState.surface=saved.surface;
    if(/^#[0-9a-f]{6}$/i.test(saved.tint||''))innerState.tint=saved.tint;
    if(/^#[0-9a-f]{6}$/i.test(saved.absorptionColor||''))innerState.absorptionColor=saved.absorptionColor;
    if(['beauty','normal','height','roughness'].includes(saved.mapView))innerState.mapView=saved.mapView;
  }
  for(const slot of ['handle','trim'])for(const side of ['outer','inner']){
    const target=partStates[slot][side];Object.assign(target,makePartState(slot==='handle'?'oak':'brass'));
    const saved=data.version>=4?data.partMaterials?.[slot]?.[side]:null;if(!saved)continue;
    if(surfaces[saved.surface])applySurface(target,saved.surface);
    for(const spec of specs.filter(spec=>spec.kind==='material'))if(Number.isFinite(saved[spec.key]))target[spec.key]=THREE.MathUtils.clamp(saved[spec.key],spec.min??0,spec.max??1);
    for(const key of ['tint','absorptionColor'])if(/^#[0-9a-f]{6}$/i.test(saved[key]||''))target[key]=saved[key];
    if(['beauty','normal','height','roughness'].includes(saved.mapView))target.mapView=saved.mapView;
  }
  materialSlot='primary';
  fractureOptions=sanitizeFractureOptions({...FRACTURE_DEFAULTS,...(data.version>=3?data.fracture:{})});
  fracturePanel.setOptions(fractureOptions);fractureController?.update(fractureOptions);
  selectedLook='';materialFamily=materialFamilyFor(currentMaterialState().surface);renderShapes({reveal:true});updateMaterials();ground.update(state);applyLighting();generate(true);
  if(isPath())setInspector('path');else if(inspector==='path')setInspector('shape');
  if(data.version>=3&&data.fracture?.enabled)await setFractureEnabled(true);
}
async function readRecipe(file){if(!file)return;try{await loadRecipe(JSON.parse(await file.text()));message('Asset recipe restored');}catch{message('Please choose a Rock Lab recipe JSON file.');}}
document.addEventListener('dragover',event=>event.preventDefault());document.addEventListener('drop',event=>{event.preventDefault();readRecipe(event.dataTransfer.files[0]);});
document.querySelector('#load-recipe').addEventListener('click',()=>document.querySelector('#recipe-file').click());
document.querySelector('#recipe-file').addEventListener('change',event=>{readRecipe(event.target.files[0]);event.target.value='';});
// Rapier stores bodies in world coordinates. Orbit the inspection camera during
// destruction, and keep the hidden source at the orientation cloned by physics.
function stepPreview(delta){
  controls.autoRotate=rotation&&fractureRequested;
  if(rotation&&!fractureRequested)assembly.rotation.y+=delta*turntableSpeed;
  fractureController?.step(delta);ground.step(delta);controls.update(delta);
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
renderShapes();setInspector('shape');applyLighting();generate(true);
const menus=setupMenus(document.querySelector('.app-menubar'),{
  getState:()=>({viewMode,rotation,wireframe:material.wireframe}),
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
if(import.meta.hot)import.meta.hot.dispose(()=>{audio.dispose();menus.destroy();objectLibrary.destroy();latheEditor.destroy();pathEditor.destroy();cleanupTooltips();});
window.rockLab={state,innerState,partStates,partMaterials,recipe,loadRecipe,generate,renderer,scene,camera,material,innerMaterial,ground,audio,setFractureEnabled,get fracture(){return fractureController;},getStats:()=>({triangles:Number(document.querySelector('#triangles').textContent.replaceAll(',','')),generationMs:lastGeneration,generationCount,drawCalls:renderer.info.render.calls,geometries:renderer.info.memory.geometries,programs:renderer.info.programs?.length,viewMode,turntable:rotation,turntableMode:fractureRequested?'camera':'asset',path:assets[0]?.userData.path,ground:ground.getStats(),audio:audio.getState(),fracture:fractureController?.getStats()??{enabled:false}}),ready:true};

window.render_game_to_text=()=>JSON.stringify({
  coordinates:'Y up; floor y=0; x right and z depth in world space',
  shape:state.shape,seed:state.seed,outer:state.surface,inner:innerState.surface,ground:state.ground,
  path:isPath()?{...assets[0]?.userData.path,points:state.pathPoints}:undefined,
  parts:shapes[effectiveShape()].kind==='composite'?Object.fromEntries(Object.entries(partStates).map(([slot,pair])=>[slot,{outer:pair.outer.surface,inner:pair.inner.surface}])):undefined,
  turntable:{enabled:rotation,mode:fractureRequested?'camera':'asset'},
  destruction:fractureController?.getStats()??{enabled:false},
  audio:audio.getState(),
  pieces:fractureController?.getMeshes().slice(0,48).map(mesh=>({position:mesh.getWorldPosition(new THREE.Vector3()).toArray().map(n=>+n.toFixed(3)),generation:mesh.userData.generation??0}))??[],
});
window.advanceTime=ms=>{const steps=Math.max(1,Math.ceil(ms/(1000/60)));for(let i=0;i<steps;i++){const dt=Math.min(ms/steps/1000,1/60);stepPreview(dt);}renderer.render(scene,camera);};

if(new URLSearchParams(location.search).get('fracture')==='1'){setInspector('fracture');setFractureEnabled(true);}
