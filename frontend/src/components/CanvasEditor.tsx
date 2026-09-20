import {Stage,Layer,Rect,Text,Group,Transformer} from 'react-konva';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import type Konva from 'konva';
import {useComposition} from '../store/composition';
import type {MarimbaElement,PersonElement} from '../types';
import {elementBBox,slotRect} from '../lib/layout';

function MarimbaNode({m,selected}:{m:MarimbaElement;selected:boolean}){
 const marimbaDragged=useComposition(s=>s.marimbaDragged);
 const marimbaTransformed=useComposition(s=>s.marimbaTransformed);
 const select=useComposition(s=>s.select);
 return (
  <Group id={m.id} x={m.x} y={m.y} rotation={m.rotation} scaleX={m.scaleX} scaleY={m.scaleY} draggable
   onClick={()=>select(m.id)} onTap={()=>select(m.id)}
   onDragMove={ev=>marimbaDragged(m.id,ev.target.x(),ev.target.y())}
   onDragEnd={ev=>marimbaDragged(m.id,ev.target.x(),ev.target.y())}
   onTransformEnd={ev=>{const n=ev.target;marimbaTransformed(m.id,{x:n.x(),y:n.y(),rotation:n.rotation(),scaleX:n.scaleX(),scaleY:n.scaleY()});}}>
   <Rect width={m.width} height={m.height} fill="#1f2937" stroke={selected?'#22c55e':'#0f172a'} strokeWidth={selected?3:1} cornerRadius={12}/>
   <Text text={m.name} x={8} y={10} width={m.width-16} align="center" fontSize={17} fontStyle="bold" fill="#ffffff"/>
   <Text text={`${m.positions.length} puesto${m.positions.length===1?'':'s'}`} x={8} y={33} width={m.width-16} align="center" fontSize={10} fill="#9ca3af"/>
   {m.positions.map((p,i)=>{const r=slotRect(m,i);return (
    <Group key={p.id}>
     <Rect x={r.x} y={r.y} width={r.width} height={r.height} fill={p.personId?'#14532d':'#374151'} stroke={p.personId?'#22c55e':'#4b5563'} strokeWidth={1} cornerRadius={6}/>
     <Text text={p.type} x={r.x} y={r.y+5} width={r.width} align="center" fontSize={11} fill="#d1d5db"/>
    </Group>);})}
  </Group>
 );
}

