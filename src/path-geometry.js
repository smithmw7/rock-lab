import * as THREE from 'three';

export const PATH_MAX_TRIANGLES = 80000;
export const PATH_MAX_PIECES = 128;
export const PATH_LIMITS = Object.freeze({ maxTriangles:PATH_MAX_TRIANGLES, maxPieces:PATH_MAX_PIECES, maxPoints:12, coordinateLimit:12 });
export const PATH_DEFAULTS = Object.freeze({
  pathPoints:[{x:-3,z:-1.2},{x:-1,z:-.8},{x:1,z:1.2},{x:3,z:.8}],
  pathWidth:1.4,pathSpacing:.12,pathPieceSize:.55,pathThickness:.16,pathJitter:.35,pathRotation:.25,
  pathOffset:0,pathSmoothness:.75,pathObject:'boulder',pathObjectScale:.45,pathAlign:true,pathClosed:false,
});
export const PATH_RANGES = Object.freeze({
  pathWidth:[.5,3],pathSpacing:[.05,1],pathPieceSize:[.25,1],pathThickness:[.08,.45],
  pathJitter:[0,1],pathRotation:[0,1],pathOffset:[-1,1],pathSmoothness:[0,1],pathObjectScale:[.15,1],
});
export const PATH_ENUMS = Object.freeze({});
export const PATH_GROUPS = [{id:'paths',label:'Paths',description:'Editable spline paths made from fitted paving, boards, or repeated objects.',shapes:['steppingStonePath','brickPath','cobblePath','plankPath','objectPath']}];
export const PATH_SHAPES = new Set(PATH_GROUPS[0].shapes);
export const PATH_CATALOG = {
  steppingStonePath:{label:'Stepping stones',title:'Spline stepping-stone path',description:'Spaced flat stones following an editable curve',kind:'path',defaultSurface:'stone',icon:'M2 27 8 24 12 27 8 31Z M8 17 15 15 19 19 13 22Z M17 7 23 5 28 9 23 13Z M23 1 28 1 31 3 28 5Z'},
  brickPath:{label:'Brick path',title:'Fitted running-bond brick path',description:'Separate staggered bricks fitted around a curve',kind:'path',defaultSurface:'desert',icon:'M3 29 7 15 19 3 H29 L18 18 13 29Z M5 22 H16 M7 15 22 14 M13 8 26 8 M10 22 11 15 M17 14 19 8'},
  cobblePath:{label:'Cobblestone path',title:'Fitted Voronoi cobblestone path',description:'Shared irregular cells with genuine mortar gaps',kind:'path',defaultSurface:'stone',icon:'M2 30 5 17 16 3 H29 L19 16 14 30Z M3 24 9 21 15 25 M9 21 8 14 17 13 20 18 M17 13 17 7 24 9 M9 21 8 30'},
  plankPath:{label:'Plank walkway',title:'Crosswise wooden plank path',description:'Separate boards with grain aligned along each plank',kind:'path',defaultSurface:'oak',icon:'M2 25 15 29 17 24 4 20Z M5 16 18 20 21 16 8 12Z M11 8 24 12 27 8 15 4Z M20 1 30 4'},
  objectPath:{label:'Object path',title:'Repeated-object spline path',description:'Distribute any single object at measured distances',kind:'path',defaultSurface:'stone',icon:'M1 24 7 21 13 25 8 30Z M10 13 16 10 22 14 17 19Z M20 3 26 1 31 5 27 10Z M7 19 13 12 M19 10 24 5'},
};
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
const finite=(n,fallback)=>Number.isFinite(Number(n))?Number(n):fallback;
const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const area=polygon=>polygon.reduce((sum,p,i)=>sum+p.x*polygon[(i+1)%polygon.length].z-p.z*polygon[(i+1)%polygon.length].x,0)*.5;
const center=polygon=>polygon.reduce((p,v)=>({x:p.x+v.x/polygon.length,z:p.z+v.z/polygon.length}),{x:0,z:0});
function random(seed){let n=(Number(seed)||1)>>>0;return()=>{n+=0x6d2b79f5;let t=n;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}

export function sanitizePathOptions(input={}){
  const result={...PATH_DEFAULTS,pathPoints:PATH_DEFAULTS.pathPoints.map(point=>({...point}))};
  for(const [key,range] of Object.entries(PATH_RANGES))result[key]=clamp(input[key]==null?result[key]:finite(input[key],result[key]),...range);
  if(Array.isArray(input.pathPoints)){
    const points=[];
    for(const point of input.pathPoints.slice(0,12)){
      if(!point||!Number.isFinite(Number(point.x))||!Number.isFinite(Number(point.z)))continue;
      const next={x:clamp(Number(point.x),-12,12),z:clamp(Number(point.z),-12,12)};
      if(!points.length||distance(points.at(-1),next)>.04)points.push(next);
    }
    if(points.length>=2)result.pathPoints=points;
  }
  for(const key of ['pathAlign','pathClosed'])if(typeof input[key]==='boolean')result[key]=input[key];
  if(result.pathPoints.length<3)result.pathClosed=false;
  if(typeof input.pathObject==='string'&&/^[a-zA-Z][a-zA-Z0-9]{0,48}$/.test(input.pathObject)&&!PATH_SHAPES.has(input.pathObject))result.pathObject=input.pathObject;
  return result;
}

function segmentCross(a,b,c,d){
  const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
  if(abC*abD<-1e-12&&cdA*cdB<-1e-12)return true;
  const on=(p,q,r)=>r.x>=Math.min(p.x,q.x)-1e-7&&r.x<=Math.max(p.x,q.x)+1e-7&&r.z>=Math.min(p.z,q.z)-1e-7&&r.z<=Math.max(p.z,q.z)+1e-7;
  // A genuine crossing can land exactly on a sampled vertex. Ignoring all
  // endpoint contacts would miss an X-shaped user path through the origin.
  return(Math.abs(abC)<1e-9&&on(a,b,c))||(Math.abs(abD)<1e-9&&on(a,b,d))||(Math.abs(cdA)<1e-9&&on(c,d,a))||(Math.abs(cdB)<1e-9&&on(c,d,b));
}
function sampleCurve(input){
  const options=sanitizePathOptions(input),points=options.pathPoints;
  const vectors=points.map(p=>new THREE.Vector3(p.x,0,p.z));
  // Scale Hermite tangents with the smoothness control. Blending a spline's
  // positions with a polyline would retain derivative jumps at every handle,
  // causing fitted rows and crosswise boards to collide at the default bends.
  const curve=new THREE.CatmullRomCurve3(vectors,options.pathClosed,'catmullrom',options.pathSmoothness*.5);
  const count=Math.max(40,points.length*24),segments=points.length-(options.pathClosed?0:1),centerline=[];
  for(let i=0;i<=count;i++){
    const t=i/count,station=Math.min(segments-1,Math.floor(t*segments)),u=t*segments-station;
    const a=vectors[station],b=vectors[(station+1)%vectors.length],linear=a.clone().lerp(b,u),smooth=curve.getPoint(t);
    const point=options.pathSmoothness>0?smooth:linear;
    centerline.push({x:point.x,z:point.z});
  }
  // Offset is applied in world space and then measured again. Arc-length
  // placement therefore remains uniform when the user moves to either rail.
  const unshifted=centerline.slice();
  if(options.pathOffset)for(let i=0;i<centerline.length;i++){
    const previous=unshifted[options.pathClosed&&i===0?unshifted.length-2:Math.max(0,i-1)],next=unshifted[options.pathClosed&&i===unshifted.length-1?1:Math.min(unshifted.length-1,i+1)];
    const dx=next.x-previous.x,dz=next.z-previous.z,l=Math.hypot(dx,dz)||1;
    centerline[i]={x:centerline[i].x-dz/l*options.pathOffset,z:centerline[i].z+dx/l*options.pathOffset};
  }
  let length=0,selfIntersections=0;const lengths=[0];
  for(let i=1;i<centerline.length;i++){length+=distance(centerline[i-1],centerline[i]);lengths.push(length);}
  for(let i=0;i<centerline.length-1;i++)for(let j=i+3;j<centerline.length-1;j++){
    if(options.pathClosed&&i===0&&j===centerline.length-2)continue;
    if(segmentCross(centerline[i],centerline[i+1],centerline[j],centerline[j+1]))selfIntersections++;
  }
  const bounds={xMin:Math.min(...centerline.map(p=>p.x)),xMax:Math.max(...centerline.map(p=>p.x)),zMin:Math.min(...centerline.map(p=>p.z)),zMax:Math.max(...centerline.map(p=>p.z))};
  const at=s=>{
    s=options.pathClosed?((s%length)+length)%length:clamp(s,0,length);
    let lo=1,hi=lengths.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(lengths[mid]<s)lo=mid+1;else hi=mid;}
    const i=lo,a=centerline[i-1],b=centerline[i],l=Math.max(1e-9,lengths[i]-lengths[i-1]),u=(s-lengths[i-1])/l;
    const tx=(b.x-a.x)/l,tz=(b.z-a.z)/l;
    return{x:a.x+(b.x-a.x)*u,z:a.z+(b.z-a.z)*u,tx,tz,nx:-tz,nz:tx,s};
  };
  return{options,centerline,lengths,length,bounds,selfIntersections,at};
}
export function samplePathForEditor(input={}){
  const {options,centerline,length,bounds,selfIntersections}=sampleCurve(input);
  return{points:options.pathPoints,centerline,length,bounds,selfIntersections,closed:options.pathClosed};
}

