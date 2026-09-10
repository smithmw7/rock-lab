import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSceneEditor, SCENE_HISTORY_LIMIT } from '../src/scene-editor.js';

// Real Three objects and TransformControls events, with only the DOM surface
// stubbed. Browser QA separately covers pointer targeting and the visible UI.
const listeners=new Map();let modalOpen=false;
const document={defaultView:{},querySelector:()=>modalOpen?{}:null,addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:type=>listeners.delete(type)};
const canvas={ownerDocument:document,style:{},addEventListener(){},removeEventListener(){},getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})};
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,4/3,.1,100),orbit={enabled:true};camera.position.set(6,5,8);camera.lookAt(0,0,0);
let builds=0,disposals=0;const selections=[],messages=[],denied=new Set(),live=new Set();
function build(recipe){
  if(denied.has(recipe.kind)||recipe.invalid)throw new Error(`Unavailable asset ${recipe.kind}`);
  const group=new THREE.Group();group.name=recipe.kind;
  const geometry=recipe.kind==='column'?new THREE.CylinderGeometry(.4,.5,2,8):new THREE.BoxGeometry(1,1,1);
  const material=new THREE.MeshStandardMaterial({color:recipe.color??'#aabbcc'}),mesh=new THREE.Mesh(geometry,material);mesh.position.y=.5;group.add(mesh);
  builds++;live.add(group);return group;
}
function dispose(group){assert(live.delete(group),'Each owned Group is disposed exactly once');group.traverse(mesh=>{if(mesh.isMesh){mesh.geometry.dispose();mesh.material.dispose();}});disposals++;}
const editor=createSceneEditor({scene,camera,domElement:canvas,orbitControls:orbit,buildInstance:build,disposeInstance:dispose,onSelect:(id,value)=>selections.push({id,value}),onMessage:text=>messages.push(text)});
const objects=()=>editor.serialize().objects,history=()=>editor.getHistoryState();
const checks=[];
function check(name,fn){fn();checks.push(name);}
const alpha=editor.add({kind:'block',color:'#aabbcc'},{name:'Alpha'}),beta=editor.add({kind:'column',color:'#445566'},{name:'Beta'});
editor.setActive(true);editor.clearHistory();
const baseline=editor.serialize();

