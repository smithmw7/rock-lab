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
import './style.css';
import './menu.css';

const tintDefaults={tint:'#ffffff',tintAmount:0};
const state={...defaults,...ASPHALT_DEFAULTS,...OPTICAL_DEFAULTS,...tintDefaults};
let soundFamily='auto';
const getSoundFamily=()=>soundFamily!=='auto'?soundFamily:['ice','obsidian','glass','quartz','frozenGlass'].includes(state.surface)?'glass':['block','brick','wall'].includes(state.shape)?'concrete':'rock';
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
  if(event.type==='break')audio.playBreak(getSoundFamily());
  if(event.type==='collision')audio.playCollision(getSoundFamily(),event.strength,event.pieceId);
}
const materialKeys=['surface','materialRoughness','contrast','snow','noiseScale','noiseAmount','normalStrength','detail','mapView','tint','tintAmount',...Object.keys(OPTICAL_DEFAULTS)];
const innerDefaults={...Object.fromEntries(materialKeys.map(key=>[key,state[key]])),surface:'limestone',materialRoughness:.93,snow:0,noiseAmount:.4,normalStrength:.25,tint:'#c9b99d',tintAmount:.12};
const innerState={...innerDefaults};
let materialTarget='outer',fractureController=null,fractureLoading=null,fractureRequested=false,fracturePanel=null;
let fractureOptions=sanitizeFractureOptions(FRACTURE_DEFAULTS);
const currentMaterialState=()=>materialTarget==='inner'?innerState:state;
let family='natural', inspector='shape', viewMode='single', selectedLook='alpine';
let materialFamily='rock';
const materialFamilyFor=surface=>Object.hasOwn(OPTICAL_PRESETS,surface)?'optical':'rock';
let rotation=false,lastGeneration=0,generationCount=0,pendingGenerate=0,frameSize=5.4,toastTimer;
let assets=[];
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
function updateMaterials(){updateRockMaterial(material,state);updateRockMaterial(innerMaterial,{...innerState,fractureInterior:true});}
const variationSeed=(index)=>((state.seed-1+index*137)%999999)+1;
const specs=[
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
for(const group of shapeGroups){
  const button=document.createElement('button');button.role='tab';button.dataset.family=group.id;button.textContent=group.label;
  button.addEventListener('click',()=>{family=group.id;renderShapes();syncInputs();});
  document.querySelector('#shape-families').append(button);
}
function renderShapes(){
  const container=document.querySelector('#shapes');container.replaceChildren();
  for(const id of shapeGroups.find(group=>group.id===family).shapes){
    const entry=shapes[id],button=document.createElement('button');button.dataset.shape=id;
    button.innerHTML=`<svg viewBox="0 0 32 32" aria-hidden="true"><path d="${entry.icon}"/></svg><span>${entry.label}</span>`;
    button.addEventListener('click',()=>{state.shape=id;selectedLook='';generate(true);});container.append(button);
  }
  document.querySelector('#shape-description').textContent=shapeGroups.find(group=>group.id===family).description;
}
for(const [id,entry] of Object.entries(surfaces)){
  const button=document.createElement('button');button.dataset.surface=id;button.className='material-card';
  button.innerHTML=`<i class="material-swatch ${id}"></i><span><strong>${entry.label}</strong><small>${entry.description}</small></span>`;
  button.addEventListener('click',()=>{const target=currentMaterialState();target.surface=id;target.materialRoughness=entry.roughness;if(OPTICAL_PRESETS[id])Object.assign(target,OPTICAL_DEFAULTS,OPTICAL_PRESETS[id]);materialFamily=materialFamilyFor(id);selectedLook='';updateMaterials();syncInputs();});
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
  Object.assign(state,ASPHALT_DEFAULTS,OPTICAL_DEFAULTS,tintDefaults,looks[id].options);selectedLook=id;family=shapeGroupFor(state.shape);materialFamily=materialFamilyFor(currentMaterialState().surface);
  renderShapes();updateMaterials();ground.update(state);applyLighting();generate(true);
}
function setInspector(id){
  inspector=id;
  document.querySelectorAll('[data-panel]').forEach(el=>{const active=el.dataset.panel===id;el.setAttribute('aria-selected',active);el.tabIndex=active?0:-1;});
  document.querySelectorAll('aside > section[role="tabpanel"]').forEach(el=>el.hidden=el.id!==`panel-${id}`);
  document.querySelector('aside').scrollTop=0;
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
  for(const spec of specs){const value=(spec.kind==='material'?currentMaterialState():state)[spec.key];document.getElementById(spec.key).value=value;document.getElementById(`${spec.key}-value`).textContent=spec.format==='number'?`${Number(value.toFixed(3))}`:spec.format==='units'?`${Number(value.toFixed(2))} u`:spec.format==='scale'?`${value.toFixed(1)}×`:spec.format==='preciseScale'?`${Number(value.toFixed(2))}×`:`${Math.round(value*100)}%`;}
  document.querySelector('#material-tint').value=currentMaterialState().tint;
  document.querySelector('#absorptionColor').value=currentMaterialState().absorptionColor;
  const optical=materialFamilyFor(currentMaterialState().surface)==='optical';
  document.querySelector('#optical-controls-panel').hidden=!optical;
  document.querySelector('#noise-section-index').textContent=optical?'04':'02';
  document.querySelector('#channel-section-index').textContent=optical?'05':'03';
  document.querySelectorAll('[data-material-family]').forEach(el=>{const active=el.dataset.materialFamily===materialFamily;el.setAttribute('aria-selected',active);el.tabIndex=active?0:-1;});
  document.querySelectorAll('[data-surface]').forEach(el=>{el.hidden=materialFamilyFor(el.dataset.surface)!==materialFamily;});
  document.querySelectorAll('[data-material-target]').forEach(el=>{const active=el.dataset.materialTarget===materialTarget;el.setAttribute('aria-selected',active);el.tabIndex=active?0:-1;});
  document.querySelector('#material-editor').setAttribute('aria-labelledby',`material-${materialTarget}`);
  document.querySelector('#material-target-note').textContent=materialTarget==='inner'?'New cut faces exposed by fracture. Break the asset to see this material.':'The original outside surface of the asset.';
  document.querySelector('#seed').value=state.seed;document.querySelector('#lighting').value=state.lighting;
  for(const [attr,value] of [['shape',state.shape],['surface',currentMaterialState().surface],['ground',state.ground],['channel',currentMaterialState().mapView],['look',selectedLook]]){
    document.querySelectorAll(`[data-${attr}]`).forEach(el=>{const active=el.dataset[attr]===value;el.classList.toggle('active',active);el.setAttribute('aria-pressed',active);});
  }
  document.querySelectorAll('[data-family]').forEach(el=>{const active=el.dataset.family===family;el.setAttribute('aria-selected',active);el.tabIndex=active?0:-1;});
  const primitive=shapeGroupFor(state.shape)==='primitives';
  document.querySelector('#facets-label').textContent=primitive?'Geometry detail':'Plane cuts';
  document.querySelector('#roughness-label').textContent=primitive?'Distortion':'Irregularity';
  document.querySelector('#bevel-label').textContent=primitive?'Edge bevel':'Chipped edges';
  document.querySelector('#asset-title').textContent=shapes[state.shape].title;
  stage.dataset.ground=state.ground;
  document.querySelector('#asset-subtitle').textContent=`Seed ${state.seed} · ${surfaces[state.surface].short}${state.snow>.05?' + snow':''}${state.mapView!=='beauty'?` · ${state.mapView} channel`:''}`;
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
  if(!fractureLoading)fractureLoading=createFractureLab({scene,outerMaterial:material,innerMaterial,onChange:stats=>syncDestruction(stats),onMessage:message,onEvent:handleFractureEvent}).then(controller=>{
    fractureController=controller;controller.update(fractureOptions);return controller;
  }).catch(error=>{fractureLoading=null;throw error;});
  return fractureLoading;
}
async function setFractureEnabled(enabled){
  fractureRequested=Boolean(enabled);
  if(!enabled){audio.stop();fractureController?.setEnabled(false);syncDestruction();return;}
  if(viewMode!=='single')setViewMode('single');
  rotation=false;document.querySelector('#rotate').checked=false;
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
  assembly.rotation.y=0;frameSize=viewMode==='lineup'?7.6:5.4;
  camera.position.set(...(viewMode==='lineup'?[2.5,4.5,14]:[7,5.1,8]));camera.zoom=1;
  controls.target.set(0,viewMode==='lineup'?.85:1.35,0);controls.update();resize();
}
function resize(){
  const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;
  renderer.setSize(w,h);ground.resize(w,h);const aspect=w/h;
  const height=viewMode==='lineup'?Math.max(5.2,14.5/aspect):(aspect<1?frameSize/aspect:frameSize);
  camera.left=-height*aspect/2;camera.right=height*aspect/2;camera.top=height/2;camera.bottom=-height/2;camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
function generate(resetCamera=false){
  audio.stop();
  const start=performance.now();
  for(const asset of assets){assembly.remove(asset);disposeAsset(asset);}assets=[];
  const count=viewMode==='lineup'?5:1;
  for(let i=0;i<count;i++){
    const asset=buildAsset({...state,seed:variationSeed(i)},material);
    asset.traverse(obj=>{if(obj.isMesh){obj.castShadow=true;obj.receiveShadow=true;}});
    if(count>1){asset.scale.setScalar(.65);asset.position.set((i-2)*2.65,0,0);}assembly.add(asset);assets.push(asset);
  }
  assembly.updateMatrixWorld(true);
  fractureController?.setSource(assembly);
  if(fractureRequested&&fractureController&&!fractureController.getStats().enabled)fractureRequested=false;
  lastGeneration=performance.now()-start;generationCount++;
  let triangles=0;assembly.traverse(obj=>{if(obj.isMesh)triangles+=(obj.geometry.index?.count??obj.geometry.attributes.position.count)/3;});
  document.querySelector('#triangles').textContent=triangles.toLocaleString();document.querySelector('#generation-time').textContent=lastGeneration.toFixed(1);
  syncInputs();if(resetCamera)frameAsset();
}
function queueGenerate(){cancelAnimationFrame(pendingGenerate);pendingGenerate=requestAnimationFrame(()=>generate());}
document.querySelector('#seed').addEventListener('change',event=>{state.seed=Math.max(1,Math.min(999999,Math.round(Number(event.target.value)||defaults.seed)));selectedLook='';generate();});
document.querySelector('#new-seed').addEventListener('click',()=>{state.seed=1+crypto.getRandomValues(new Uint32Array(1))[0]%999999;selectedLook='';generate();});
document.querySelector('#lighting').addEventListener('change',event=>{state.lighting=event.target.value;selectedLook='';applyLighting();syncInputs();});
document.querySelector('#wireframe').addEventListener('change',event=>{material.wireframe=innerMaterial.wireframe=event.target.checked;});
document.querySelector('#rotate').addEventListener('change',event=>{rotation=event.target.checked;if(rotation&&fractureRequested){setFractureEnabled(false);}});
document.querySelector('#frame').addEventListener('click',frameAsset);
document.querySelector('#help-dialog').addEventListener('click',event=>{if(event.target===event.currentTarget)event.currentTarget.close();});
function setViewMode(mode){
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
  setFractureEnabled(false);fractureOptions=sanitizeFractureOptions(FRACTURE_DEFAULTS);fractureController?.update(fractureOptions);fracturePanel.setOptions(fractureOptions);
  Object.assign(state,defaults,ASPHALT_DEFAULTS,OPTICAL_DEFAULTS,tintDefaults);Object.assign(innerState,innerDefaults);materialTarget='outer';materialFamily='rock';family='natural';selectedLook='alpine';rotation=false;material.wireframe=innerMaterial.wireframe=false;
  document.querySelector('#rotate').checked=false;document.querySelector('#wireframe').checked=false;
  renderShapes();updateMaterials();ground.update(state);applyLighting();generate(true);message('Default studio restored');
});
function download(data,name,type){
  const url=URL.createObjectURL(data instanceof Blob?data:new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function recipe(){return{generator:'procedural-rock-lab',version:3,options:{...state},innerMaterial:{...innerState},fracture:{...structuredClone(fractureOptions),enabled:fractureRequested}};}
document.querySelector('#save-recipe').addEventListener('click',()=>{download(JSON.stringify(recipe(),null,2),`rock-${state.shape}-${state.seed}.json`,'application/json');message('Recipe download started. Load the JSON to restore it.');});
document.querySelector('#export-png').addEventListener('click',()=>{
  renderer.render(scene,camera);renderer.domElement.toBlob(blob=>{if(blob){download(blob,`rock-${state.shape}-${state.seed}.png`,'image/png');message('Image download started');}else message('Image export failed. Please try again.');},'image/png');
});
async function loadRecipe(data){
  if(data.generator!=='procedural-rock-lab'||![1,2,3].includes(data.version)||!data.options||!shapes[data.options.shape])throw new Error('Unsupported rock recipe');
  await setFractureEnabled(false);
  const options=data.options;Object.assign(state,defaults,ASPHALT_DEFAULTS,OPTICAL_DEFAULTS,OPTICAL_PRESETS[data.options.surface],tintDefaults);Object.assign(innerState,innerDefaults,OPTICAL_PRESETS[data.innerMaterial?.surface]);
  for(const spec of specs)if(Number.isFinite(options[spec.key]))state[spec.key]=THREE.MathUtils.clamp(options[spec.key],spec.min??0,spec.max??1);
  state.seed=Number.isFinite(options.seed)?THREE.MathUtils.clamp(Math.round(options.seed),1,999999):defaults.seed;
  state.shape=options.shape;state.surface=surfaces[options.surface]?options.surface:'stone';
  if(!Number.isFinite(options.materialRoughness))state.materialRoughness=surfaces[state.surface].roughness;
  state.lighting=['alpine','soft','sunset'].includes(options.lighting)?options.lighting:'alpine';
  state.ground=grounds[options.ground]?options.ground:'studio';
  state.mapView=['beauty','normal','height','roughness'].includes(options.mapView)?options.mapView:'beauty';
  if(/^#[0-9a-f]{6}$/i.test(options.tint||''))state.tint=options.tint;
  if(/^#[0-9a-f]{6}$/i.test(options.absorptionColor||''))state.absorptionColor=options.absorptionColor;
  if(data.version===3&&data.innerMaterial){
    const saved=data.innerMaterial;
    for(const spec of specs.filter(spec=>spec.kind==='material'))if(Number.isFinite(saved[spec.key]))innerState[spec.key]=THREE.MathUtils.clamp(saved[spec.key],spec.min??0,spec.max??1);
    if(surfaces[saved.surface])innerState.surface=saved.surface;
    if(/^#[0-9a-f]{6}$/i.test(saved.tint||''))innerState.tint=saved.tint;
    if(/^#[0-9a-f]{6}$/i.test(saved.absorptionColor||''))innerState.absorptionColor=saved.absorptionColor;
    if(['beauty','normal','height','roughness'].includes(saved.mapView))innerState.mapView=saved.mapView;
  }
  fractureOptions=sanitizeFractureOptions({...FRACTURE_DEFAULTS,...(data.version===3?data.fracture:{})});
  fracturePanel.setOptions(fractureOptions);fractureController?.update(fractureOptions);
  selectedLook='';family=shapeGroupFor(state.shape);materialFamily=materialFamilyFor(currentMaterialState().surface);renderShapes();updateMaterials();ground.update(state);applyLighting();generate(true);
  if(data.version===3&&data.fracture?.enabled)await setFractureEnabled(true);
}
async function readRecipe(file){if(!file)return;try{await loadRecipe(JSON.parse(await file.text()));message('Asset recipe restored');}catch{message('Please choose a Rock Lab recipe JSON file.');}}
document.addEventListener('dragover',event=>event.preventDefault());document.addEventListener('drop',event=>{event.preventDefault();readRecipe(event.dataTransfer.files[0]);});
document.querySelector('#load-recipe').addEventListener('click',()=>document.querySelector('#recipe-file').click());
document.querySelector('#recipe-file').addEventListener('change',event=>{readRecipe(event.target.files[0]);event.target.value='';});
let lastFrame=performance.now(),fpsStart=lastFrame,frames=0;
renderer.setAnimationLoop(now=>{
  const delta=Math.min((now-lastFrame)/1000,.05);lastFrame=now;if(rotation)assembly.rotation.y+=delta*.24;
  fractureController?.step(delta);ground.step(delta);controls.update();renderer.render(scene,camera);frames++;
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
if(import.meta.hot)import.meta.hot.dispose(()=>{audio.dispose();menus.destroy();cleanupTooltips();});
window.rockLab={state,innerState,recipe,loadRecipe,generate,renderer,scene,camera,material,innerMaterial,ground,audio,setFractureEnabled,get fracture(){return fractureController;},getStats:()=>({triangles:Number(document.querySelector('#triangles').textContent.replaceAll(',','')),generationMs:lastGeneration,generationCount,drawCalls:renderer.info.render.calls,geometries:renderer.info.memory.geometries,programs:renderer.info.programs?.length,viewMode,ground:ground.getStats(),audio:audio.getState(),fracture:fractureController?.getStats()??{enabled:false}}),ready:true};

window.render_game_to_text=()=>JSON.stringify({
  coordinates:'Y up; floor y=0; x right and z depth in world space',
  shape:state.shape,seed:state.seed,outer:state.surface,inner:innerState.surface,ground:state.ground,
  destruction:fractureController?.getStats()??{enabled:false},
  audio:audio.getState(),
  pieces:fractureController?.getMeshes().slice(0,48).map(mesh=>({position:mesh.getWorldPosition(new THREE.Vector3()).toArray().map(n=>+n.toFixed(3)),generation:mesh.userData.generation??0}))??[],
});
window.advanceTime=ms=>{const steps=Math.max(1,Math.ceil(ms/(1000/60)));for(let i=0;i<steps;i++){const dt=Math.min(ms/steps/1000,1/60);fractureController?.step(dt);ground.step(dt);}controls.update();renderer.render(scene,camera);};

if(new URLSearchParams(location.search).get('fracture')==='1'){setInspector('fracture');setFractureEnabled(true);}
