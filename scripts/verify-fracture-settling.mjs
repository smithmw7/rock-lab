import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {buildAsset,disposeAsset} from '../src/geometry.js';
import {createFractureLab} from '../src/fracture.js';

const project=fileURLToPath(new URL('..',import.meta.url)),output=path.join(project,'output','fracture-settling');await fs.mkdir(output,{recursive:true});
const baseline=process.argv.includes('--baseline'),measure=baseline||process.argv.includes('--measure'),report={baseline,measurementOnly:measure,cases:[],counterexamples:{},warnings:[]};
const sourceHash=async()=>createHash('sha256').update(await fs.readFile(path.join(project,'src/fracture.js'))).digest('hex');report.sourceHash=await sourceHash();
// Observe the real world without replacing simulation, contacts, or bodies.
// The capture also permits controlled test impulses, like dropping another
// real fragment onto a sleeping pile. Runtime code exposes no mutable world.
let capturedWorld;const nativeCreate=RAPIER.World.prototype.createRigidBody;
RAPIER.World.prototype.createRigidBody=function(...args){capturedWorld=this;return nativeCreate.apply(this,args);};
const outer=new THREE.MeshStandardMaterial(),inner=new THREE.MeshStandardMaterial();
const originalWarn=console.warn;console.warn=(...values)=>{report.warnings.push(values.join(' '));originalWarn(...values);};
const defaults={shape:'block',seed:19423,facets:.35,roughness:.25,bevel:.4};
const settleSeconds=30,observationSeconds=5,framesPerSecond=60;
const browserBoulderTap={origin:[7.226295101454972,5.031731435130278,7.833992676009583],direction:[-.6209967710628116,-.33267684164079175,-.7097105955003559]};
const pose=body=>{const p=body.translation(),q=body.rotation();return{p:[p.x,p.y,p.z],q:[q.x,q.y,q.z,q.w]};};
const length=v=>Math.hypot(v.x,v.y,v.z);
const isResting=body=>body.userData?.resting===true||body.isSleeping();
const isActive=body=>body.isDynamic()&&!body.isSleeping();
const angle=(a,b)=>{if(a.every((value,index)=>value===b[index]))return 0;const dot=Math.abs(a.reduce((sum,value,index)=>sum+value*b[index],0))/(Math.hypot(...a)*Math.hypot(...b));return 2*Math.acos(Math.min(1,dot));};
function movement(a,b){return{distance:Math.hypot(...a.p.map((value,index)=>value-b.p[index])),angle:angle(a.q,b.q)};}
function lowestColliderY(current,vertices){const[x,y,z,w]=current.q,rx=2*(x*y+w*z),ry=1-2*(x*x+z*z),rz=2*(y*z-w*x);let lowest=Infinity;for(let i=0;i<vertices.length;i+=3)lowest=Math.min(lowest,current.p[1]+rx*vertices[i]+ry*vertices[i+1]+rz*vertices[i+2]);return lowest;}
async function setup(shape='block',options={},sourceOverride=null,geometryOptions={}){
  const scene=new THREE.Scene(),source=sourceOverride??buildAsset({...defaults,...geometryOptions,shape},outer);scene.add(source);
  const lab=await createFractureLab({scene,outerMaterial:outer,innerMaterial:inner});
  lab.update({method:'voronoi',fragmentCount:12,seed:19423,impactEnabled:false,maxFragments:160,impulse:1.8,friction:.65,restitution:.18,gravity:9.81,...options});lab.setSource(source);assert.equal(lab.setEnabled(true),true);const world=capturedWorld;
  const bodies=()=>{const result=[];world.forEachRigidBody(body=>{if(body.userData?.generation>0||(baseline&&body.isDynamic()))result.push(body);});return result;};
  return{lab,world,source,bodies,dispose(){lab.dispose();disposeAsset(source);source.removeFromParent();}};
}
function simulate(context,seconds){for(let i=0;i<Math.round(seconds*60);i++)context.lab.step(1/60);}
function velocities(bodies){return{minimumMass:Math.min(...bodies.map(body=>body.mass())),maximumLinearSpeed:Math.max(...bodies.map(body=>length(body.linvel()))),maximumAngularSpeed:Math.max(...bodies.map(body=>length(body.angvel())))};}