try{
  check('Add and automatic placement form one transaction',()=>{
    editor.beginEdit('Add placed object');const id=editor.add({kind:'block',color:'#ddaa66'},{name:'Placed'});editor.setTransform({position:[2,0,1]});editor.setTransform({rotation:[0,35,0]});editor.endEdit();
    assert.equal(history().undoCount,1);assert.equal(history().undoLabel,'Add placed object');const added=editor.serialize();assert.equal(added.selectedId,id);
    assert(editor.undo());assert.deepEqual(editor.serialize(),baseline);assert(editor.redo());assert.deepEqual(editor.serialize(),added);
  });
  check('Selection and review settings never create object history',()=>{
    const before=history();editor.beginEdit('Selection only');editor.select(alpha);editor.select(beta);editor.endEdit();
    editor.updateSettings({tool:'rotate',space:'local',snap:true,translationSnap:.5,renderMode:'normals',grid:false});assert.deepEqual(history(),before);
    const settings=editor.getSnapshot().settings;editor.undo();assert.deepEqual(editor.getSnapshot().settings,settings);editor.redo();assert.deepEqual(editor.getSnapshot().settings,settings);
    editor.updateSettings({renderMode:'shaded'});
  });
  check('Rename, exact numeric transform, and no-op filtering',()=>{
    editor.clearHistory();const before=objects();editor.renameSelected('Renamed');assert.equal(history().undoLabel,'Rename object');assert(editor.undo());assert.deepEqual(objects(),before);assert(editor.redo());
    editor.beginEdit('Move precisely');for(let i=1;i<=20;i++)editor.setTransform({position:[i*.13,.74,-1.18],rotation:[17,39,-7],scale:[.61,1.86,.88]});editor.endEdit();
    assert.equal(history().undoCount,2);const after=objects();assert(editor.undo());assert.equal(editor.getSnapshot().selection.name,'Renamed');assert(editor.redo());assert.deepEqual(objects(),after);
    const count=history().undoCount;editor.setTransform({position:[2.6,.74,-1.18]});editor.renameSelected('Renamed');assert.equal(history().undoCount,count);
  });
  check('Material and geometry undo rebuild the selected recipe correctly',()=>{
    editor.clearHistory();const before=objects(),id=editor.getSelected().id;
    const recipe={...editor.getSelected().recipe,color:'#ff8822'};editor.getSelected().group.children[0].material.color.set(recipe.color);assert(editor.updateSelectedRecipe(recipe));
    assert(editor.undo());assert.deepEqual(objects(),before);assert.equal(editor.getSelected().group.children[0].material.color.getHexString(),'ddaa66');
    assert(editor.redo());assert.equal(editor.getSelected().group.children[0].material.color.getHexString(),'ff8822');
    const other=objects().filter(object=>object.id!==id);assert(editor.replaceSelected({kind:'column',color:'#ff8822'}));const replaced=objects();assert.deepEqual(replaced.filter(object=>object.id!==id),other);
    assert(editor.undo());assert.equal(editor.getSelected().recipe.kind,'block');assert(editor.redo());assert.deepEqual(objects(),replaced);assert.equal(editor.getSelected().group.children[0].geometry.type,'CylinderGeometry');
    assert.equal(selections.at(-1).id,id,'Undo refreshes the selected material inspector');
  });
  check('Duplicate and delete restore IDs, ordering, names, recipes and selection',()=>{
    editor.clearHistory();const before=editor.serialize(),id=editor.duplicateSelected(),duplicated=editor.serialize();assert(id);assert.equal(history().undoLabel,'Duplicate object');
    editor.deleteSelected();assert.equal(history().undoCount,2);assert.equal(editor.getSelected(),null);assert(editor.undo());assert.deepEqual(editor.serialize(),duplicated);
    assert(editor.undo());assert.deepEqual(editor.serialize(),before);assert(editor.redo());assert.deepEqual(editor.serialize(),duplicated);assert(editor.redo());assert.equal(editor.getSelected(),null);
  });
  check('A complete TransformControls drag is exactly one undo step',()=>{
    editor.select(alpha);editor.clearHistory();editor.setTool('translate');const before=objects(),control=editor.getTransformControls();
    control.dragging=true;assert.equal(orbit.enabled,false);
    for(let i=1;i<=12;i++){control.object.position.x=i*.25;control.dispatchEvent({type:'objectChange'});}
    assert.equal(history().undoCount,0);control.dragging=false;assert.equal(orbit.enabled,true);assert.equal(history().undoCount,1);assert.equal(history().undoLabel,'Move object');
    const after=objects();assert(editor.undo());assert.deepEqual(objects(),before);assert(editor.redo());assert.deepEqual(objects(),after);
  });
  check('Nested inspector gestures commit once and a new edit clears redo',()=>{
    editor.clearHistory();editor.beginEdit('Outer gesture');editor.beginEdit('Nested gesture');editor.renameSelected('Nested name');editor.endEdit();assert.equal(history().undoCount,0);editor.endEdit();assert.equal(history().undoCount,1);assert.equal(history().undoLabel,'Outer gesture');
    editor.undo();assert(history().canRedo);editor.renameSelected('Different edit');assert.equal(history().canRedo,false);
    const kept=history();editor.setActive(false);editor.setActive(true);assert.deepEqual(history(),kept);
  });
  check('Failed undo is atomic and disposes only its staged resources',()=>{
    editor.load(baseline);editor.renameSelected('Undo target');const before=editor.getSnapshot(),nodes=[...editor.getRoot().children],count=disposals,selectionCount=selections.length;
    denied.add('column');assert.equal(editor.undo(),false);denied.clear();assert.deepEqual(editor.getSnapshot(),before);assert.deepEqual(editor.getRoot().children,nodes);assert.equal(selections.length,selectionCount);assert.equal(disposals,count+1,'The first staged block is released when the second build fails');assert(editor.undo());assert.equal(editor.getSelected().name,'Beta');
  });
  check('Failed redo preserves the current scene and both stacks',()=>{
    editor.load(baseline);editor.updateSelectedRecipe({kind:'replacement',color:'#123456'});editor.undo();const before=editor.getSnapshot();denied.add('replacement');assert.equal(editor.redo(),false);denied.clear();assert.deepEqual(editor.getSnapshot(),before);assert(editor.redo());assert.equal(editor.getSelected().recipe.kind,'replacement');
  });
  check('Load clears history only after a valid scene commits',()=>{
    const before=editor.getSnapshot(),invalid=structuredClone(baseline);invalid.objects[1].recipe.invalid=true;assert.throws(()=>editor.load(invalid));assert.deepEqual(editor.getSnapshot(),before);
    editor.load(baseline);assert.equal(history().canUndo,false);assert.equal(history().canRedo,false);assert.deepEqual(editor.serialize(),baseline);
    const bad=editor.getSnapshot();assert.equal(editor.replaceSelected({invalid:true}),false);assert.deepEqual(editor.getSnapshot(),bad);
  });
  check('History is bounded to 50 JSON states with no retained GPU objects',()=>{
    editor.clearHistory();for(let i=0;i<65;i++)editor.renameSelected(`Name ${i}`);assert.equal(history().undoCount,SCENE_HISTORY_LIMIT);assert.equal(live.size,objects().length);
    for(let i=0;i<50;i++)assert(editor.undo());assert.equal(editor.getSelected().name,'Name 14');assert.equal(editor.undo(),false);assert.equal(history().redoCount,50);
    for(let i=0;i<50;i++)assert(editor.redo());assert.equal(editor.getSelected().name,'Name 64');assert.equal(live.size,objects().length);
  });
  check('Undo shortcuts respect focused inputs, dialogs and Object mode',()=>{
    const key=(key,extra={})=>({key,ctrlKey:true,target:{closest:()=>null},preventDefault(){this.defaultPrevented=true;},...extra});const handler=listeners.get('keydown');
    const before=history();handler(key('z',{target:{closest:()=>({})}}));modalOpen=true;handler(key('z'));modalOpen=false;editor.setActive(false);handler(key('z'));editor.setActive(true);assert.deepEqual(history(),before);
    const undoEvent=key('z');handler(undoEvent);assert(undoEvent.defaultPrevented);assert.equal(editor.getSelected().name,'Name 63');handler(key('z',{shiftKey:true}));assert.equal(editor.getSelected().name,'Name 64');handler(key('z',{ctrlKey:false,metaKey:true}));handler(key('y'));assert.equal(editor.getSelected().name,'Name 64');
    editor.clearHistory();const empty=key('z');handler(empty);assert(empty.defaultPrevented,'An empty scene undo must not fall through to browser behavior');
  });
  assert(messages.some(message=>message.startsWith('Unable to undo')));assert(messages.some(message=>message.startsWith('Unable to redo')));
}finally{editor.destroy();}
assert.equal(live.size,0);assert.equal(builds,disposals);assert.equal(scene.children.length,0);
console.log(JSON.stringify({passed:true,checks:checks.length,historyLimit:SCENE_HISTORY_LIMIT,builds,disposals,coverage:checks},null,2));
