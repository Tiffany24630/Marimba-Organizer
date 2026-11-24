import {useRef,useState} from 'react';
import Konva from 'konva';
import type {Composition,Element} from '../types';
import {captionText,compositionBounds,downloadDataUrl,imageFileName} from '../lib/export';
import {drawElements} from '../lib/render';
import {api} from '../lib/api';

export type ExportRow={compositionId:number;name:string;songId:number|null;songName:string|null};
export type ExportResult={ok:number;failed:{name:string;reason:string}[];cancelled:boolean};

const CAPTION_H=34;

/**
 * Fase 7B.3 - exportacion masiva de las composiciones de un trabajo.
 *
 * Reutiliza el MISMO criterio de dibujo que el editor (mismas cajas, misma
 * escala de persona) para que la imagen sea identica a lo que se ve, y anade
 * una rotulacion en una franja reservada ARRIBA, fuera del area de los puestos:
 * el nombre de la cancion y, si existe, el de la composicion.
 *
 * Se renderiza en un Stage oculto que se destruye al terminar: no se toca la
 * composicion abierta ni los datos guardados. Si una falla, se informa cual y
 * se conservan las imagenes ya generadas.
 */
export default function MassExport({rows,onDone}:{
 rows:ExportRow[];onDone?:(r:ExportResult)=>void;
}){
 const [busy,setBusy]=useState(false);
 const [progress,setProgress]=useState(0);
 const [result,setResult]=useState<ExportResult|null>(null);
 // `useRef` y no un closure en `window`: el boton de cancelar y el bucle
 // comparten la MISMA referencia, sin tocar el estado de React.
 const stop=useRef(false);

 const run=async()=>{
  if(busy||rows.length===0)return;
  setBusy(true);setProgress(0);setResult(null);stop.current=false;
  const failed:{name:string;reason:string}[]=[];
  let ok=0;

  for(let i=0;i<rows.length;i++){
   if(stop.current)break;
   const row=rows[i];
   try{
    // Se usa la composicion GUARDADA de cada fila, no el estado del lienzo.
    const comp=await api.composition(row.compositionId) as Composition;
    const els=(comp.data?.elements||[]) as Element[];
    const bounds=compositionBounds(els);
    if(!bounds){
     // Composicion vacia: no es un fallo, simplemente no hay nada que dibujar.
     failed.push({name:row.name,reason:'La composición está vacía.'});
    }else{
     const stage=new Konva.Stage({container:document.createElement('div'),
      width:bounds.width,height:bounds.height});
     const layer=new Konva.Layer();
     stage.add(layer);
     layer.add(new Konva.Rect({x:0,y:0,width:bounds.width,height:bounds.height,fill:'#111827'}));
     // Franja de rotulacion: se reserva y se recorta al exportar, de modo que
     // el texto NUNCA pisa puestos ni nombres.
     layer.add(new Konva.Rect({x:0,y:0,width:bounds.width,height:CAPTION_H,fill:'#0b1220'}));
     const full=[captionText(row.songName||''),captionText(row.name||'')]
      .filter(Boolean).join(' · ');
     if(full){
      layer.add(new Konva.Text({x:10,y:9,width:bounds.width-20,text:full,
       fontSize:15,fontStyle:'bold',fill:'#f9fafb',ellipsis:true}));
     }
     const g=new Konva.Group({x:bounds.x,y:bounds.y});
     drawElements(g,els);
     layer.add(g);
     layer.draw();
     const url=stage.toDataURL({pixelRatio:2,y:CAPTION_H,height:bounds.height-CAPTION_H});
     // Se liberan los recursos temporales ANTES de la siguiente imagen.
     const host=stage.container();
     stage.destroy();
     host.remove();
     downloadDataUrl(url,imageFileName({index:i,total:rows.length,
      song:row.songName,composition:row.name}));
     ok++;
    }
   }catch(e:any){
    // Un fallo puntual no detiene el resto: se registra cual fue.
    failed.push({name:row.name,reason:String(e?.message||e)});
   }
   setProgress(i+1);
   // Cede el hilo: la interfaz no se congela con muchas composiciones.
   await new Promise(r=>setTimeout(r,0));
  }
  const res:ExportResult={ok,failed,cancelled:stop.current};
  setResult(res);setBusy(false);setProgress(0);
  onDone?.(res);
 };

 if(rows.length===0)return null;

 return (
  <div className="mass-export">
   <button className="primary" onClick={run} disabled={busy}>
    {busy?`Exportando… ${progress}/${rows.length}`
     :`Exportar todas las imágenes (${rows.length})`}
   </button>
   {busy&&(
    <>
     <progress max={rows.length} value={progress}
      aria-label="Progreso de la exportación"/>
     <button onClick={()=>{stop.current=true;}}>Cancelar exportación</button>
    </>
   )}
   {result&&(
    <div className={`export-result ${result.failed.length?'warn':'ok'}`}>
     <p>
      {result.cancelled?'Exportación cancelada. ':''}
      {result.ok} imagen{result.ok===1?'':'es'} generada{result.ok===1?'':'s'}.
     </p>
     {result.failed.length>0&&(
      <ul>{result.failed.map((f,i)=>(<li key={i}><strong>{f.name}</strong>: {f.reason}</li>))}</ul>
     )}
    </div>
   )}
  </div>
 );
}
