import {Stage,Layer,Rect,Text,Group,Transformer} from 'react-konva';
import {useEffect,useLayoutEffect,useRef,useState,useCallback} from 'react';
import type Konva from 'konva';
import {useComposition} from '../store/composition';
import type {MarimbaElement,PersonElement} from '../types';
import {elementBBox,slotRect} from '../lib/layout';

function MarimbaNode({m,selected}:{m:MarimbaElement;selected:boolean}){
 const marimbaDragged=useComposition(s=>s.marimbaDragged);
 const marimbaTransformed=useComposition(s=>s.marimbaTransformed);
 const recordHistory=useComposition(s=>s.recordHistory);
 const select=useComposition(s=>s.select);

 return (
  <Group id={m.id} x={m.x} y={m.y} rotation={m.rotation} scaleX={m.scaleX} scaleY={m.scaleY}
   draggable={!m.locked}
   onClick={ev=>{ev.cancelBubble=true;select(m.id);}}
   onTap={ev=>{ev.cancelBubble=true;select(m.id);}}
   onDragStart={()=>recordHistory()}
   onDragMove={ev=>marimbaDragged(m.id,ev.target.x(),ev.target.y())}
   onDragEnd={ev=>marimbaDragged(m.id,ev.target.x(),ev.target.y())}
   onTransformStart={()=>recordHistory()}
   onTransformEnd={ev=>{const n=ev.target;marimbaTransformed(m.id,{x:n.x(),y:n.y(),rotation:n.rotation(),scaleX:n.scaleX(),scaleY:n.scaleY()});}}>
   <Rect width={m.width} height={m.height} fill="#1f2937"
    stroke={selected?'#22c55e':'#0f172a'} strokeWidth={selected?3:1}
    shadowColor={selected?'#22c55e':'transparent'} shadowBlur={selected?8:0} cornerRadius={12}/>
   <Text text={m.name} x={8} y={10} width={m.width-16} align="center" fontSize={17} fontStyle="bold" fill="#ffffff"/>
   {m.locked&&<Text text="🔒" x={m.width-28} y={8} fontSize={14} fill="#f59e0b"/>}
   <Text text={`${m.positions.length} puesto${m.positions.length===1?'':'s'}${m.locked?' · Bloqueada':''}`} x={8} y={33} width={m.width-16} align="center" fontSize={10} fill="#9ca3af"/>
   {m.positions.map((p,i)=>{const r=slotRect(m,i);return (
    <Group key={p.id}>
     <Rect x={r.x} y={r.y} width={r.width} height={r.height}
      fill={p.personId?'#14532d':'#374151'} stroke={p.personId?'#22c55e':'#4b5563'} strokeWidth={1} cornerRadius={6}/>
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
 const recordHistory=useComposition(s=>s.recordHistory);

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
   offsetX={assigned?pw/2:0} offsetY={assigned?ph/2:0}
   draggable={!e.locked}
   onClick={ev=>{ev.cancelBubble=true;select(e.id);}}
   onTap={ev=>{ev.cancelBubble=true;select(e.id);}}
   onDragStart={()=>recordHistory()}
   onDragEnd={ev=>{
    const node=ev.target;
    const stage=node.getStage();
    let pointer: {x:number;y:number}|null=null;
    if(stage){
     const transform=stage.getAbsoluteTransform().copy().invert();
     const raw=stage.getPointerPosition();
     if(raw) pointer=transform.point(raw);
    }
    const fallback=assigned&&r?{x:node.x()-pw/2,y:node.y()-ph/2,rotation:0}:{x:node.x(),y:node.y(),rotation:node.rotation()};
    dropPerson(e.id,pointer,fallback);
   }}
   onTransformStart={()=>recordHistory()}
   onTransformEnd={ev=>{const n=ev.target;update(e.id,{x:n.x(),y:n.y(),rotation:n.rotation(),scaleX:n.scaleX(),scaleY:n.scaleY()});}}>
   <Rect width={pw} height={ph} fill="#ffffff"
    stroke={selected?'#22c55e':'#111827'} strokeWidth={selected?3:1}
    shadowColor={selected?'#22c55e':'transparent'} shadowBlur={selected?8:0} cornerRadius={8}/>
   {e.locked&&<Text text="🔒" x={pw-18} y={4} fontSize={10} fill="#f59e0b"/>}
   <Text text={e.name} y={ph>40?7:3} width={pw} align="center" fontSize={fontSize} fontStyle="bold" fill="#111827"/>
   <Text text={e.positionType} y={ph>40?26:20} width={pw} align="center" fontSize={10} fill="#4b5563"/>
  </Group>
 );
}

export default function CanvasEditor(){
 const elements=useComposition(s=>s.elements);
 const selectedId=useComposition(s=>s.selectedId);
 const select=useComposition(s=>s.select);
 const remove=useComposition(s=>s.remove);
 const undo=useComposition(s=>s.undo);
 const redo=useComposition(s=>s.redo);

 const trRef=useRef<Konva.Transformer>(null);
 const layerRef=useRef<Konva.Layer>(null);
 const stageRef=useRef<Konva.Stage>(null);
 const wrapRef=useRef<HTMLDivElement>(null);
 const [size,setSize]=useState({w:900,h:620});
 const [zoom,setZoom]=useState(1);
 const [stagePos,setStagePos]=useState({x:0,y:0});
 const [cursor,setCursor]=useState<'default'|'grab'|'grabbing'>('default');
 const panStart=useRef<{sx:number;sy:number;px:number;py:number}|null>(null);
 const pinch=useRef<{zoom:number;stx:number;sty:number;dist:number;cx:number;cy:number}|null>(null);
 useEffect(()=>{const el=wrapRef.current;if(el)el.style.cursor=cursor;},[cursor]);

 useLayoutEffect(()=>{
  const el=wrapRef.current;
  if(!el)return;
  const apply=()=>{const w=el.clientWidth-24,h=el.clientHeight-58;if(w>240)setSize({w,h:Math.max(320,h)});};
  apply();
  const ro=new ResizeObserver(apply);
  ro.observe(el);
  return()=>ro.disconnect();
 },[]);

 const selEl=elements.find(e=>e.id===selectedId);
 const isLocked=Boolean(selEl?.locked);

 useEffect(()=>{
  const tr=trRef.current;
  if(!tr)return;
  const node=selectedId?layerRef.current?.findOne<Konva.Group>('#'+selectedId):null;
  const attach=!!(node&&selEl&&!(selEl.type==='person'&&selEl.marimbaId));
  tr.nodes(attach?[node]:[]);
  tr.getLayer()?.batchDraw();
 },[selectedId,elements,selEl]);

 useEffect(()=>{
  const onKey=(ev:KeyboardEvent)=>{
   const tag=(ev.target as HTMLElement|null)?.tagName;
   if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT')return;

   // Undo / Redo shortcuts
   if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='z'){
    ev.preventDefault();
    if(ev.shiftKey) redo(); else undo();
    return;
   }
   if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='y'){
    ev.preventDefault();
    redo();
    return;
   }

   if((ev.key==='Delete'||ev.key==='Backspace')&&selectedId){
    if(!isLocked) remove(selectedId);
   }
   if(ev.key==='Escape') select(null);
  };
  window.addEventListener('keydown',onKey);
  return()=>window.removeEventListener('keydown',onKey);
 },[selectedId,isLocked,remove,select,undo,redo]);

 const handleZoomIn=()=>setZoom(z=>Math.min(3,+(z*1.2).toFixed(2)));
 const handleZoomOut=()=>setZoom(z=>Math.max(0.3,+(z/1.2).toFixed(2)));
 const handleResetZoom=()=>{setZoom(1);setStagePos({x:0,y:0});};

 const handleCenter=useCallback(()=>{
  if(!elements.length){
   setZoom(1);setStagePos({x:0,y:0});
   return;
  }
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  const marimbas=elements.filter((x):x is MarimbaElement=>x.type==='marimba');
  for(const e of elements){
   const m=e.type==='person'&&e.marimbaId?marimbas.find(x=>x.id===e.marimbaId):undefined;
   const b=elementBBox(e,m);
   minX=Math.min(minX,b.x);minY=Math.min(minY,b.y);
   maxX=Math.max(maxX,b.x+b.width);maxY=Math.max(maxY,b.y+b.height);
  }
  const cx=(minX+maxX)/2;
  const cy=(minY+maxY)/2;
  setStagePos({
   x:Math.round(size.w/2 - cx*zoom),
   y:Math.round(size.h/2 - cy*zoom),
  });
 },[elements,size,zoom]);

 const clampZoom=(z:number)=>Math.max(0.3,Math.min(3,z));
 const toStageXY=(t:any,rect:DOMRect)=>{return {x:t.clientX-rect.left,y:t.clientY-rect.top};};
 const startPan=(px:number,py:number)=>{
  const st=stageRef.current;if(!st)return;
  panStart.current={sx:st.x(),sy:st.y(),px,py};
  setCursor('grabbing');
 };
 const doPan=(px:number,py:number)=>{
  if(!panStart.current)return;
  const st=stageRef.current;if(!st)return;
    const ps=panStart.current;
  st.x(ps.sx+(px-ps.px));st.y(ps.sy+(py-ps.py));
  layerRef.current?.batchDraw();
 };
 const endPan=()=>{
  if(!panStart.current){setCursor('grab');return;}
  panStart.current=null;
  const st=stageRef.current;if(st){setStagePos({x:st.x(),y:st.y()});}
  setCursor('default');
 };
 const onStageWheel=(e:any)=>{
  e.evt.preventDefault();
  const st=stageRef.current;if(!st)return;
  const p=st.getPointerPosition();if(!p)return;
  const oldZ=st.scaleX();
  const delta=e.evt.deltaY<0?1.12:1/1.12;
  const newZ=clampZoom(oldZ*delta);
  const wx=(p.x-st.x())/oldZ,wy=(p.y-st.y())/oldZ;
  setZoom(newZ);
  setStagePos({x:p.x-wx*newZ,y:p.y-wy*newZ});
 };
 const onStageMouseDown=(e:any)=>{
  const st=e.target.getStage();if(!st||e.target!==st)return;
  select(null);
  const p=st.getPointerPosition();if(!p)return;
  startPan(p.x,p.y);
 };
 const onStageMouseMove=(e:any)=>{
  if(!panStart.current)return;
  const st=e.target.getStage();if(!st)return;
  const p=st.getPointerPosition();if(!p)return;
  doPan(p.x,p.y);
 };
 const onStageMouseUp=()=>{ endPan(); };
 const onStageMouseLeave=()=>{ if(panStart.current)endPan(); else setCursor('default'); };
 const onStageMouseEnter=(e:any)=>{ const st=e.target.getStage();if(st&&!panStart.current)setCursor('grab'); };
 const onStageTouchStart=(e:any)=>{
  const st=e.target.getStage();if(!st||e.target!==st)return;
  const t=e.evt.touches;
  if(t.length===1){
   select(null);
   const p=st.getPointerPosition();if(p)startPan(p.x,p.y);
  }else if(t.length===2){
   select(null);
   const rect=st.container().getBoundingClientRect();
   const a=toStageXY(t[0],rect),b=toStageXY(t[1],rect);
   const dist=Math.hypot(b.x-a.x,b.y-a.y);
   if(dist>10){
    pinch.current={zoom:st.scaleX(),stx:st.x(),sty:st.y(),dist,cx:(a.x+b.x)/2,cy:(a.y+b.y)/2};
   }
   setCursor('grabbing');
  }
 };
 const onStageTouchMove=(e:any)=>{
  const st=e.target.getStage();if(!st)return;
  const t=e.evt.touches;
  if(t.length===1&&panStart.current){
   const p=st.getPointerPosition();if(p)doPan(p.x,p.y);
   return;
  }
  if(t.length===2&&pinch.current){
   e.evt.preventDefault();
   const rect=st.container().getBoundingClientRect();
   const a=toStageXY(t[0],rect),b=toStageXY(t[1],rect);
   const dist=Math.hypot(b.x-a.x,b.y-a.y);
   if(dist<10)return;
   const cx=(a.x+b.x)/2,cy=(a.y+b.y)/2;
   const pc=pinch.current;
   const newZ=clampZoom(pc.zoom*dist/pc.dist);
   const wx=(cx-pc.stx)/pc.zoom,wy=(cy-pc.sty)/pc.zoom;
   st.x(cx-newZ*wx);st.y(cy-newZ*wy);st.scale({x:newZ,y:newZ});
   layerRef.current?.batchDraw();
  }
 };
 const onStageTouchEnd=(e:any)=>{
  const st=e.target.getStage();if(!st)return;
  const t=e.evt.touches;
  if(t.length===0&&panStart.current){endPan();return;}
  if(t.length<2&&pinch.current){
   setZoom(clampZoom(st.scaleX()));
   setStagePos({x:st.x(),y:st.y()});
   pinch.current=null;
   setCursor('grab');
  }
 };

 const exportPNG=()=>{
  const st=stageRef.current,ly=layerRef.current,tr=trRef.current;
  if(!st||!ly||!elements.length)return;

  // Temporarily hide transformer
  const activeNodes=tr?tr.nodes():[];
  if(tr) tr.nodes([]);

  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  const marimbas=elements.filter((x):x is MarimbaElement=>x.type==='marimba');
  for(const e of elements){
   const m=e.type==='person'&&e.marimbaId?marimbas.find(x=>x.id===e.marimbaId):undefined;
   const b=elementBBox(e,m);
   minX=Math.min(minX,b.x);minY=Math.min(minY,b.y);
   maxX=Math.max(maxX,b.x+b.width);maxY=Math.max(maxY,b.y+b.height);
  }
  const pad=48;
  const w=Math.ceil(maxX-minX+pad*2),h=Math.ceil(maxY-minY+pad*2);
  const oldW=st.width(),oldH=st.height();
  const oldScale={x:st.scaleX(),y:st.scaleY()};
  const oldPos={x:st.x(),y:st.y()};
  const oldLx=ly.x(),oldLy=ly.y();

  st.width(w);
  st.height(h);
  st.scale({x:1,y:1});
  st.position({x:0,y:0});
  ly.position({x:pad-minX,y:pad-minY});
  ly.batchDraw();

  const url=st.toDataURL({pixelRatio:2});

  // Restore previous stage geometry
  st.width(oldW);
  st.height(oldH);
  st.scale(oldScale);
  st.position(oldPos);
  ly.position({x:oldLx,y:oldLy});
  if(tr&&activeNodes.length) tr.nodes(activeNodes);
  ly.batchDraw();

  const a=document.createElement('a');
  a.href=url;
  a.download='distribucion-marimba.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
 };

 return (
  <div className="canvas-wrap" ref={wrapRef}>
   <div className="canvas-top-bar">
    <div className="zoom-controls">
     <button onClick={handleZoomOut} title="Alejar (Zoom -)">－</button>
     <span className="zoom-label">{Math.round(zoom*100)}%</span>
     <button onClick={handleZoomIn} title="Acercar (Zoom +)">＋</button>
     <button onClick={handleResetZoom} title="Restablecer zoom a 100%">↺ 100%</button>
     <button onClick={handleCenter} title="Centrar composición">⛶ Centrar</button>
    </div>
    <button className="export" onClick={exportPNG} disabled={!elements.length}>Exportar PNG</button>
   </div>

   <Stage ref={stageRef} width={size.w} height={size.h}
  scaleX={zoom} scaleY={zoom} x={stagePos.x} y={stagePos.y}
  onMouseEnter={onStageMouseEnter}
  onMouseLeave={onStageMouseLeave}
  onMouseDown={onStageMouseDown}
  onMouseMove={onStageMouseMove}
  onMouseUp={onStageMouseUp}
  onWheel={onStageWheel}
  onTouchStart={onStageTouchStart}
  onTouchMove={onStageTouchMove}
  onTouchEnd={onStageTouchEnd}
  onTouchCancel={onStageTouchEnd}>
    <Layer ref={layerRef}>
     {elements.filter(e=>e.type==='marimba').map(e=>(
      <MarimbaNode key={e.id} m={e as MarimbaElement} selected={selectedId===e.id}/>))}
     {elements.filter(e=>e.type==='person').map(e=>(
      <PersonNode key={e.id} e={e as PersonElement} selected={selectedId===e.id}/>))}
     <Transformer ref={trRef}
      rotateEnabled={!isLocked}
      keepRatio={false}
      rotateSnaps={[0,45,90,135,180,225,270,315]}
      enabledAnchors={isLocked?[]:['top-left','top-right','bottom-left','bottom-right']}
      anchorSize={9} anchorFill="#ffffff" anchorStroke="#15803d" borderStroke={isLocked?'#f59e0b':'#22c55e'}
      boundBoxFunc={(oldBox,newBox)=>newBox.width<40||newBox.height<40?oldBox:newBox}/>
    </Layer>
   </Stage>

   <div className="canvas-help">
    Arrastra personas sobre los puestos de una marimba para asignarlas; arrástralas fuera para liberarlas. Selecciona y usa Supr para eliminar. Esc deselecciona.
   </div>
   {selectedId&&!isLocked&&<button className="danger floating" onClick={()=>remove(selectedId)}>Eliminar seleccionado</button>}
  </div>
 );
}
