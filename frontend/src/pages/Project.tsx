import {useEffect,useState} from 'react';
import {api} from '../lib/api';
import {useComposition} from '../store/composition';
import CanvasEditor from '../components/CanvasEditor';
import Inspector from '../components/Inspector';
import SuggestionsPanel from '../components/SuggestionsPanel';
import DistributionPanel from '../components/DistributionPanel';
import type {Song,Template} from '../types';

type SongRow={id:number,name:string,order_index:number,assignment_count:number,composition_id:number|null,composition_name:string|null};
type CompRow={id:number,name:string,song_id:number|null,width:number,height:number,data?:{elements?:any[]},song?:any};

export default function Project({id,onBack}:{id:number,onBack:()=>void}){
 const [data,setData]=useState<any>(null);
 const [songs,setSongs]=useState<SongRow[]>([]);
 const [templates,setTemplates]=useState<Template[]>([]);
 const [openSongId,setOpenSongId]=useState<number|null>(null);
 const [compId,setCompId]=useState<number|null>(null);
 const [compName,setCompName]=useState('');
 const [saving,setSaving]=useState(false);
 const [flash,setFlash]=useState(false);
 const [newSong,setNewSong]=useState('');
 const {elements,setElements,select,addPerson,addMarimba,addCustomMarimba}=useComposition();

 const reloadSongs=(pid:number)=>{
  api.songs(pid).then(setSongs).catch(()=>{});
 };

 useEffect(()=>{
  let alive=true;
  setData(null);setSongs([]);setOpenSongId(null);setCompId(null);setElements([]);select(null);
  api.project(id).then(x=>{
   if(!alive)return;
   setData(x);
   reloadSongs(id);
  }).catch((e:any)=>alert(e.message));
  api.templates().then(t=>{if(alive)setTemplates(t)}).catch(()=>{});
  return()=>{alive=false};
 },[id,setElements,select]);

 const song:Song|undefined=data?.songs.find((s:Song)=>s.id===openSongId);
 const songRow:SongRow|undefined=songs.find(s=>s.id===openSongId);
 const songComps:CompRow[]=(data?.compositions||[]).filter((c:CompRow)=>c.song_id===openSongId);
 const detected=Array.from(new Set((song?.assignments||[]).map(a=>a.position)));
 const placedPersonIds=new Set(elements.filter(e=>e.type==='person').map(e=>(e as any).personId));

 const openSong=(sid:number)=>{
  const comps=(data?.compositions||[]).filter((c:CompRow)=>c.song_id===sid);
  setOpenSongId(sid);select(null);
  const c=comps[0]||null;
  if(c){
   setCompId(c.id);setCompName(c.name||'');setElements(c.data?.elements||[]);
  }else{
   setCompId(null);setCompName('');setElements([]);
  }
 };

 const backToSongs=()=>{
  setOpenSongId(null);setCompId(null);setElements([]);select(null);
  if(data)reloadSongs(id);
 };

 const loadComposition=(cid:number)=>{
  const c=(data?.compositions||[]).find((x:CompRow)=>x.id===cid);
  if(!c)return;
  setCompId(c.id);setCompName(c.name||'');
  setElements(c.data?.elements||[]);select(null);
 };

 const newComposition=()=>{setCompId(null);setCompName('');setElements([]);select(null);};

 const save=async()=>{
  if(!data||openSongId==null)return;
  setSaving(true);
  try{
   const name=compName.trim()||song?.name||'ComposiciÃ³n';
   const payload={project_id:id,song_id:openSongId,name,width:1600,height:900,data:{elements}};
   if(compId){
    const updated=await api.updateComposition(compId,payload);
    setData((d:any)=>({...d,compositions:(d.compositions||[]).map((c:any)=>c.id===compId?updated:c)}));
   }else{
    const created=await api.createComposition(payload);
    setCompId(created.id);
    setData((d:any)=>({...d,compositions:[...(d?.compositions||[]),created]}));
   }
   setCompName(name);
   setFlash(true);
   window.setTimeout(()=>setFlash(false),2500);
   reloadSongs(id);
  }catch(e:any){alert(e.message)}finally{setSaving(false)}
 };

 const duplicate=async()=>{
  if(compId==null)return;
  const targetName=window.prompt('Nombre de la copia (p. ej. la otra canciÃ³n):',compName?`${compName} (copia)`:'Copia');
  if(targetName===null)return;
  try{
   const copy=await api.duplicateComposition(compId,{name:targetName.trim()||undefined});
   setData((d:any)=>({...d,compositions:[...(d.compositions||[]),copy]}));
   setCompId(copy.id);setCompName(copy.name||'');setElements(copy.data?.elements||[]);
   reloadSongs(id);
  }catch(e:any){alert(e.message)}
 };
 if(!data)return <main className="page"><p>Cargandoâ€¦</p></main>;

 // ============ VISTA 1: CANCIONES DEL PROYECTO ============
 if(openSongId===null)return (
  <main className="page">
   <header className="proj-head">
    <button onClick={onBack}>â† Trabajos</button>
    <h1>{data.project.name}</h1>
    <p className="hint">{data.project.source_filename?`Excel: ${data.project.source_filename} Â· `:''}{songs.length} canciones Â· {(data.compositions||[]).length} composiciones</p>
   </header>
   <div className="proj-grid">
    <section className="card">
     <h2>Canciones</h2>
     <div className="newsong">
      <input value={newSong} onChange={e=>setNewSong(e.target.value)} placeholder="Nombre de la nueva canciÃ³n"
       onKeyDown={e=>{if(e.key==='Enter'&&newSong.trim())api.createSong(id,newSong.trim()).then(()=>{setNewSong('');reloadSongs(id)}).catch(err=>alert(err.message));}}/>
      <button className="primary" disabled={!newSong.trim()} onClick={()=>{
       api.createSong(id,newSong.trim()).then(()=>{setNewSong('');reloadSongs(id)}).catch(e=>alert(e.message));
      }}>+ Nueva canciÃ³n</button>
     </div>
     {songs.length===0&&<p className="hint">No hay canciones todavÃ­a. CrÃ©alas aquÃ­ o impÃ³rtalas desde el Excel.</p>}
     {songs.map(s=>(
      <div className="song-row" key={s.id}>
       <div className="song-info">
        <strong>{s.name}</strong>
        <small>{s.assignment_count} participaciÃ³n(es) Â· {s.composition_id?'âœ“ ComposiciÃ³n creada':'â€” sin composiciÃ³n'}</small>
       </div>
       <button onClick={()=>openSong(s.id)}>{s.composition_id?'Abrir':'Crear composiciÃ³n'}</button>
       <button title="Renombrar" onClick={async()=>{
        const n=window.prompt('Nuevo nombre de la canciÃ³n:',s.name);
        if(n&&n.trim())try{await api.renameSong(s.id,n.trim());reloadSongs(id);}catch(e:any){alert(e.message)}
       }}>âœŽ</button>
       <button className="danger" title="Eliminar canciÃ³n" onClick={async()=>{
        if(!window.confirm(`Â¿Eliminar la canciÃ³n "${s.name}" y sus asignaciones?`))return;
        try{await api.deleteSong(s.id);reloadSongs(id);}catch(e:any){alert(e.message)}
       }}>âœ•</button>
      </div>
     ))}
    </section>
    <section className="card">
     <h2>Composiciones</h2>
     {(data.compositions||[]).length===0&&<p className="hint">AÃºn no hay composiciones guardadas.</p>}
     {(data.compositions||[]).map((c:CompRow)=>{
      const sName=songs.find(s=>s.id===c.song_id)?.name;
      return (
       <div className="song-row" key={c.id}>
        <div className="song-info">
         <strong>{c.name}</strong>
         <small>{sName?`CanciÃ³n: ${sName}`:'Sin canciÃ³n asociada'}</small>
        </div>
        <button onClick={()=>{if(c.song_id)openSong(c.song_id);}}>Abrir</button>
        <button title="Duplicar composiciÃ³n" onClick={async()=>{
         const n=window.prompt('Nombre de la copia:',`${c.name} (copia)`);
         if(n===null)return;
         try{
          const copy=await api.duplicateComposition(c.id,{name:n.trim()||undefined});
          setData((d:any)=>({...d,compositions:[...(d.compositions||[]),copy]}));
          reloadSongs(id);
         }catch(e:any){alert(e.message)}
        }}>â§‰</button>
       </div>);
     })}
    </section>
   </div>
  </main>
 );
 // ============ VISTA 2: EDITOR DE COMPOSICIÃ“N ============
 const editingSaved=compId!=null;

 return (
  <main className="editor-page">
   <header className="topbar">
    <button onClick={backToSongs}>â† Canciones</button>
    <div><strong>{data.project.name}</strong><span>{songRow?.name||'Sin canciÃ³n'}</span></div>
    <div className="actions">
     {songComps.length>1&&(
      <select value={compId??''} onChange={e=>{const v=Number(e.target.value);if(v)loadComposition(v);}}>
       {songComps.map((c:CompRow)=><option key={c.id} value={c.id}>{c.name}</option>)}
       {compId===null&&<option value="">â€” nueva sin guardar â€”</option>}
      </select>)}
     <button onClick={newComposition}>Nueva</button>
     {editingSaved&&<button onClick={duplicate} title="Duplicar esta composiciÃ³n (copia independiente)">â§‰ Duplicar</button>}
     <input className="cname" value={compName} onChange={e=>setCompName(e.target.value)} placeholder={songRow?.name||'Nombre de la composiciÃ³n'}/>
     <button className="primary" onClick={save} disabled={saving}>Guardar</button>
     {flash&&<span className="saved">Guardado âœ“</span>}
    </div>
   </header>
   <div className="workspace">
    <aside className="sidebar">
     <h3>Personas de la pieza</h3>
     {(song?.assignments||[]).length===0&&<p className="hint">Sin personas en esta canciÃ³n.</p>}
     {(song?.assignments||[]).map((a:any)=>{
      const onCanvas=placedPersonIds.has(a.person_id);
      return (
       <button className="item" key={a.id} onClick={()=>{if(!onCanvas)addPerson({id:a.person_id,name:a.person,position:a.position});}}>
        <b>{onCanvas?'âœ“ ':''}{a.person}</b><small>{a.position}</small>
       </button>);
     })}
     <h3>Puestos detectados</h3>
     {detected.length>0
      ?<div className="chips">{detected.map(p=><span className="chip" key={p}>{p}</span>)}</div>
      :<p className="hint">Sin puestos en esta canciÃ³n.</p>}
      {openSongId!=null&&songRow&&(
       <DistributionPanel songId={openSongId} songName={songRow.name}
        onApplied={(comp:any)=>{
         setData((d:any)=>d?{...d,compositions:[...(d.compositions||[]),comp]}:d);
         setCompId(comp.id);setCompName(comp.name||'');
         setElements(comp.data?.elements||[]);select(null);reloadSongs(id);
        }} />
      )}
     {openSongId!=null&&songRow&&(
      <SuggestionsPanel songId={openSongId} songName={songRow.name}
       onApplied={(comp:any)=>{
        setData((d:any)=>d?{...d,compositions:[...(d.compositions||[]),comp]}:d);
        setCompId(comp.id);setCompName(comp.name||'');
        setElements(comp.data?.elements||[]);select(null);reloadSongs(id);
       }}/>
     )}
     <h3>Marimbas</h3>
     {templates.map((t:Template)=>(
      <button className="item" key={t.id} onClick={()=>addMarimba({name:t.name,positions:t.positions})}>
       <b>+ {t.name}</b><small>{t.positions.length} puestos Â· {t.positions.join(', ')}</small>
      </button>))}
     <button className="item custom" onClick={()=>addCustomMarimba()}>
      <b>+ Marimba personalizada</b><small>Empieza con un puesto y configÃºrala en el panel derecho</small>
     </button>
     <p className="hint">Las plantillas son solo punto de partida: luego puedes agregar, quitar, cambiar o reordenar puestos sin afectar la plantilla.</p>
    </aside>
    <section className="canvas-panel"><CanvasEditor/></section>
    <Inspector detectedPositions={detected}/>
   </div>
  </main>
 );
}
