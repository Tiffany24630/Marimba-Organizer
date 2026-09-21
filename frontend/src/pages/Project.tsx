import {useEffect,useState} from 'react';
import {api} from '../lib/api';
import {useComposition} from '../store/composition';
import CanvasEditor from '../components/CanvasEditor';
import Inspector from '../components/Inspector';
import SuggestionsPanel from '../components/SuggestionsPanel';
import DistributionPanel from '../components/DistributionPanel';
import RequirementsPanel from '../components/RequirementsPanel';
import type {Song,Template} from '../types';

type SongRow={
 id:number;
 name:string;
 order_index:number;
 assignment_count:number;
 composition_id:number|null;
 composition_name:string|null;
};

type CompRow={
 id:number;
 name:string;
 song_id:number|null;
 width:number;
 height:number;
 data?:{elements?:any[]};
 song?:any;
 created_at?:string;
 updated_at?:string;
};

export default function Project({id,onBack}:{id:number;onBack:()=>void}){
 const [data,setData]=useState<any>(null);
 const [songs,setSongs]=useState<SongRow[]>([]);
 const [templates,setTemplates]=useState<Template[]>([]);
 const [openSongId,setOpenSongId]=useState<number|null>(null);
 const [compId,setCompId]=useState<number|null>(null);
 const [compName,setCompName]=useState('');
 const [saveStatus,setSaveStatus]=useState<'idle'|'saving'|'saved'|'error'>('idle');
 const [newSong,setNewSong]=useState('');

 const {
  elements,
  setElements,
  select,
  addPerson,
  addMarimba,
  addCustomMarimba,
  undo,
  redo,
  history,
  future,
  isDirty,
  markClean,
  markDirty,
 }=useComposition();

 const canUndo=history.length>0;
 const canRedo=future.length>0;

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

 useEffect(()=>{
  const handleBeforeUnload=(e:BeforeUnloadEvent)=>{
   if(isDirty){
    e.preventDefault();
    e.returnValue='';
   }
  };
  window.addEventListener('beforeunload',handleBeforeUnload);
  return()=>window.removeEventListener('beforeunload',handleBeforeUnload);
 },[isDirty]);

 const song:Song|undefined=data?.songs.find((s:Song)=>s.id===openSongId);
 const songRow:SongRow|undefined=songs.find(s=>s.id===openSongId);
 const songComps:CompRow[]=(data?.compositions||[]).filter((c:CompRow)=>c.song_id===openSongId);
 const compUpdatedAt:string|null=(data?.compositions||[]).find((c:CompRow)=>c.id===compId)?.updated_at||null;
 const detected=Array.from(new Set((song?.assignments||[]).map(a=>a.position)));
 const placedPersonIds=new Set(elements.filter(e=>e.type==='person').map(e=>(e as any).personId));

 const openSongWithComp=(sid:number,targetCompId?:number|null)=>{
  setOpenSongId(sid);select(null);
  const comps=(data?.compositions||[]).filter((c:CompRow)=>c.song_id===sid);
  const target=targetCompId!=null?comps.find((c:CompRow)=>c.id===targetCompId):comps[0];
  if(target){
   setCompId(target.id);
   setCompName(target.name||'');
   setElements(target.data?.elements||[]);
  }else{
   const sName=data?.songs.find((s:Song)=>s.id===sid)?.name;
   setCompId(null);
   setCompName(sName?`${sName} - Distribución principal`:'Nueva composición');
   setElements([]);
  }
  setSaveStatus('idle');
 };

 const openSongWithNewComp=(sid:number)=>{
  setOpenSongId(sid);select(null);
  const sName=data?.songs.find((s:Song)=>s.id===sid)?.name;
  setCompId(null);
  setCompName(sName?`${sName} - Nueva distribución`:'Nueva composición');
  setElements([]);
  setSaveStatus('idle');
 };

 const backToSongs=()=>{
  if(isDirty){
   if(!window.confirm('Tienes cambios sin guardar en esta composición. ¿Deseas salir de todas formas?')){
    return;
   }
  }
  setOpenSongId(null);setCompId(null);setElements([]);select(null);
  if(data) reloadSongs(id);
 };

 const loadComposition=(cid:number)=>{
  if(isDirty){
   if(!window.confirm('Tienes cambios sin guardar. ¿Deseas cambiar de composición?')){
    return;
   }
  }
  const c=(data?.compositions||[]).find((x:CompRow)=>x.id===cid);
  if(!c)return;
  setCompId(c.id);
  setCompName(c.name||'');
  setElements(c.data?.elements||[]);
  select(null);
  setSaveStatus('idle');
 };

 const newComposition=()=>{
  if(isDirty){
   if(!window.confirm('Tienes cambios sin guardar. ¿Deseas iniciar una nueva composición?')){
    return;
   }
  }
  setCompId(null);
  setCompName(song?.name?`${song.name} - Nueva composición`:'Nueva composición');
  setElements([]);
  select(null);
  setSaveStatus('idle');
 };

 const save=async()=>{
  if(!data||openSongId==null)return;
  setSaveStatus('saving');
  try{
   const name=compName.trim()||song?.name||'Composición';
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
   markClean();
   setSaveStatus('saved');
   window.setTimeout(()=>setSaveStatus('idle'),3000);
   reloadSongs(id);
  }catch(e:any){
   setSaveStatus('error');
   alert(e.message);
  }
 };

 const saveAs=async()=>{
  if(!data||openSongId==null)return;
  const defaultName=compName?`${compName} (copia)`:`${song?.name||'Composición'} - Copia`;
  const targetName=window.prompt('Guardar como nueva composición:',defaultName);
  if(targetName===null)return;
  const trimmed=targetName.trim();
  if(!trimmed){
   alert('El nombre no puede estar vacío.');
   return;
  }
  setSaveStatus('saving');
  try{
   const payload={
    project_id:id,
    song_id:openSongId,
    name:trimmed,
    width:1600,
    height:900,
    data:{elements},
   };
   const created=await api.createComposition(payload);
   setData((d:any)=>({...d,compositions:[...(d?.compositions||[]),created]}));
   setCompId(created.id);
   setCompName(created.name);
   markClean();
   setSaveStatus('saved');
   window.setTimeout(()=>setSaveStatus('idle'),3000);
   reloadSongs(id);
  }catch(e:any){
   setSaveStatus('error');
   alert(e.message);
  }
 };

 const duplicateComp=async(cid:number,currentName:string)=>{
  const targetName=window.prompt('Nombre de la copia independiente:',`${currentName} (copia)`);
  if(targetName===null)return;
  try{
   const copy=await api.duplicateComposition(cid,{name:targetName.trim()||undefined});
   setData((d:any)=>({...d,compositions:[...(d.compositions||[]),copy]}));
   reloadSongs(id);
   if(openSongId!=null&&copy.song_id===openSongId){
    setCompId(copy.id);
    setCompName(copy.name||'');
    setElements(copy.data?.elements||[]);
    select(null);
    setSaveStatus('idle');
   }
  }catch(e:any){
   alert(e.message);
  }
 };

 const renameComp=async(cid:number,currentName:string)=>{
  const n=window.prompt('Nuevo nombre de la composición:',currentName);
  if(n===null)return;
  const trimmed=n.trim();
  if(!trimmed){
   alert('El nombre no puede estar vacío.');
   return;
  }
  try{
   const updated=await api.renameComposition(cid,trimmed);
   setData((d:any)=>({...d,compositions:(d.compositions||[]).map((c:any)=>c.id===cid?{...c,name:updated.name}:c)}));
   if(compId===cid){
    setCompName(updated.name);
   }
   reloadSongs(id);
  }catch(e:any){
   alert(e.message);
  }
 };

 const deleteComp=async(cid:number,currentName:string)=>{
  if(!window.confirm(`¿Eliminar la composición "${currentName}"?\n\nEsta acción NO eliminará la canción, personas ni asignaciones del proyecto.`)){
   return;
  }
  try{
   await api.deleteComposition(cid);
   setData((d:any)=>({...d,compositions:(d.compositions||[]).filter((c:any)=>c.id!==cid)}));
   if(compId===cid){
    const remaining=(data?.compositions||[]).filter((c:any)=>c.song_id===openSongId&&c.id!==cid);
    if(remaining.length>0){
     loadComposition(remaining[0].id);
    }else{
     newComposition();
    }
   }
   reloadSongs(id);
  }catch(e:any){
   alert(e.message);
  }
 };

 if(!data)return <main className="page"><p>Cargando…</p></main>;

 // ============ VISTA 1: CANCIONES DEL PROYECTO ============
 if(openSongId===null){
  return (
   <main className="page">
    <header className="proj-head">
     <button onClick={onBack}>← Volver a Proyectos</button>
     <h1>{data.project.name}</h1>
     <p className="hint">
      {data.project.source_filename?`Excel: ${data.project.source_filename} · `:''}
      {songs.length} canciones · {(data.compositions||[]).length} composiciones
     </p>
    </header>

    <div className="proj-grid">
     <section className="card">
      <h2>Canciones</h2>
      <div className="newsong">
       <input value={newSong} onChange={e=>setNewSong(e.target.value)} placeholder="Nombre de la nueva canción"
        onKeyDown={e=>{if(e.key==='Enter'&&newSong.trim())api.createSong(id,newSong.trim()).then(()=>{setNewSong('');reloadSongs(id);}).catch(err=>alert(err.message));}}/>
       <button className="primary" disabled={!newSong.trim()} onClick={()=>{
        api.createSong(id,newSong.trim()).then(()=>{setNewSong('');reloadSongs(id);}).catch(e=>alert(e.message));
       }}>+ Nueva canción</button>
      </div>

      {songs.length===0&&<p className="hint">No hay canciones todavía. Créalas aquí o impórtalas desde el Excel.</p>}

      {songs.map(s=>{
       const comps=(data.compositions||[]).filter((c:CompRow)=>c.song_id===s.id);
       return (
        <div className="song-card-block" key={s.id}>
         <div className="song-header-row">
          <div className="song-info">
           <strong>{s.name}</strong>
           <small>{s.assignment_count} participación(es) registradas</small>
          </div>
          <div className="song-actions">
           <button className="primary" onClick={()=>openSongWithComp(s.id)}>
            {comps.length>0?'Abrir editor':'+ Crear composición'}
           </button>
           <button title="Renombrar canción" onClick={async()=>{
            const n=window.prompt('Nuevo nombre de la canción:',s.name);
            if(n&&n.trim())try{await api.renameSong(s.id,n.trim());reloadSongs(id);}catch(e:any){alert(e.message);}
           }}>✎</button>
           <button className="danger" title="Eliminar canción" onClick={async()=>{
            if(!window.confirm(`¿Eliminar la canción "${s.name}" y sus asignaciones?`))return;
            try{await api.deleteSong(s.id);reloadSongs(id);}catch(e:any){alert(e.message);}
           }}>✕</button>
          </div>
         </div>

         <div className="song-comps-box">
          <div className="song-comps-header">
           <span>Composiciones ({comps.length}):</span>
           <button className="mini-link" onClick={()=>openSongWithNewComp(s.id)}>+ Nueva versión</button>
          </div>
          {comps.length===0?(
           <p className="hint">Sin composiciones guardadas para esta canción.</p>
          ):(
           comps.map((c:CompRow)=>(
            <div className="comp-row-item" key={c.id}>
             <span className="comp-item-name">✓ {c.name}</span>
             <div className="comp-item-btns">
              <button className="mini-btn" onClick={()=>openSongWithComp(s.id,c.id)}>Abrir</button>
              <button className="mini-btn" title="Duplicar" onClick={()=>duplicateComp(c.id,c.name)}>Duplicar</button>
              <button className="mini-btn" title="Renombrar" onClick={()=>renameComp(c.id,c.name)}>Renombrar</button>
              <button className="mini-btn danger" title="Eliminar composición" onClick={()=>deleteComp(c.id,c.name)}>Eliminar</button>
             </div>
            </div>
           ))
          )}
         </div>
        </div>
       );
      })}
     </section>

     <section className="card">
      <h2>Todas las composiciones</h2>
      {(data.compositions||[]).length===0&&<p className="hint">Aún no hay composiciones guardadas en este proyecto.</p>}
      {(data.compositions||[]).map((c:CompRow)=>{
       const s=songs.find(x=>x.id===c.song_id);
       return (
        <div className="comp-global-row" key={c.id}>
         <div className="comp-info">
          <strong>{c.name}</strong>
          <small>{s?`Canción: ${s.name}`:'Sin canción asociada'}</small>
         </div>
         <div className="comp-item-btns">
          <button onClick={()=>{if(c.song_id) openSongWithComp(c.song_id,c.id);}}>Abrir</button>
          <button title="Duplicar" onClick={()=>duplicateComp(c.id,c.name)}>Duplicar</button>
          <button title="Renombrar" onClick={()=>renameComp(c.id,c.name)}>Renombrar</button>
          <button className="danger" title="Eliminar" onClick={()=>deleteComp(c.id,c.name)}>✕</button>
         </div>
        </div>
       );
      })}
     </section>
    </div>
   </main>
  );
 }

 // ============ VISTA 2: EDITOR DE COMPOSICIÓN ============
 const editingSaved=compId!=null;

 return (
  <main className="editor-page">
   <header className="topbar">
    <button onClick={backToSongs} title="Volver a lista de canciones">← Canciones</button>
    <div className="editor-title-box">
     <strong>{data.project.name}</strong>
     <span className="editor-subtitle">
      Canción: <strong>{songRow?.name||'Sin canción'}</strong> · Composición: <strong>{compName||'Distribución sin título'}</strong>
     </span>
    </div>

    <div className="status-container">
     {saveStatus==='saving'&&(
      <span className="status-badge saving">Guardando...</span>
     )}
     {saveStatus==='saved'&&(
      <span className="status-badge saved">Guardado ✓</span>
     )}
     {saveStatus==='error'&&(
      <span className="status-badge error">Error al guardar ⚠️</span>
     )}
     {saveStatus==='idle'&&isDirty&&(
      <span className="status-badge dirty" title="Hay cambios sin guardar">Cambios sin guardar ●</span>
     )}
     {saveStatus==='idle'&&!isDirty&&editingSaved&&(
      <span className="status-badge idle">Guardado ✓</span>
     )}
    </div>

    <div className="actions">
     <div className="undo-redo-box">
      <button disabled={!canUndo} onClick={undo} title="Deshacer (Ctrl+Z)">↶</button>
      <button disabled={!canRedo} onClick={redo} title="Rehacer (Ctrl+Y)">↷</button>
     </div>

     {songComps.length>0&&(
      <select value={compId??''} onChange={e=>{const v=Number(e.target.value);if(v)loadComposition(v);else newComposition();}}>
       {songComps.map((c:CompRow)=><option key={c.id} value={c.id}>{c.name}</option>)}
       {compId===null&&<option value="">— Nueva (sin guardar) —</option>}
       <option value="">+ Nueva composición...</option>
      </select>
     )}

     <input className="cname" value={compName} onChange={e=>{setCompName(e.target.value);markDirty();}} placeholder={songRow?.name||'Nombre de la composición'}/>

     <button className="primary" onClick={save} disabled={saveStatus==='saving'}>
      {editingSaved?'Guardar':'Guardar'}
     </button>

     <button onClick={saveAs} title="Guardar como una nueva copia independiente">
      Guardar como...
     </button>

     {editingSaved&&(
      <button className="danger mini" onClick={()=>deleteComp(compId!,compName)} title="Eliminar únicamente esta composición">
       Eliminar
      </button>
     )}
    </div>
   </header>

   <div className="workspace">
    <aside className="sidebar">
     <h3>Personas de la pieza</h3>
     {(song?.assignments||[]).length===0&&<p className="hint">Sin personas en esta canción.</p>}
     {(song?.assignments||[]).map((a:any)=>{
      const onCanvas=placedPersonIds.has(a.person_id);
      return (
       <button className="item" key={a.id} onClick={()=>{if(!onCanvas)addPerson({id:a.person_id,name:a.person,position:a.position});}}>
        <b>{onCanvas?'✓ ':''}{a.person}</b><small>{a.position}</small>
       </button>);
     })}

     <h3>Puestos detectados</h3>
     {detected.length>0
      ?<div className="chips">{detected.map(p=><span className="chip" key={p}>{p}</span>)}</div>
      :<p className="hint">Sin puestos en esta canción.</p>}

     {openSongId!=null&&(
      <RequirementsPanel songId={openSongId} compositionId={compId} refreshKey={compUpdatedAt} dirty={isDirty}/>
     )}

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
       <b>+ {t.name}</b><small>{t.positions.length} puestos · {t.positions.join(', ')}</small>
      </button>))}
     <button className="item custom" onClick={()=>addCustomMarimba()}>
      <b>+ Marimba personalizada</b><small>Empieza con un puesto y configúrala en el panel derecho</small>
     </button>
     <p className="hint">Las plantillas son solo punto de partida: luego puedes agregar, quitar, cambiar o reordenar puestos sin afectar la plantilla.</p>
    </aside>

    <section className="canvas-panel"><CanvasEditor/></section>
    <Inspector detectedPositions={detected}/>
   </div>
  </main>
 );
}
