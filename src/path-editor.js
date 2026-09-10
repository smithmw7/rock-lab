import { PATH_DEFAULTS, sanitizePathOptions, samplePathForEditor } from './path-geometry.js';

// The editor samples exactly the curve used by the mesh generator. Keep its
// transform fixed throughout a drag so moving an endpoint never chases the view.
export function createPathEditor({state,onChange}){
  const svg=document.querySelector('#path-editor'),select=document.querySelector('#path-point');
  const xInput=document.querySelector('#path-x'),zInput=document.querySelector('#path-z');
  const abort=new AbortController(),listen={signal:abort.signal},ns='http://www.w3.org/2000/svg';
  let selected=0,drag=null,layout=null,circles=[];
  const node=(tag,attrs={})=>{const n=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attrs))n.setAttribute(key,String(value));return n;};
  const grid=node('g'),ribbon=node('path',{class:'path-route'}),guides=node('path',{class:'path-guides'}),line=node('path',{class:'path-centerline'}),handles=node('g');
  const caption=node('text',{x:10,y:210,class:'path-caption'});svg.append(grid,ribbon,guides,line,handles,caption);
  const clamp=n=>Math.max(-12,Math.min(12,Math.round(n*100)/100));
  function project(p){return{x:130+(p.x-layout.cx)*layout.scale,y:106+(p.z-layout.cz)*layout.scale};}
  const pathD=points=>points.map((p,i)=>{const q=project(p);return`${i?'L':'M'}${q.x.toFixed(2)},${q.y.toFixed(2)}`;}).join(' ');
  function sync(){
    const points=state.pathPoints;selected=Math.max(0,Math.min(points.length-1,selected));
    const sampled=samplePathForEditor(state),b=sampled.bounds;
    layout=drag?.layout??{cx:(b.xMin+b.xMax)/2,cz:(b.zMin+b.zMax)/2,scale:Math.min(214/Math.max(6,b.xMax-b.xMin+2),170/Math.max(5,b.zMax-b.zMin+2))};
    grid.replaceChildren();
    for(let i=-12;i<=12;i++){
      const a=project({x:i,z:-12}),c=project({x:i,z:12}),d=project({x:-12,z:i}),e=project({x:12,z:i});
      grid.append(node('line',{x1:a.x,y1:a.y,x2:c.x,y2:c.y,class:'path-grid'}),node('line',{x1:d.x,y1:d.y,x2:e.x,y2:e.y,class:'path-grid'}));
    }
    ribbon.setAttribute('d',pathD(sampled.centerline));ribbon.setAttribute('stroke-width',state.pathWidth*layout.scale);
    line.setAttribute('d',pathD(sampled.centerline));guides.setAttribute('d',pathD(points)+(state.pathClosed?' Z':''));
    if(circles.length!==points.length){
      handles.replaceChildren();circles=points.map((p,i)=>{const circle=node('circle',{r:9,class:'path-handle','data-path-point':i,tabindex:0,role:'button','aria-label':`Move path point ${i+1}`});const text=node('text',{class:'path-point-number',dy:3});text.textContent=String(i+1);handles.append(circle,text);return circle;});
      select.replaceChildren(...points.map((p,i)=>{const option=document.createElement('option');option.value=i;option.textContent=`${i+1} · ${i===0?'Start':i===points.length-1?'End':'Control point'}`;return option;}));
    }
    circles.forEach((circle,i)=>{const p=project(points[i]);circle.setAttribute('cx',p.x);circle.setAttribute('cy',p.y);circle.setAttribute('tabindex',i===selected?'0':'-1');circle.setAttribute('aria-label',`Path point ${i+1}, X ${points[i].x}, Z ${points[i].z}. Arrow keys move this point.`);circle.classList.toggle('selected',i===selected);const t=circle.nextSibling;t.setAttribute('x',p.x);t.setAttribute('y',p.y);t.classList.toggle('selected',i===selected);});
    select.value=selected;xInput.value=points[selected].x;zInput.value=points[selected].z;
    for(const id of ['path-add-point','path-insert-point'])document.getElementById(id).disabled=points.length>=12;
    document.querySelector('#path-remove-point').disabled=!canRemove();
    caption.textContent=`TOP VIEW · ${points.length} POINTS · GRID 1 UNIT`;
  }
  function changed(){Object.assign(state,sanitizePathOptions(state));sync();onChange();}
  function canRemove(){const remaining=state.pathPoints.filter((p,i)=>i!==selected);return remaining.length>=2&&remaining.some(p=>Math.hypot(p.x-remaining[0].x,p.z-remaining[0].z)>.05);}
  function move(x,z){
    const next={x:clamp(x),z:clamp(z)},points=state.pathPoints;
    const neighbors=[points[selected-1],points[selected+1]];
    if(state.pathClosed&&selected===0)neighbors.push(points.at(-1));
    if(state.pathClosed&&selected===points.length-1)neighbors.push(points[0]);
    // Reject collapsed segments in the interactive editor. Imported invalid
    // data can use sanitizer defaults, but dragging must never swap routes.
    if(neighbors.some(p=>p&&Math.hypot(p.x-next.x,p.z-next.z)<=.05)){sync();return;}
    state.pathPoints=points.map((p,i)=>i===selected?next:p);changed();
  }
  select.addEventListener('change',()=>{selected=Number(select.value);sync();},listen);
  for(const [input,key] of [[xInput,'x'],[zInput,'z']])input.addEventListener('change',()=>{const p={...state.pathPoints[selected],[key]:Number(input.value)};if(Number.isFinite(p[key]))move(p.x,p.z);else sync();},listen);
  document.querySelector('#path-add-point').addEventListener('click',()=>{
    if(state.pathPoints.length>=12)return;const points=state.pathPoints,last=points.at(-1),before=points.at(-2),dx=last.x-before.x,dz=last.z-before.z,length=Math.hypot(dx,dz)||1;
    const next={x:clamp(last.x+dx/length*1.5),z:clamp(last.z+dz/length*1.5)};
    if(Math.hypot(next.x-last.x,next.z-last.z)<.1){next.x=clamp(last.x-1);next.z=clamp(last.z-1);}
    state.pathPoints=[...points,next];selected=points.length;changed();
  },listen);
  document.querySelector('#path-insert-point').addEventListener('click',()=>{
    if(state.pathPoints.length>=12)return;const points=state.pathPoints,a=points[selected],b=points[selected+1]??(state.pathClosed?points[0]:{x:a.x+1,z:a.z+1});
    state.pathPoints=points.toSpliced(selected+1,0,{x:clamp((a.x+b.x)/2),z:clamp((a.z+b.z)/2)});selected++;changed();
  },listen);
  document.querySelector('#path-remove-point').addEventListener('click',()=>{if(!canRemove())return;state.pathPoints=state.pathPoints.toSpliced(selected,1);changed();},listen);
  document.querySelector('#path-reset-points').addEventListener('click',()=>{state.pathPoints=structuredClone(PATH_DEFAULTS.pathPoints);state.pathClosed=false;selected=0;changed();},listen);
  function pointerMove(event){const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;const q=p.matrixTransform(svg.getScreenCTM().inverse());move((q.x-130)/layout.scale+layout.cx,(q.y-106)/layout.scale+layout.cz);}
  svg.addEventListener('pointerdown',event=>{const circle=event.target.closest('[data-path-point]');if(!circle||event.button>0)return;event.preventDefault();selected=Number(circle.dataset.pathPoint);circle.focus();drag={id:event.pointerId,layout:{...layout}};svg.setPointerCapture(event.pointerId);pointerMove(event);},listen);
  svg.addEventListener('pointermove',event=>{if(drag?.id===event.pointerId)pointerMove(event);},listen);
  const end=event=>{if(drag?.id!==event.pointerId)return;drag=null;if(svg.hasPointerCapture(event.pointerId))svg.releasePointerCapture(event.pointerId);sync();};svg.addEventListener('pointerup',end,listen);svg.addEventListener('pointercancel',end,listen);
  svg.addEventListener('keydown',event=>{const circle=event.target.closest('[data-path-point]');if(!circle||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();selected=Number(circle.dataset.pathPoint);const p=state.pathPoints[selected],step=event.shiftKey?.5:.1;move(p.x+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0),p.z+(event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0));},listen);
  return{sync,destroy(){abort.abort();}};
}