function PersonNode({e,selected}:{e:PersonElement;selected:boolean}){
 const elements=useComposition(s=>s.elements);
 const select=useComposition(s=>s.select);
 const update=useComposition(s=>s.update);
 const dropPerson=useComposition(s=>s.dropPerson);
 const m=e.marimbaId?elements.find((x):x is MarimbaElement=>x.id===e.marimbaId&&x.type==='marimba'):undefined;
 const idx=m?m.positions.findIndex(p=>p.id===e.marimbaPositionId):-1;
 const assigned=!!m&&idx>=0;
 const r=assigned&&m?slotRect(m,idx):null;
 const pw=assigned&&r?r.width-6:e.width;
 const ph=assigned&&r?r.height-6:e.height;
 const rotation=assigned&&m?m.rotation:e.rotation;
 const fontSize=pw<120?11:14;
 return (
  <Group id={e.id} x={e.x} y={e.y} rotation={rotation} scaleX={assigned?1:e.scaleX} scaleY={assigned?1:e.scaleY}
   offsetX={assigned?pw/2:0} offsetY={assigned?ph/2:0} draggable
   onClick={ev=>{ev.cancelBubble=true;select(e.id);}} onTap={ev=>{ev.cancelBubble=true;select(e.id);}}
   onDragEnd={ev=>{
    const node=ev.target;
    const stage=node.getStage();
    const pointer=stage?stage.getPointerPosition():null;
    const fallback=assigned&&r?{x:node.x()-pw/2,y:node.y()-ph/2,rotation:0}:{x:node.x(),y:node.y(),rotation:node.rotation()};
    dropPerson(e.id,pointer?{x:pointer.x,y:pointer.y}:null,fallback);
   }}
   onTransformEnd={ev=>{const n=ev.target;update(e.id,{x:n.x(),y:n.y(),rotation:n.rotation(),scaleX:n.scaleX(),scaleY:n.scaleY()});}}>
   <Rect width={pw} height={ph} fill="#ffffff" stroke={selected?'#22c55e':'#111827'} strokeWidth={selected?3:1} cornerRadius={8}/>
   <Text text={e.name} y={ph>40?7:3} width={pw} align="center" fontSize={fontSize} fill="#111827"/>
   <Text text={e.positionType} y={ph>40?26:20} width={pw} align="center" fontSize={10} fill="#6b7280"/>
  </Group>
 );
}
export default function CanvasEditor(){
 const elements=useComposition(s=>s.elements);
 const selectedId=useComposition(s=>s.selectedId);
 const select=useComposition(s=>s.select);
 const remove=useComposition(s=>s.remove);
 const trRef=useRef<Konva.Transformer>(null);
 const layerRef=useRef<Konva.Layer>(null);
 const stageRef=useRef<Konva.Stage>(null);
 const wrapRef=useRef<HTMLDivElement>(null);
 const [size,setSize]=useState({w:900,h:620});

 useLayoutEffect(()=>{
  const el=wrapRef.current;
  if(!el)return;
  const apply=()=>{const w=el.clientWidth-24,h=el.clientHeight-58;if(w>240)setSize({w,h:Math.max(320,h)});};
  apply();
  const ro=new ResizeObserver(apply);
  ro.observe(el);
  return()=>ro.disconnect();
 },[]);

 useEffect(()=>{
  const tr=trRef.current;
  if(!tr)return;
  const node=selectedId?layerRef.current?.findOne<Konva.Group>('#'+selectedId):null;
  const selEl=elements.find(e=>e.id===selectedId);
  const attach=!!(node&&selEl&&!(selEl.type==='person'&&selEl.marimbaId));
  tr.nodes(attach?[node]:[]);
  tr.getLayer()?.batchDraw();
 },[selectedId,elements]);

 useEffect(()=>{
  const onKey=(ev:KeyboardEvent)=>{
   const tag=(ev.target as HTMLElement|null)?.tagName;
   if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT')return;
   if((ev.key==='Delete'||ev.key==='Backspace')&&selectedId)remove(selectedId);
   if(ev.key==='Escape')select(null);
  };
  window.addEventListener('keydown',onKey);
  return()=>window.removeEventListener('keydown',onKey);
 },[selectedId,remove,select]);

 const exportPNG=()=>{
  const st=stageRef.current,ly=layerRef.current;
  if(!st||!ly||!elements.length)return;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const e of elements){
   const b=elementBBox(e);
   minX=Math.min(minX,b.x);minY=Math.min(minY,b.y);
   maxX=Math.max(maxX,b.x+b.width);maxY=Math.max(maxY,b.y+b.height);
  }
  const pad=36;
  const w=Math.ceil(maxX-minX+pad*2),h=Math.ceil(maxY-minY+pad*2);
  const oldW=st.width(),oldH=st.height(),oldLx=ly.x(),oldLy=ly.y();
  st.width(w);st.height(h);
  ly.position({x:pad-minX,y:pad-minY});
  ly.batchDraw();
  const url=st.toDataURL({pixelRatio:2});
  st.width(oldW);st.height(oldH);
  ly.position({x:oldLx,y:oldLy});
  ly.batchDraw();
  const a=document.createElement('a');
  a.href=url;a.download='distribucion-marimba.png';
  document.body.appendChild(a);a.click();a.remove();
 };
 return (
  <div className="canvas-wrap" ref={wrapRef}>
   <button className="export" onClick={exportPNG} disabled={!elements.length}>Exportar PNG</button>
   <Stage ref={stageRef} width={size.w} height={size.h}
    onMouseDown={ev=>{if(ev.target===ev.target.getStage())select(null);}}
    onTouchStart={ev=>{if(ev.target===ev.target.getStage())select(null);}}>
    <Layer ref={layerRef}>
     {elements.filter(e=>e.type==='marimba').map(e=>(
      <MarimbaNode key={e.id} m={e as MarimbaElement} selected={selectedId===e.id}/>))}
     {elements.filter(e=>e.type==='person').map(e=>(
      <PersonNode key={e.id} e={e as PersonElement} selected={selectedId===e.id}/>))}
     <Transformer ref={trRef} rotateEnabled keepRatio={false}
      rotateSnaps={[0,45,90,135,180,225,270,315]}
      enabledAnchors={['top-left','top-right','bottom-left','bottom-right']}
      anchorSize={9} anchorFill="#ffffff" anchorStroke="#15803d" borderStroke="#22c55e"
      boundBoxFunc={(oldBox,newBox)=>newBox.width<40||newBox.height<40?oldBox:newBox}/>
    </Layer>
   </Stage>
   <div className="canvas-help">Arrastra personas sobre los puestos de una marimba para asignarlas; arrÃ¡stralas fuera para liberarlas. Selecciona y usa Supr para eliminar. Esc deselecciona.</div>
   {selectedId&&<button className="danger floating" onClick={()=>remove(selectedId)}>Eliminar seleccionado</button>}
  </div>
 );
}