async function pile(spec){
  const context=await setup(spec.shape,spec.options,null,spec.geometry);try{
    const fracture=()=>spec.tap?context.lab.tap(new THREE.Raycaster(new THREE.Vector3(...spec.tap.origin),new THREE.Vector3(...spec.tap.direction))):context.lab.fractureAll();
    if(spec.rebreak){assert(await fracture());simulate(context,settleSeconds+observationSeconds);context.lab.reset();assert.equal(context.lab.getStats().fragments,0);}
    const fractured=await fracture();
    assert.equal(fractured,true,`${spec.name}: ${context.lab.getStats().message}`);
    const created=context.bodies(),spawn=velocities(created),initialCount=created.length,samples=[],dropped=[],colliderVertices=new Map(created.map(body=>[body.handle,body.collider(0).shape.vertices]));let maxStep=0,maxAngle=0,totalTravel=0,movingFrames=0,awakeBodyFrames=0,firstAllRestingSeconds=null,minimumLateColliderY=Infinity,worstFloor=null,previous=new Map(created.map(body=>[body.handle,pose(body)]));
    if(!baseline){const impulse=spec.options?.impulse??1.8;assert.ok(spawn.maximumLinearSpeed<=impulse+1e-5,`${spec.name}: tiny shards must not amplify the launch speed`);assert.ok(spawn.maximumAngularSpeed<=Math.sqrt(3)*.6*impulse+1e-5,`${spec.name}: angular kick must be bounded independently of shard inertia`);}
    const start=performance.now();
    for(let frame=1;frame<=(settleSeconds+observationSeconds)*framesPerSecond;frame++){
      context.lab.step(1/60);const current=context.bodies();let moved=false;
      const retained=new Set(current.map(body=>body.handle));for(const[handle,lastPose]of previous)if(!retained.has(handle)&&!dropped.some(entry=>entry.handle===handle))dropped.push({handle,seconds:frame/60,lastPose});
      if(firstAllRestingSeconds===null&&current.length&&current.every(isResting))firstAllRestingSeconds=frame/60;
      for(const body of current){const next=pose(body);assert.ok(next.p.concat(next.q).every(Number.isFinite));const prior=previous.get(body.handle);if(frame>settleSeconds*framesPerSecond&&prior){const delta=movement(next,prior);maxStep=Math.max(maxStep,delta.distance);maxAngle=Math.max(maxAngle,delta.angle);totalTravel+=delta.distance;const low=lowestColliderY(next,colliderVertices.get(body.handle));if(low<minimumLateColliderY){minimumLateColliderY=low;const mesh=context.lab.getMeshes().find(mesh=>mesh.uuid===body.userData?.pieceId);worstFloor={seconds:frame/60,pieceId:body.userData?.pieceId,name:mesh?.name,bodyType:body.bodyType(),nativeSleeping:body.isSleeping(),customResting:!!body.userData?.resting,cachedColliderY:low,freshColliderY:lowestColliderY(next,body.collider(0).shape.vertices),geometryY:mesh?lowestColliderY(next,mesh.geometry.attributes.position.array):null};}if(delta.distance>1e-6||delta.angle>1e-5)moved=true;if(!isResting(body))awakeBodyFrames++;}previous.set(body.handle,next);}
      if(frame>settleSeconds*framesPerSecond&&moved)movingFrames++;
      if(frame%300===0)samples.push({seconds:frame/60,bodies:current.length,sleeping:current.filter(body=>body.isSleeping()).length,resting:current.filter(isResting).length,customResting:current.filter(body=>body.userData?.resting).length,...velocities(current)});
    }
    const unsettled=context.bodies().filter(body=>!isResting(body)).map(body=>({mass:body.mass(),position:body.translation(),linearSpeed:length(body.linvel()),angularSpeed:length(body.angvel())}));
    const result={name:spec.name,shape:spec.shape,geometry:spec.geometry??{},options:spec.options??{},tap:spec.tap??null,rebreak:!!spec.rebreak,initialCount,spawn,samples,firstAllRestingSeconds,unsettled,dropped,lateWindow:{from:settleSeconds,to:settleSeconds+observationSeconds,maxTranslationPerStep:maxStep,maxRotationPerStep:maxAngle,totalTranslationTravel:totalTravel,movingFrames,awakeBodyFrames,minimumColliderY:minimumLateColliderY,worstFloor},simulationMs:Math.round(performance.now()-start)};report.cases.push(result);
    if(!baseline){assert.equal(context.lab.getStats().sleeping,samples.at(-1).sleeping);assert.equal(context.lab.getStats().active,context.bodies().filter(isActive).length);assert.equal(context.lab.getStats().resting,samples.at(-1).resting);}
    if(!measure){assert.equal(samples.at(-1).bodies,initialCount,`${spec.name}: normal launch must retain every fragment`);assert.equal(unsettled.length,0,`${spec.name}: every floor-pile fragment should be resting by ${settleSeconds}s`);assert.equal(totalTravel,0,`${spec.name}: settled pile must not drift during ${settleSeconds}–${settleSeconds+observationSeconds}s`);assert.equal(maxAngle,0,`${spec.name}: settled pile must not rotate during ${settleSeconds}–${settleSeconds+observationSeconds}s`);assert.equal(awakeBodyFrames,0,`${spec.name}: settled pile must not repeatedly wake during ${settleSeconds}–${settleSeconds+observationSeconds}s`);assert.ok(minimumLateColliderY>=-.02,`${spec.name}: settled collider must stay above the floor within 2cm contact tolerance, got ${minimumLateColliderY}`);}
    console.log(JSON.stringify({case:result.name,initialCount,final:samples.at(-1),late:result.lateWindow,simulationMs:result.simulationMs}));return result;
  }finally{context.dispose();}
}

