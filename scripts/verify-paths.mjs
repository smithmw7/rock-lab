import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { buildAsset, disposeAsset } from '../src/geometry.js';
import { PATH_SHAPES, PATH_DEFAULTS, PATH_LIMITS, sanitizePathOptions, samplePathForEditor } from '../src/path-geometry.js';
import { assertNonOverlappingFootprints, assertPathDiagnostics } from './path-assertions.mjs';

const material=new THREE.MeshBasicMaterial(),summary={passed:false,cases:0,meshes:0,edges:0,footprints:0,maxTriangles:0,maxGenerationMs:0};
const signature=group=>{
  const digest=createHash('sha256');group.updateMatrixWorld(true);
  group.traverse(mesh=>{if(mesh.isMesh){digest.update(Buffer.from(mesh.geometry.attributes.position.array.buffer));digest.update(JSON.stringify(mesh.matrixWorld.elements));}});
  return digest.digest('hex');
};
function validate(input,{topology=true}={}){
  const started=performance.now(),group=buildAsset(input,material);
  summary.maxGenerationMs=Math.max(summary.maxGenerationMs,performance.now()-started);
  try{
    const meshes=[];group.traverse(object=>{if(object.isMesh)meshes.push(object);});
    const triangles=meshes.reduce((sum,mesh)=>sum+(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3,0);
    assertPathDiagnostics(group.userData.path,{meshes:meshes.length,triangles},input.shape);
    assertNonOverlappingFootprints(group.userData.path.footprints,input.shape);
    assert.ok(Math.abs(new THREE.Box3().setFromObject(group).min.y)<.002,`${input.shape} must rest on the ground`);
    for(const mesh of meshes){
      assert.ok(['primary','handle','trim'].includes(mesh.userData.materialSlot||'primary'));
      const geometry=mesh.geometry,position=geometry.attributes.position,index=geometry.index;
      for(const name of ['position','normal','uv','color','aFaceTone','aBevel']){
        assert.equal(geometry.attributes[name]?.count,position.count,`${input.shape} ${name}`);
        assert.ok(geometry.attributes[name].array.every(Number.isFinite));
      }
      if(input.shape!=='objectPath')assert.equal(geometry.attributes.aRockPosition.count,position.count);
      // Repeated objects share untouched source buffers, including any legacy
      // microscopic weld slivers. Their exact copy parity is audited below;
      // the new paving solids themselves must pass strict closure here.
      if(!topology||input.shape==='objectPath')continue;
      const keys=Array.from({length:position.count},(_,i)=>[position.getX(i),position.getY(i),position.getZ(i)].map(n=>Math.round(n*1e6)).join(','));
      const edges=new Map(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),n=new THREE.Vector3();let volume=0;
      for(let i=0;i<(index?.count??position.count);i+=3){
        const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j);
        a.fromBufferAttribute(position,ids[0]);b.fromBufferAttribute(position,ids[1]);c.fromBufferAttribute(position,ids[2]);
        const face=b.clone().sub(a).cross(c.clone().sub(a));
        assert.ok(face.lengthSq()>1e-14,`${input.shape}/${mesh.name}: degenerate triangle`);
        n.fromBufferAttribute(geometry.attributes.normal,ids[0]);assert.ok(face.dot(n)>0,`${input.shape}/${mesh.name}: winding disagrees with normal`);
        volume+=a.dot(b.clone().cross(c))/6;
        for(let j=0;j<3;j++){
          const from=keys[ids[j]],to=keys[ids[(j+1)%3]];assert.notEqual(from,to,`${input.shape}: collapsed edge`);
          const key=from<to?`${from}|${to}`:`${to}|${from}`,record=edges.get(key)||{count:0,direction:0};
          record.count++;record.direction+=from<to?1:-1;edges.set(key,record);
        }
      }
      assert.ok(volume>1e-7,`${input.shape}/${mesh.name}: nonpositive solid volume`);
      for(const [key,record] of edges){assert.equal(record.count,2,`${input.shape}/${mesh.name}: boundary ${key}`);assert.equal(record.direction,0,`${input.shape}/${mesh.name}: winding ${key}`);}
      summary.edges+=edges.size;
    }
    summary.cases++;summary.meshes+=meshes.length;summary.footprints+=group.userData.path.footprints.length;summary.maxTriangles=Math.max(summary.maxTriangles,triangles);
    return{signature:signature(group),path:group.userData.path,dimensions:new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3()).toArray()};
  }finally{disposeAsset(group);}
}
const cases={
  default:{},
  straight:{pathPoints:[{x:-4,z:0},{x:4,z:0}],pathSmoothness:0},
  hairpin:{pathPoints:[{x:-3,z:-1},{x:2,z:-1},{x:2.1,z:0},{x:-2,z:.3}],pathWidth:3,pathPieceSize:.25,pathSpacing:.05,pathJitter:1,pathSmoothness:1},
  sCurve:{pathPoints:[{x:-4,z:0},{x:-2,z:2},{x:0,z:-2},{x:2,z:2},{x:4,z:0}],pathWidth:2.4,pathPieceSize:.3,pathSpacing:.05,pathOffset:.7},
  closed:{pathPoints:[{x:-2,z:-2},{x:2,z:-2},{x:2,z:2},{x:-2,z:2}],pathClosed:true,pathWidth:1.6,pathSpacing:.05},
  crossing:{pathPoints:[{x:-3,z:-2},{x:3,z:2},{x:-3,z:2},{x:3,z:-2}],pathSmoothness:0,pathWidth:2},
  dense:{pathPoints:[{x:-12,z:-12},{x:12,z:-12},{x:12,z:12},{x:-12,z:12}],pathClosed:true,pathWidth:3,pathPieceSize:.25,pathSpacing:.05,pathThickness:.08,pathJitter:1,pathRotation:1},
};
try{
  for(const shape of PATH_SHAPES)for(const [name,options] of Object.entries(cases)){
    for(const level of [0,1])validate({shape,seed:19423,...options,bevel:level,displacement:level,geometryNoiseScale:8});
    if(name==='default'){
      const input={shape,seed:9931,...options};assert.equal(validate(input).signature,validate(input).signature,`${shape} must be deterministic`);
      assert.notEqual(validate(input).signature,validate({...input,seed:9932}).signature,`${shape} must respond to seed`);
    }
  }
  for(const pathObject of ['chair','hammer','knife','vase','smallBlock','metalTube','gear']){
    const result=validate({shape:'objectPath',pathObject,pathObjectScale:.3,pathSpacing:.12});
    assert.ok(result.path.objectCount>0,`${pathObject}: no copied source objects`);
  }
  const straight=samplePathForEditor({...PATH_DEFAULTS,pathPoints:[{x:-4,z:0},{x:4,z:0}],pathSmoothness:0,pathOffset:.7});
  assert.ok(Math.abs(straight.length-8)<1e-7,'A straight 8-unit path keeps its measured length');
  assert.ok(straight.centerline.every(point=>Math.abs(point.z-.7)<1e-7),'Offset uses immutable centerline tangents');
  const negativeOffset=samplePathForEditor({...PATH_DEFAULTS,pathPoints:[{x:-4,z:0},{x:4,z:0}],pathSmoothness:0,pathOffset:-1});
  assert.ok(negativeOffset.centerline.every(point=>Math.abs(point.z+1)<1e-7),'Negative offset preserves the same tangent basis');
  const closedOffset=samplePathForEditor({...cases.closed,pathOffset:1});
  assert.ok(Math.hypot(closedOffset.centerline[0].x-closedOffset.centerline.at(-1).x,closedOffset.centerline[0].z-closedOffset.centerline.at(-1).z)<1e-8,'An offset closed spline joins at the same point');
  assert.ok(samplePathForEditor(cases.crossing).selfIntersections>0,'Self-crossings must be reported');
  const sanitized=sanitizePathOptions({pathPoints:[{x:-99,z:99},{x:0,z:0},{x:0,z:0},{x:Infinity,z:1}],pathObject:'objectPath',pathWidth:99,pathSpacing:-1,pathClosed:true});
  assert.deepEqual(sanitized.pathPoints,[{x:-12,z:12},{x:0,z:0}]);assert.equal(sanitized.pathObject,'boulder');assert.equal(sanitized.pathWidth,3);assert.equal(sanitized.pathSpacing,.05);assert.equal(sanitized.pathClosed,false);
  const large=validate({shape:'cobblePath',...cases.dense});assert.ok(large.path.truncated);assert.ok(large.dimensions[0]>20&&large.dimensions[2]>20,'Paths retain world scale instead of single-object normalization');
  // Generic repeats share the prototype's buffers but keep independent mesh
  // transforms and metal/handle/trim assignments. No cloned geometry budget.
  const group=buildAsset({shape:'objectPath',pathObject:'hammer',pathObjectScale:.2,pathPoints:[{x:-5,z:0},{x:5,z:0}]},material);
  assert.ok(group.children.length>1);assert.notEqual(group.children[0],group.children[1]);
  for(let i=0;i<group.children[0].children.length;i++)assert.equal(group.children[0].children[i].geometry,group.children[1].children[i].geometry);
  const slots=new Set();group.traverse(mesh=>{if(mesh.isMesh)slots.add(mesh.userData.materialSlot);});assert.deepEqual([...slots].sort(),['handle','primary','trim']);disposeAsset(group);
  for(const shape of ['boulder','hammer','chair','vase']){
    const options={shape,seed:9931,facets:.5,roughness:.35,bevel:.5},prototype=buildAsset(options,material),path=buildAsset({...options,shape:'objectPath',pathObject:shape},material);
    const sourceMeshes=[];prototype.traverse(mesh=>{if(mesh.isMesh)sourceMeshes.push(mesh);});
    for(let i=0;i<sourceMeshes.length;i++)assert.deepEqual(path.children[0].children[i].geometry.attributes.position.array,sourceMeshes[i].geometry.attributes.position.array,`${shape}: path must preserve source geometry exactly`);
    disposeAsset(path);disposeAsset(prototype);
  }
  assert.equal(PATH_LIMITS.maxPieces,128);assert.equal(PATH_LIMITS.maxTriangles,80000);
  summary.passed=true;summary.maxGenerationMs=+summary.maxGenerationMs.toFixed(2);summary.checks=['Closed, consistently wound paving solids at both displacement extremes','Independent SAT overlap audit of actual footprints','Default, straight, S, acute hairpin, closed, and crossing paths','World-unit arc-length and immutable lateral offset','Dense path budget and visible truncation diagnostics','Deterministic geometry and seed variation','Generic source buffer sharing, exact source geometry parity, and material slots'];
  console.log(JSON.stringify(summary,null,2));
}finally{material.dispose();}
