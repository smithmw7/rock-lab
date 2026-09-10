import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Box3, Vector3, MeshBasicMaterial } from 'three';
import { buildAsset, disposeAsset, SHAPE_GROUPS } from '../src/geometry.js';
import { createRockMaterial, updateRockMaterial, ROCK_SURFACES } from '../src/material.js';
import { shapes as catalogShapes, surfaces, grounds, looks } from '../src/catalog.js';
import { GROUND_TYPES } from '../src/ground.js';
import { WORKSHOP_MATERIAL_DEFAULTS, WORKSHOP_MATERIAL_RANGES, WORKSHOP_SURFACES } from '../src/workshop-materials.js';

const material=new MeshBasicMaterial();
const shapes=SHAPE_GROUPS.flatMap(group=>group.shapes);
assert.deepEqual([...shapes].sort(),Object.keys(catalogShapes).sort());
assert.deepEqual(ROCK_SURFACES.map(s=>s.key).sort(),Object.keys(surfaces).sort());
assert.deepEqual(Object.keys(GROUND_TYPES).sort(),Object.keys(grounds).sort());
const timings=[];let combinations=0,displacementCases=0,maxTriangles=0;
function hash(group){const h=createHash('sha256');group.traverse(mesh=>{if(mesh.isMesh){h.update(Buffer.from(mesh.geometry.attributes.position.array.buffer));h.update(JSON.stringify(mesh.matrix.elements));}});return h.digest('hex');}
function validate(group,shape){
  const bounds=new Box3().setFromObject(group),size=bounds.getSize(new Vector3());
  assert.equal(group.userData.connectivity?.unsupported.length,0,`${shape} has unsupported chunks`);
  assert(Math.abs(bounds.min.y)<.002,`${shape} must rest at y=0`);
  assert(size.x>0&&size.y>0&&size.z>0,`${shape} must have volume`);
  assert(size.x<=3.601&&size.y<=3.401&&size.z<=3.201,`${shape} exceeds normalization bounds`);
  let triangles=0;
  group.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const geo=mesh.geometry,pos=geo.attributes.position;
    assert.equal(pos.count%3,0);triangles+=pos.count/3;
    for(const name of ['position','normal','color','aFaceTone','aBevel','uv']){
      const attribute=geo.attributes[name];assert(attribute,`${shape} missing ${name}`);assert.equal(attribute.count,pos.count);
      for(const v of attribute.array)assert(Number.isFinite(v),`${shape} has invalid ${name}`);
    }
    const a=new Vector3(),b=new Vector3(),c=new Vector3(),n=new Vector3(),face=new Vector3();
    for(let i=0;i<pos.count;i+=3){
      a.fromBufferAttribute(pos,i);b.fromBufferAttribute(pos,i+1);c.fromBufferAttribute(pos,i+2);face.crossVectors(b.sub(a),c.sub(a));
      assert(face.lengthSq()>1e-14,`${shape} degenerate triangle`);n.fromBufferAttribute(geo.attributes.normal,i);
      assert(face.dot(n)>0,`${shape} reversed winding`);
    }
  });
  assert(triangles<=36000,`${shape} exceeded triangle budget`);maxTriangles=Math.max(maxTriangles,triangles);
}
for(const shape of shapes)for(const seed of [1,18427,999999])for(const level of [0,1]){
  const start=performance.now(),options={shape,seed,facets:level,roughness:level,bevel:level};
  const group=buildAsset(options,material);timings.push(performance.now()-start);validate(group,shape);
  const repeated=buildAsset(options,material);assert.equal(hash(group),hash(repeated),'Seeded geometry must be reproducible');
  disposeAsset(group);disposeAsset(repeated);combinations++;
}
for(const shape of shapes)for(const geometryNoiseScale of [.3,8]){
  const options={shape,seed:72103,facets:.5,roughness:.35,bevel:.5,geometryNoiseScale};
  const plain=buildAsset(options,material),displaced=buildAsset({...options,displacement:1},material);
  validate(displaced,shape);assert.notEqual(hash(plain),hash(displaced),`${shape} displacement must change vertices`);
  const repeat=buildAsset({...options,displacement:1},material);assert.equal(hash(displaced),hash(repeat));
  disposeAsset(plain);disposeAsset(displaced);disposeAsset(repeat);displacementCases++;
}
const mat=createRockMaterial(),key=mat.customProgramCacheKey(),version=mat.version;
const originalSurfaceKeys=new Set(['stone','ice','desert','limestone','granite','basalt','obsidian']);
const nativeFeatures=['transmission','dispersion','iridescence','clearcoat'];
function updateChecked(options){
  const before=nativeFeatures.map(name=>(mat[name]??0)>0),beforeVersion=mat.version;
  updateRockMaterial(mat,options);
  const changedFlags=nativeFeatures.filter((name,index)=>((mat[name]??0)>0)!==before[index]).length;
  assert.equal(mat.version-beforeVersion,changedFlags,'Only native physical shader feature toggles may invalidate the material');
  assert.equal(mat.customProgramCacheKey(),key,'Physical values must retain the same custom shader implementation');
}
for(const [index,surface] of ROCK_SURFACES.entries()){
  updateChecked({surface:surface.key});
  assert.equal(mat.userData.rockUniforms.uRockSurface.value,index);
  assert.equal(mat.userData.rockUniforms.uRockRoughness.value,surface.defaultRoughness);
  const family=WORKSHOP_SURFACES[surface.key]?.family;
  assert.equal(mat.metalness,family==='metal'?1:0,`${surface.key} must use the correct conductor/dielectric response`);
  assert.equal(mat.transmission>0,index>=7&&index<=9,`${surface.key} must only enable transmission for optical surfaces`);
  assert.equal(mat.clearcoat>0,family==='ceramic',`${surface.key} must only enable glaze clearcoat for ceramics`);
  for(const mapView of ['beauty','normal','height','roughness']){
    updateChecked({mapView,noiseScale:3.7,noiseAmount:.8,normalStrength:.6,materialRoughness:.19});
    assert.equal(mat.userData.rockUniforms.uRockNormalStrength.value,.6);
    assert.equal(mat.userData.rockUniforms.uRockRoughness.value,.19);
    if(originalSurfaceKeys.has(surface.key))assert.equal(mat.version,version,'Original seven materials must keep uniform-only updates');
  }
}
// A recipe retains inactive family's values. Switching from optical material
// must not silently make wood, metal or clay transmissive or iridescent.
for(const [surface,preset] of Object.entries(WORKSHOP_SURFACES)){
  updateChecked({surface,...WORKSHOP_MATERIAL_DEFAULTS,transmission:1,dispersion:1,iridescence:1});
  assert.equal(mat.transmission,0);assert.equal(mat.dispersion,0);assert.equal(mat.iridescence,0);
  for(const [field,[min,max]] of Object.entries(WORKSHOP_MATERIAL_RANGES)){
    updateChecked({[field]:-999});assert.equal(mat.userData.workshopOptions[field],min);
    updateChecked({[field]:999});assert.equal(mat.userData.workshopOptions[field],max);
    updateChecked({[field]:Number.NaN});assert.equal(mat.userData.workshopOptions[field],max);
  }
  updateChecked({ceramicGlaze:0});assert.equal(mat.clearcoat,0);
  updateChecked({ceramicGlaze:1});assert.equal(mat.clearcoat,preset.family==='ceramic'?.85:0);
}
for(const look of Object.values(looks)){assert(catalogShapes[look.options.shape]);assert(surfaces[look.options.surface]);assert(grounds[look.options.ground]);}
mat.dispose();material.dispose();timings.sort((a,b)=>a-b);
console.log(JSON.stringify({passed:true,shapes:shapes.length,materials:ROCK_SURFACES.length,grounds:Object.keys(grounds).length,baseCases:combinations,displacementCases,maxTriangles,medianBaseGenerationMs:+timings[Math.floor(timings.length/2)].toFixed(2),p95BaseGenerationMs:+timings[Math.floor(timings.length*.95)].toFixed(2),checks:['geometry and UV validity','winding','support and grounding','bounds','deterministic geometry','actual displacement','triangle budget','uniform-only materials','catalog and preset consistency']},null,2));