try{
  for(const spec of[
    {name:'boulder-default',shape:'boulder'},
    {name:'boulder-browser-tap',shape:'boulder',geometry:{seed:18427,roughness:.2},options:{fragmentCount:8,impactEnabled:true},tap:browserBoulderTap},
    {name:'boulder-browser-rebreak',shape:'boulder',geometry:{seed:18427,roughness:.2},options:{fragmentCount:8,impactEnabled:true},tap:browserBoulderTap,rebreak:true},
    {name:'boulder-browser-whole',shape:'boulder',geometry:{seed:18427,roughness:.2},options:{fragmentCount:12,impactEnabled:true}},
    {name:'block-default',shape:'block'},
    {name:'brick-default',shape:'brick'},
    {name:'wall-pile',shape:'wall',options:{fragmentCount:4,seed:701,impulse:.5}},
    {name:'bowl-pile',shape:'bowl',options:{seed:734}},
    {name:'vase-pile',shape:'vase',options:{seed:701}},
    {name:'jar-browser-pile',shape:'jar',geometry:{seed:701,roughness:.2},options:{fragmentCount:8,impactEnabled:true}},
    {name:'boulder-dense',shape:'boulder',options:{fragmentCount:24,seed:734,impulse:.3}},
    {name:'brick-quiet',shape:'brick',options:{fragmentCount:24,seed:701,impulse:0}},
  ])await pile(spec);

  // A slow apex has low speed but no supporting contact. It must continue its
  // arc and descend instead of being mistaken for settled floor debris.
  {
    const context=await setup('block',{method:'simple',fragmentCount:2,impulse:0,gravity:.8,fracturePlanes:{x:true,y:false,z:false}});try{
      assert(await context.lab.fractureAll());const bodies=context.bodies();bodies.forEach((body,index)=>{body.setTranslation({x:index*4,y:5,z:0},true);body.setLinvel({x:0,y:1.2,z:0},true);body.setAngvel({x:0,y:0,z:0},true);});
      let sleepingAirborne=false,minApexSpeed=Infinity;const heights=[];
      for(let frame=0;frame<240;frame++){context.lab.step(1/60);for(const body of bodies){sleepingAirborne ||= isResting(body);assert.equal(body.isDynamic(),true,'Unsupported pieces must stay dynamic');minApexSpeed=Math.min(minApexSpeed,Math.abs(body.linvel().y));}if(frame%30===29)heights.push(bodies[0].translation().y);}
      const result={sleepingAirborne,minApexSpeed,heights,finalVelocityY:bodies[0].linvel().y};report.counterexamples.slowUnsupportedApex=result;assert.equal(sleepingAirborne,false);assert.ok(minApexSpeed<.02&&result.finalVelocityY<-.5);assert.ok(heights.at(-1)<Math.max(...heights)-.8);
    }finally{context.dispose();}
  }
  // Touching another dynamic piece is not support. These halves share a
  // gentle tumble and stay in actual mutual contact throughout their apex.
  {
    const source=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),outer);mesh.position.y=5;source.add(mesh);
    const context=await setup('block',{method:'simple',fragmentCount:2,impulse:0,gravity:.8,fracturePlanes:{x:true,y:false,z:false}},source);try{
      assert(await context.lab.fractureAll());const bodies=context.bodies();assert.equal(bodies.length,2);bodies.forEach(body=>{body.setLinvel({x:0,y:1.2,z:0},true);body.setAngvel({x:.06,y:0,z:0},true);});
      let contactFrames=0,sleepingAirborne=false,minApexSpeed=Infinity;
      for(let frame=0;frame<180;frame++){context.lab.step(1/60);let touching=false;context.world.contactPair(bodies[0].collider(0),bodies[1].collider(0),manifold=>{touching ||= manifold.numContacts()>0;});if(touching)contactFrames++;for(const body of bodies){sleepingAirborne ||= isResting(body);assert.equal(body.isDynamic(),true,'Unsupported pieces must stay dynamic');minApexSpeed=Math.min(minApexSpeed,Math.abs(body.linvel().y));assert.ok(body.translation().y>4,'Pair remains clear of the floor');}}
      report.counterexamples.unsupportedTouchingPair={contactFrames,sleepingAirborne,minApexSpeed,finalVelocityY:bodies[0].linvel().y};assert.ok(contactFrames>150,'Counterexample must include sustained real mutual contacts');assert.equal(sleepingAirborne,false);assert.ok(minApexSpeed<.02);assert.ok(bodies.every(body=>body.linvel().y<-.5));
    }finally{context.dispose();}
  }
  // Frictionless contact should slide; the ordinary damping may gradually slow
  // it, but a generic low-speed contact rule must not abruptly stop it.
  {
    const context=await setup('block',{method:'simple',fragmentCount:2,impulse:0,friction:0,restitution:0,fracturePlanes:{x:true,y:false,z:false}});try{
      assert(await context.lab.fractureAll());simulate(context,5);const body=context.bodies()[0],start=pose(body);body.setLinvel({x:.65,y:0,z:0},true);body.setAngvel({x:0,y:0,z:0},true);simulate(context,4);const end=pose(body);const result={distance:end.p[0]-start.p[0],speed:length(body.linvel()),sleeping:body.isSleeping()};report.counterexamples.lowFrictionSlide=result;assert.ok(result.distance>1);assert.ok(result.speed>.1);assert.equal(result.sleeping,false);
    }finally{context.dispose();}
  }
  // A new physical collision must wake sleeping fragments. Only the lower box
  // is fractured first; the second intact box is fractured later and falls on it.
  {
    const source=new THREE.Group(),base=new THREE.Mesh(new THREE.BoxGeometry(1.2,1,1.2),outer),projectile=new THREE.Mesh(new THREE.BoxGeometry(.9,.9,.9),outer);base.position.y=.5;projectile.position.set(0,4,0);source.add(base,projectile);
    const context=await setup('block',{method:'simple',fragmentCount:2,impulse:0,restitution:0,fracturePlanes:{x:true,y:false,z:false}},source);try{
      assert(await context.lab.tap(new THREE.Raycaster(new THREE.Vector3(0,.5,8),new THREE.Vector3(0,0,-1))));simulate(context,8);const settled=context.bodies(),before=new Map(settled.map(body=>[body.handle,pose(body)]));const initiallyResting=settled.filter(isResting).length;assert.equal(initiallyResting,settled.length);
      assert(await context.lab.tap(new THREE.Raycaster(new THREE.Vector3(0,4,8),new THREE.Vector3(0,0,-1))));const awakened=new Set(),maximumMovement=new Map(settled.map(body=>[body.handle,0]));
      for(let i=0;i<180;i++){context.lab.step(1/60);for(const body of settled){if(isActive(body))awakened.add(body.handle);maximumMovement.set(body.handle,Math.max(maximumMovement.get(body.handle),movement(pose(body),before.get(body.handle)).distance));}}
      report.counterexamples.newImpactWakes={initiallyResting,awakened:awakened.size,movementPerBody:[...maximumMovement.values()]};assert.equal(awakened.size,settled.length,'A new physical impact wakes both sleeping pieces');assert.ok([...maximumMovement.values()].every(distance=>distance>.001));
    }finally{context.dispose();}
  }
  {
    const source=new THREE.Group();for(const x of[-1.4,1.4]){const base=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),outer);base.position.set(x,.5,0);source.add(base);}const projectile=new THREE.Mesh(new THREE.BoxGeometry(4,.8,1),outer);projectile.position.y=4;source.add(projectile);
    const context=await setup('block',{method:'simple',fragmentCount:2,impulse:0,restitution:0,fracturePlanes:{x:true,y:false,z:false}},source);try{
      for(const x of[-1.4,1.4])assert(await context.lab.tap(new THREE.Raycaster(new THREE.Vector3(x,.5,8),new THREE.Vector3(0,0,-1))));simulate(context,8);const settled=context.bodies(),before=new Map(settled.map(body=>[body.handle,pose(body)]));assert.equal(settled.length,4);assert.ok(settled.every(isResting));
      const left=settled.filter(body=>body.translation().x<0),right=settled.filter(body=>body.translation().x>0);let touchingIslands=false;for(const a of left)for(const b of right)context.world.contactPair(a.collider(0),b.collider(0),manifold=>{touchingIslands ||= manifold.numContacts()>0;});assert.equal(touchingIslands,false,'Separate piles must not share a dynamic contact before the impact');
      assert(await context.lab.tap(new THREE.Raycaster(new THREE.Vector3(0,4,8),new THREE.Vector3(0,0,-1))));const awakened=new Set(),maximumMovement=new Map(settled.map(body=>[body.handle,0]));for(let frame=0;frame<180;frame++){context.lab.step(1/60);for(const body of settled){if(isActive(body))awakened.add(body.handle);maximumMovement.set(body.handle,Math.max(maximumMovement.get(body.handle),movement(pose(body),before.get(body.handle)).distance));}}
      report.counterexamples.newImpactWakesSeparateIslands={initiallyResting:settled.length,independentIslands:2,awakened:awakened.size,movementPerBody:[...maximumMovement.values()]};assert.equal(awakened.size,settled.length);assert.ok([...maximumMovement.values()].every(distance=>distance>.001));
    }finally{context.dispose();}
  }
  // A real, gentle incoming fragment must release a custom rest group. Give
  // the incoming body zero gravity so its measured contact speed stays below
  // the quiet-speed threshold, rather than relying on a large falling impact.
  {
    const source=new THREE.Group(),base=new THREE.Mesh(new THREE.BoxGeometry(1.2,1,1.2),outer),projectile=new THREE.Mesh(new THREE.BoxGeometry(.8,.8,.8),outer);base.position.y=.5;projectile.position.set(0,6,0);source.add(base,projectile);
    const context=await setup('block',{method:'simple',fragmentCount:2,impulse:0,restitution:0,fracturePlanes:{x:true,y:false,z:false}},source);try{
      assert(await context.lab.tap(new THREE.Raycaster(new THREE.Vector3(0,.5,8),new THREE.Vector3(0,0,-1))));
      simulate(context,8);
      const settled=context.bodies(),before=new Map(settled.map(body=>[body.handle,pose(body)]));assert.ok(settled.every(isResting));assert.ok(settled.every(body=>body.userData?.resting),'Exercise the custom rest path');
      assert(await context.lab.tap(new THREE.Raycaster(new THREE.Vector3(0,6,8),new THREE.Vector3(0,0,-1))));
      const incoming=context.bodies().filter(body=>!before.has(body.handle));for(let index=0;index<incoming.length;index++){const body=incoming[index];body.setGravityScale(0,true);body.setTranslation({x:8+index*2,y:5,z:0},true);body.setLinvel({x:0,y:0,z:0},true);body.setAngvel({x:0,y:0,z:0},true);}
      const striker=incoming[0];striker.setRotation({x:0,y:0,z:0,w:1},true);const vertices=striker.collider(0).shape.vertices;let maxX=-Infinity;for(let i=0;i<vertices.length;i+=3)maxX=Math.max(maxX,vertices[i]);
      striker.setTranslation({x:-.6-maxX-.006,y:.5,z:0},true);striker.setLinvel({x:.2,y:0,z:0},true);
      const awakened=new Set(),maximumMovement=new Map(settled.map(body=>[body.handle,0]));let contacts=0,firstContactSpeed=null,prematureRest=0;
      for(let frame=0;frame<18;frame++){const incomingSpeed=length(striker.linvel());context.lab.step(1/60);for(const body of settled){if(isActive(body))awakened.add(body.handle);if(frame<6&&body.userData?.resting)prematureRest++;maximumMovement.set(body.handle,Math.max(maximumMovement.get(body.handle),movement(pose(body),before.get(body.handle)).distance));context.world.contactPair(striker.collider(0),body.collider(0),manifold=>{if(manifold.numContacts()){contacts++;firstContactSpeed??=incomingSpeed;}});}}
      report.counterexamples.gentleSupportedWake={speed:.2,observationSeconds:.3,contacts,firstContactSpeed,prematureRest,awakened:awakened.size,movementPerBody:[...maximumMovement.values()]};assert.ok(contacts>0,'Gentle wake must include an actual collision');assert.ok(firstContactSpeed<=.25);assert.equal(prematureRest,0,'A gentle collision must earn a fresh quiet interval');assert.equal(awakened.size,settled.length,'The connected resting group must return to dynamic bodies');assert.ok([...maximumMovement.values()].some(distance=>distance>1e-5),'The gentle incoming fragment must physically move the pile');
    }finally{context.dispose();}
  }
  // Breaking a fixed support must release the rested fragments it carries.
  {
    const source=new THREE.Group(),support=new THREE.Mesh(new THREE.BoxGeometry(1.2,2,1.2),outer),top=new THREE.Mesh(new THREE.BoxGeometry(1.1,.8,1.1),outer);support.position.y=1;top.position.y=2.4;source.add(support,top);
    const context=await setup('block',{method:'simple',fragmentCount:2,impulse:0,restitution:0,fracturePlanes:{x:true,y:false,z:false}},source);try{
      assert(await context.lab.tap(new THREE.Raycaster(new THREE.Vector3(0,2.4,8),new THREE.Vector3(0,0,-1))));simulate(context,8);const carried=context.bodies(),before=new Map(carried.map(body=>[body.handle,pose(body)]));assert.ok(carried.every(isResting));
      context.lab.update({impulse:1.8});assert(await context.lab.tap(new THREE.Raycaster(new THREE.Vector3(0,1,8),new THREE.Vector3(0,0,-1))));const awakened=new Set();let maxFall=0;
      for(let frame=0;frame<240;frame++){context.lab.step(1/60);for(const body of carried){if(isActive(body))awakened.add(body.handle);maxFall=Math.max(maxFall,before.get(body.handle).p[1]-body.translation().y);}}
      report.counterexamples.supportFractureReleases={carried:carried.length,awakened:awakened.size,maxFall};assert.equal(awakened.size,carried.length);assert.ok(maxFall>.1,'Rested fragments must fall when their support breaks');
    }finally{context.dispose();}
  }
  {
    const source=buildAsset({...defaults},outer);source.position.y=4;const context=await setup('block',{method:'simple',fragmentCount:2,impulse:0},source);try{
      assert(await context.lab.fractureAll());simulate(context,.2);context.lab.setPaused(true);const bodies=context.bodies(),before=bodies.map(pose);simulate(context,2);assert.deepEqual(bodies.map(pose),before);context.lab.setPaused(false);simulate(context,.5);assert.ok(bodies.some((body,index)=>movement(pose(body),before[index]).distance>.5));report.counterexamples.pauseResume={pauseExact:true,resumedFalling:true};
    }finally{context.dispose();}
  }
  assert.equal(await sourceHash(),report.sourceHash,'Baseline/verification must use one fracture runtime revision');report.passed=true;
  console.log(JSON.stringify({passed:true,baseline,measurementOnly:measure,cases:report.cases.length,counterexamples:report.counterexamples,output},null,2));
}catch(error){report.passed=false;report.failure=error.stack;throw error;}
finally{RAPIER.World.prototype.createRigidBody=nativeCreate;console.warn=originalWarn;outer.dispose();inner.dispose();await fs.writeFile(path.join(output,baseline?'baseline.json':measure?'measurement.json':'report.json'),JSON.stringify(report,null,2));}