function cleanPolygon(polygon){
  let points=polygon.filter((point,index)=>distance(point,polygon[(index+polygon.length-1)%polygon.length])>1e-5);
  for(let pass=0;pass<3;pass++)points=points.filter((point,index)=>{
    if(points.length<=3)return true;
    const before=points[(index+points.length-1)%points.length],after=points[(index+1)%points.length];
    return Math.abs(cross(before,point,after))>1e-7;
  });
  if(points.length<3||Math.abs(area(points))<1e-5)return[];
  return area(points)<0?points.reverse():points;
}
// Convex half-plane clipping, shared by every neighboring Voronoi cell.
function clip(polygon,nx,nz,bound){
  const result=[];
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length],da=a.x*nx+a.z*nz-bound,db=b.x*nx+b.z*nz-bound;
    const insideA=da<=1e-9,insideB=db<=1e-9;
    if(insideA)result.push(a);
    if(insideA!==insideB){const t=da/(da-db);result.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});}
  }
  return result;
}
function inset(polygon,gap){
  let result=polygon;
  for(let i=0;i<polygon.length&&result.length>=3;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length],length=distance(a,b),nx=(b.z-a.z)/length,nz=-(b.x-a.x)/length;
    result=clip(result,nx,nz,nx*a.x+nz*a.z-gap);
  }
  return cleanPolygon(result);
}
function nearest(path,point){
  let best={distance:Infinity,x:0,z:0};
  for(let i=1;i<path.centerline.length;i++){
    const a=path.centerline[i-1],b=path.centerline[i],dx=b.x-a.x,dz=b.z-a.z;
    const t=clamp(((point.x-a.x)*dx+(point.z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);
    const x=a.x+dx*t,z=a.z+dz*t,d=Math.hypot(point.x-x,point.z-z);
    if(d<best.distance)best={distance:d,x,z};
  }
  return best;
}
function clipCorridor(polygon,path,halfWidth,site){
  let result=polygon;
  // The corridor is a union of segment capsules. A cell is always convex;
  // inward cuts of outside vertices/midpoints keep tight turns from folding
  // or spilling out, without stretching a parametric grid across the bend.
  for(let pass=0;pass<7&&result.length>=3;pass++){
    let changed=false;
    const probes=result.flatMap((p,i)=>{const q=result[(i+1)%result.length];return[p,{x:(p.x+q.x)/2,z:(p.z+q.z)/2}];});
    for(const point of probes){
      const n=nearest(path,point);
      if(n.distance<=halfWidth+1e-5)continue;
      const nx=(point.x-n.x)/n.distance,nz=(point.z-n.z)/n.distance;
      const bound=nx*n.x+nz*n.z+halfWidth;
      // On a concave turn the nearest segment of a far vertex may belong to
      // the opposite arm. Its supporting plane must never cut away this
      // cell's own valid seed; the shared Voronoi planes handle that arm.
      if(site&&nx*site.x+nz*site.z>bound-.015)continue;
      result=clip(result,nx,nz,bound);changed=true;
      if(result.length<3)break;
    }
    if(!changed)break;
  }
  if(!path.options.pathClosed&&result.length>=3){
    const start=path.at(0),end=path.at(path.length);
    result=clip(result,-start.tx,-start.tz,-start.tx*start.x-start.tz*start.z);
    result=clip(result,end.tx,end.tz,end.tx*end.x+end.tz*end.z);
  }
  return cleanPolygon(result);
}
function rectangle(frame,width,depth,angle=0){
  const c=Math.cos(angle),s=Math.sin(angle),tx=frame.tx*c-frame.tz*s,tz=frame.tx*s+frame.tz*c,nx=-tz,nz=tx;
  return cleanPolygon([[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>({x:frame.x+nx*width*a/2+tx*depth*b/2,z:frame.z+nz*width*a/2+tz*depth*b/2})));
}
function convexOverlap(a,b,gap=0){
  for(const polygon of [a,b])for(let i=0;i<polygon.length;i++){
    const p=polygon[i],q=polygon[(i+1)%polygon.length],nx=q.z-p.z,nz=p.x-q.x;
    const project=points=>points.map(v=>v.x*nx+v.z*nz),pa=project(a),pb=project(b),margin=gap*Math.hypot(nx,nz);
    if(Math.max(...pa)+margin<=Math.min(...pb)||Math.max(...pb)+margin<=Math.min(...pa))return false;
  }
  return true;
}

function prism(polygon,height,input,rng,grainFrame=null){
  const c=center(polygon),minRadius=Math.max(.02,Math.min(...polygon.map(p=>distance(p,c))));
  const bevel=clamp(finite(input.bevel,.5),0,1),bevelY=Math.min(height*.24,.007+bevel*.05),shrink=Math.min(.22,(.004+bevel*.035)/minRadius);
  const rings=[{scale:1-shrink*.4,y:0},{scale:1,y:bevelY},{scale:1,y:height-bevelY},{scale:1-shrink,y:height}].map(ring=>polygon.map(p=>{
    const x=c.x+(p.x-c.x)*ring.scale,z=c.z+(p.z-c.z)*ring.scale;
    const displacement=clamp(finite(input.displacement,0),0,1)*Math.min(.022,height*.12);
    const noiseScale=clamp(finite(input.geometryNoiseScale,2),.3,8),phase=finite(input.seed,1)*.013;
    const y=ring.y+displacement*Math.sin(x*noiseScale+phase)*Math.cos(z*noiseScale*.83-phase)*ring.y/height;
    return new THREE.Vector3(x,y,z);
  }));
  const positions=[],normals=[],colors=[],uvs=[],tones=[],bevels=[],patterns=[];
  function triangle(a,b,c,reverse,tone,edge){
    if(reverse)[b,c]=[c,b];
    const normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    for(const p of [a,b,c]){
      positions.push(...p);normals.push(...normal);colors.push(1,1,1);uvs.push(p.x,p.z+p.y);tones.push(tone);bevels.push(edge);
      if(grainFrame){const dx=p.x-grainFrame.x,dz=p.z-grainFrame.z;patterns.push(dx*grainFrame.tx+dz*grainFrame.tz,dx*grainFrame.nx+dz*grainFrame.nz,p.y,1);}
      else patterns.push(p.x,p.y,p.z,1);
    }
  }
  for(let ring=0;ring<3;ring++)for(let i=0;i<polygon.length;i++){
    const next=(i+1)%polygon.length,a=rings[ring][i],b=rings[ring][next],c=rings[ring+1][next],d=rings[ring+1][i];
    const tone=.43+rng()*.14;
    // Preserve the ring's topological winding. A displaced chamfer may tilt
    // past a horizontal reference normal; independently flipping such faces
    // would reverse a shared edge while the closed boundary itself is valid.
    triangle(a,b,c,true,tone,ring===1?0:1);triangle(a,c,d,true,tone,ring===1?0:1);
  }
  for(const [ring,sign] of [[0,-1],[3,1]]){
    const vertices=rings[ring],middle=vertices.reduce((sum,p)=>sum.add(p),new THREE.Vector3()).multiplyScalar(1/vertices.length),tone=.45+rng()*.12;
    for(let i=0;i<vertices.length;i++)triangle(middle,vertices[i],vertices[(i+1)%vertices.length],sign>0,tone,0);
  }
  const geometry=new THREE.BufferGeometry();
  for(const [name,values,size] of [['position',positions,3],['normal',normals,3],['color',colors,3],['uv',uvs,2],['aFaceTone',tones,1],['aBevel',bevels,1],['aRockPosition',patterns,4]])geometry.setAttribute(name,new THREE.Float32BufferAttribute(values,size));
  geometry.userData.pathFootprint=polygon.map(p=>({...p}));geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return geometry;
}

function fittedPaving(path,input,rng,report){
  const options=path.options,cobble=input.shape==='cobblePath',gap=options.pathSpacing,sites=[];
  let pitch=options.pathPieceSize+(cobble?gap*.4:gap),rows,stations;
  const counts=()=>{rows=Math.max(1,Math.round(options.pathWidth/(pitch*(cobble?.8:.5))));stations=Math.max(1,Math.ceil(path.length/(pitch*(cobble?1:.95))));};
  counts();const desired=rows*stations;
  while(rows*stations>PATH_MAX_PIECES){pitch*=1.06;counts();}
  if(desired>PATH_MAX_PIECES){report.truncated=true;report.warnings.push('Paving density was reduced to stay within the 128-piece preview limit.');}
  const rowWidth=options.pathWidth/rows,step=path.length/stations;
  for(let row=0;row<rows;row++)for(let index=0;index<stations;index++){
    let s=(index+.5+(row%2)*(cobble?.46:.5))*step;
    if(path.options.pathClosed)s%=path.length;else s=clamp(s,step*.07,path.length-step*.07);
    if(cobble)s=clamp(s+(rng()-.5)*step*(.2+options.pathJitter*.75),.002,path.length-.002);
    const frame=path.at(s),lateral=-options.pathWidth/2+rowWidth*(row+.5)+(cobble?(rng()-.5)*rowWidth*(.2+options.pathJitter*.65):0);
    frame.x+=frame.nx*lateral;frame.z+=frame.nz*lateral;
    if(sites.some(site=>distance(site,frame)<.035)){report.skipped++;continue;}
    sites.push({...frame,row,index,width:rowWidth,depth:step});
  }
  const pad=options.pathWidth*2+pitch,b=path.bounds;
  const initial=[{x:b.xMin-pad,z:b.zMin-pad},{x:b.xMax+pad,z:b.zMin-pad},{x:b.xMax+pad,z:b.zMax+pad},{x:b.xMin-pad,z:b.zMax+pad}];
  const proposals=sites.map(site=>cobble?initial:rectangle(site,site.width,site.depth));
  const result=[];
  for(let i=0;i<sites.length;i++){
    let polygon=proposals[i];
    for(let j=0;j<sites.length&&polygon.length>=3;j++){
      if(i===j)continue;
      // Voronoi cells fit globally in world space. For brick rectangles only
      // overlapping neighbors need carving, preserving straight running bond.
      if(!cobble&&!convexOverlap(proposals[i],proposals[j]))continue;
      const a=sites[i],b=sites[j],nx=b.x-a.x,nz=b.z-a.z;
      polygon=clip(polygon,nx,nz,(b.x*b.x+b.z*b.z-a.x*a.x-a.z*a.z)*.5);
    }
    polygon=clipCorridor(polygon,path,options.pathWidth/2,sites[i]);
    if(polygon.length>=3)polygon=inset(polygon,Math.min(gap*.5,Math.sqrt(Math.abs(area(polygon)))*.22));
    if(polygon.length<3){report.skipped++;continue;}
    result.push({polygon,frame:sites[i],name:cobble?'Fitted cobblestone':'Running-bond brick',height:options.pathThickness*(1+(rng()-.5)*options.pathJitter*(cobble?.65:.18))});
  }
  return result;
}

function spacedPaving(path,input,rng,report){
  const options=path.options,plank=input.shape==='plankPath',result=[],size=options.pathPieceSize;
  const depth=plank?size*.46:size,step=depth+options.pathSpacing;
  const count=Math.max(1,Math.ceil(path.length/step)),limit=Math.min(count,PATH_MAX_PIECES);
  if(count>limit){report.truncated=true;report.warnings.push('The path reached the 128-piece preview limit. Increase piece size or spacing to cover the full curve.');}
  for(let i=0;i<limit;i++){
    const frame=path.at(Math.min(path.length,(i+.5)*step));
    const lateral=(rng()-.5)*Math.max(0,options.pathWidth-size)*options.pathJitter*.5;
    if(!plank){frame.x+=frame.nx*lateral;frame.z+=frame.nz*lateral;}
    const angle=(rng()-.5)*options.pathRotation*(plank?.12:.9),width=plank?options.pathWidth:size*(.83+rng()*.22*options.pathJitter);
    let polygon;
    if(plank)polygon=rectangle(frame,width,depth,angle);
    else{
      const corners=6+Math.floor(rng()*3);
      polygon=cleanPolygon(Array.from({length:corners},(_,j)=>{const phase=j/corners*Math.PI*2+angle,scale=.9+(rng()-.5)*options.pathJitter*.15;return{x:frame.x+Math.cos(phase)*width*.5*scale,z:frame.z+Math.sin(phase)*depth*.5*scale};}));
    }
    if(!plank&&result.some(previous=>convexOverlap(previous.polygon,polygon,Math.min(.02,options.pathSpacing*.2)))){report.skipped++;continue;}
    const grainFrame=plank?{...frame,tx:frame.tx*Math.cos(angle)-frame.tz*Math.sin(angle),tz:frame.tx*Math.sin(angle)+frame.tz*Math.cos(angle)}:frame;
    if(plank){grainFrame.nx=-grainFrame.tz;grainFrame.nz=grainFrame.tx;}
    result.push({polygon,frame:grainFrame,name:plank?'Crosswise wood plank':'Walking stone',height:options.pathThickness*(1+(rng()-.5)*options.pathJitter*.15)});
  }
  if(plank){
    // Trim only crowded inner corners against a shared station bisector.
    // Every board keeps its place in the sequence; a bend must not remove an
    // entire board and turn a walkway into disconnected rafts.
    const proposals=result.map(piece=>piece.polygon);
    for(let i=0;i<result.length;i++){
      let polygon=proposals[i];
      for(let j=0;j<result.length&&polygon.length>=3;j++){
        if(i===j||!convexOverlap(proposals[i],proposals[j]))continue;
        const a=result[i].frame,b=result[j].frame,nx=b.x-a.x,nz=b.z-a.z;
        polygon=clip(polygon,nx,nz,(b.x*b.x+b.z*b.z-a.x*a.x-a.z*a.z)*.5-Math.hypot(nx,nz)*Math.min(.015,options.pathSpacing*.1));
      }
      result[i].polygon=cleanPolygon(polygon);
    }
    const kept=result.filter(piece=>piece.polygon.length>=3);report.skipped+=result.length-kept.length;
    result.splice(0,result.length,...kept);
  }
  if(report.skipped)report.warnings.push(`${report.skipped} crowded placements were skipped around tight bends.`);
  return result;
}

function objectPath(group,path,input,material,buildSourceAsset,rng,report){
  if(typeof buildSourceAsset!=='function')throw new TypeError('Object paths require the source-asset builder callback.');
  const options=path.options,source=buildSourceAsset({...input,shape:options.pathObject},material);
  source.updateMatrixWorld(true);const sourceBounds=new THREE.Box3().setFromObject(source),size=sourceBounds.getSize(new THREE.Vector3()),sourceMeshes=[];
  source.traverse(mesh=>{if(mesh.isMesh)sourceMeshes.push(mesh);});
  const triangles=sourceMeshes.reduce((sum,mesh)=>sum+(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3,0);
  const radius=Math.hypot(size.x,size.z)*options.pathObjectScale*.5,step=radius*2+options.pathSpacing,count=Math.max(1,Math.ceil(path.length/Math.max(.08,step)));
  const capacity=Math.max(0,Math.min(Math.floor(PATH_MAX_PIECES/Math.max(1,sourceMeshes.length)),Math.floor(PATH_MAX_TRIANGLES/Math.max(1,triangles))));
  const footprints=[];
  for(let i=0;i<Math.min(count,capacity);i++){
    const frame=path.at(Math.min(path.length,(i+.5)*step)),lateral=(rng()-.5)*Math.max(0,options.pathWidth-radius*2)*options.pathJitter;
    frame.x+=frame.nx*lateral;frame.z+=frame.nz*lateral;
    const yaw=(options.pathAlign?Math.atan2(frame.tx,frame.tz):0)+(rng()-.5)*options.pathRotation*.5;
    const footprint=rectangle({x:frame.x,z:frame.z,tx:Math.sin(yaw),tz:Math.cos(yaw)},size.x*options.pathObjectScale,size.z*options.pathObjectScale);
    if(footprints.some(polygon=>convexOverlap(polygon,footprint,.025))){report.skipped++;continue;}
    const item=new THREE.Group();item.name=`${options.pathObject} along path ${i+1}`;item.position.set(frame.x,-sourceBounds.min.y*options.pathObjectScale,frame.z);item.rotation.y=yaw;item.scale.setScalar(options.pathObjectScale);
    for(const original of sourceMeshes){
      const mesh=new THREE.Mesh(original.geometry,original.material);mesh.name=original.name;mesh.userData={...original.userData};mesh.applyMatrix4(original.matrixWorld);mesh.castShadow=true;mesh.receiveShadow=true;item.add(mesh);
    }
    group.add(item);footprints.push(footprint);report.objectCount++;report.triangles+=triangles;report.pieces+=sourceMeshes.length;report.footprints.push({points:footprint,pieceIndex:report.objectCount-1});
  }
  if(count>capacity){report.truncated=true;report.warnings.push('The repeated-object preview reached its piece or triangle budget. Increase spacing or choose a simpler source object.');}
  if(report.skipped)report.warnings.push(`${report.skipped} overlapping object placements were skipped around tight bends.`);
  if(!group.children.length){const geometries=new Set(sourceMeshes.map(mesh=>mesh.geometry));for(const geometry of geometries)geometry.dispose();}
}

export function buildPathAsset(input={},material,buildSourceAsset){
  const shape=PATH_SHAPES.has(input.shape)?input.shape:'steppingStonePath',path=sampleCurve(input),rng=random(input.seed),group=new THREE.Group();
  group.name=`Procedural ${PATH_CATALOG[shape].label} ${input.seed??1}`;
  const report={kind:shape,length:path.length,pieces:0,objectCount:0,triangles:0,truncated:false,skipped:0,selfIntersections:path.selfIntersections,warnings:[],footprints:[]};
  if(path.selfIntersections)report.warnings.push('The spline crosses itself. Crowded paving is fitted or skipped at the crossing.');
  if(shape==='objectPath')objectPath(group,path,{...input,shape},material,buildSourceAsset,rng,report);
  else{
    const pieces=['brickPath','cobblePath'].includes(shape)?fittedPaving(path,{...input,shape},rng,report):spacedPaving(path,{...input,shape},rng,report);
    for(const piece of pieces){
      const geometry=prism(piece.polygon,piece.height,input,rng,shape==='plankPath'?piece.frame:null),triangles=geometry.attributes.position.count/3;
      if(report.pieces>=PATH_MAX_PIECES||report.triangles+triangles>PATH_MAX_TRIANGLES){geometry.dispose();report.truncated=true;continue;}
      const mesh=new THREE.Mesh(geometry,material);mesh.name=`${piece.name} ${report.pieces+1}`;mesh.userData.materialSlot='primary';mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
      report.footprints.push({points:piece.polygon,pieceIndex:report.pieces});report.pieces++;report.triangles+=triangles;
    }
  }
  group.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(group),size=bounds.getSize(new THREE.Vector3());
  group.userData={generated:true,options:{...input,...path.options,shape},chunks:report.pieces,triangles:report.triangles,bounds:{width:size.x,height:size.y,depth:size.z},path:report,
    connectivity:{grounded:Array.from({length:report.pieces},(_,i)=>i),links:[],unsupported:[],settledChunks:[],jointTolerance:0,method:'independent-grounded-path-pieces'}};
  return group;
}
