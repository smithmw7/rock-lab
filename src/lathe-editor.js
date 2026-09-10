import { sampleLatheProfile } from './workshop-geometry.js';

// The SVG is a direct view of the same sampled profile used by the mesh.
// Fixed height stations keep dragging predictable and prevent crossing splines.
export function createLatheEditor({state,onChange}){
  const svg=document.querySelector('#lathe-profile'),point=document.querySelector('#lathe-point'),radius=document.querySelector('#lathe-radius'),output=document.querySelector('#lathe-radius-value');
  const abort=new AbortController(),listen={signal:abort.signal};
  const ns='http://www.w3.org/2000/svg';
  let selected=0,drag=null,layout=null;
  const node=(tag,attrs)=>{const element=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attrs))element.setAttribute(key,String(value));return element;};
  svg.append(node('line',{x1:130,y1:16,x2:130,y2:198,class:'lathe-axis'}));
  const outline=node('path',{class:'lathe-silhouette'}),curve=node('path',{class:'lathe-curve'}),handles=node('g',{});
  svg.append(outline,curve,handles);
  const circles=Array.from({length:6},(_,index)=>{
    const circle=node('circle',{r:6,'data-profile-point':index,role:'slider',tabindex:index===0?0:-1,'aria-label':`Profile point ${index+1} radius`,'aria-valuemin':.18,'aria-valuemax':1.4});
    handles.append(circle);return circle;
  });
  const bottom=node('text',{x:16,y:211,class:'lathe-caption'});bottom.textContent='BASE';
  const top=node('text',{x:16,y:15,class:'lathe-caption'});top.textContent='LIP';svg.append(bottom,top);
  function current(){return Array.isArray(state.latheProfile)?state.latheProfile:Array(6).fill(1);}
  function select(index){selected=Math.max(0,Math.min(5,index));point.value=String(selected);sync();}
  function setRadius(value){
    const values=[...current()];values[selected]=Math.min(1.4,Math.max(.18,Math.round(value*100)/100));
    state.latheProfile=values;sync();onChange();
  }
  function sync(){
    if(document.querySelector('#lathe-controls-panel').hidden)return;
    const profile=sampleLatheProfile(state.shape,state,64),controls=profile.controls;
    if(!profile.points?.length||controls?.length!==6)return;
    const maxRadius=Math.max(...profile.points.map(p=>p.radius),...controls.map(p=>p.baseRadius*1.4||p.radius*1.4));
    layout=drag?.layout??{scale:Math.min(102/Math.max(.01,maxRadius),170/Math.max(.01,profile.height)),baseY:195,centerX:130};
    const x=p=>layout.centerX+p.radius*layout.scale,y=p=>layout.baseY-p.y*layout.scale;
    const path=profile.points.map((p,i)=>`${i?'L':'M'}${x(p).toFixed(2)},${y(p).toFixed(2)}`).join(' ');
    curve.setAttribute('d',path);
    outline.setAttribute('d',path+profile.points.toReversed().map(p=>` L${(layout.centerX-p.radius*layout.scale).toFixed(2)},${y(p).toFixed(2)}`).join(' ')+' Z');
    controls.forEach((control,index)=>{
      const circle=circles[index];circle.setAttribute('cx',x(control));circle.setAttribute('cy',y(control));
      circle.setAttribute('aria-valuenow',current()[index]);circle.setAttribute('aria-valuetext',`${Math.round(current()[index]*100)} percent of preset radius`);
      circle.setAttribute('tabindex',index===selected?'0':'-1');circle.classList.toggle('selected',index===selected);
    });
    point.value=String(selected);radius.value=current()[selected];output.value=`${Math.round(current()[selected]*100)}%`;
  }
  point.addEventListener('change',()=>select(Number(point.value)),listen);
  radius.addEventListener('input',()=>setRadius(Number(radius.value)),listen);
  document.querySelector('#reset-lathe-profile').addEventListener('click',()=>{state.latheProfile=null;sync();onChange();},listen);
  function pointerRadius(event){
    const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;
    const local=p.matrixTransform(svg.getScreenCTM().inverse());
    setRadius((local.x-drag.layout.centerX)/(drag.layout.scale*drag.baseRadius));
  }
  svg.addEventListener('pointerdown',event=>{
    const circle=event.target.closest('[data-profile-point]');if(!circle)return;
    event.preventDefault();select(Number(circle.dataset.profilePoint));circle.focus();
    const profile=sampleLatheProfile(state.shape,state,64),control=profile.controls[selected];
    drag={id:event.pointerId,layout:{...layout},baseRadius:control.baseRadius??control.radius/current()[selected]};
    svg.setPointerCapture(event.pointerId);pointerRadius(event);
  },listen);
  svg.addEventListener('pointermove',event=>{if(drag?.id===event.pointerId)pointerRadius(event);},listen);
  const end=event=>{if(drag?.id!==event.pointerId)return;drag=null;if(svg.hasPointerCapture(event.pointerId))svg.releasePointerCapture(event.pointerId);sync();};
  svg.addEventListener('pointerup',end,listen);svg.addEventListener('pointercancel',end,listen);
  svg.addEventListener('keydown',event=>{
    const circle=event.target.closest('[data-profile-point]');if(!circle)return;
    selected=Number(circle.dataset.profilePoint);
    if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
      event.preventDefault();setRadius(event.key==='Home'?.18:event.key==='End'?1.4:current()[selected]+(event.key==='ArrowRight'?1:-1)*(event.shiftKey?.1:.01));
    }else if(['ArrowUp','ArrowDown'].includes(event.key)){
      event.preventDefault();select(selected+(event.key==='ArrowUp'?1:-1));circles[selected].focus();
    }
  },listen);
  return{sync,destroy(){abort.abort();}};
}
