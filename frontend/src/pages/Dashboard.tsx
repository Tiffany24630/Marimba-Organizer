import {useEffect,useState} from 'react';
import {api} from '../lib/api';
import ImportPanel from '../components/ImportPanel';
import type {Template} from '../types';

export default function Dashboard({open}:{open:(id:number)=>void}){
 const [projects,setProjects]=useState<any[]>([]);
 const [templates,setTemplates]=useState<Template[]>([]);
 const [msg,setMsg]=useState<{kind:'ok'|'err';text:string}|null>(null);
 const [busy,setBusy]=useState<number|null>(null);
 const load=()=>{
  api.projects().then(setProjects).catch(e=>alert(e.message));
  api.templates().then(setTemplates).catch(()=>{});
 };
 useEffect(()=>{load()},[]);

 const rename=async(p:any)=>{
  const n=window.prompt('Nuevo nombre del proyecto:',p.name);
  if(n===null)return;
  const trimmed=n.trim();
  if(!trimmed){setMsg({kind:'err',text:'El nombre no puede estar vacío.'});return;}
  setBusy(p.id);
  try{
   await api.renameProject(p.id,trimmed);
   setMsg({kind:'ok',text:`Proyecto renombrado a "${trimmed}".`});
   load();
  }catch(e:any){
   setMsg({kind:'err',text:String(e.message||e)});
  }finally{setBusy(null);}
 };

 const remove=async(p:any)=>{
  const ok=window.confirm(
   `¿Eliminar el trabajo "${p.name}"?\n\n`
   +`Se borrarán sus canciones, asignaciones y composiciones.\n`
   +`Las personas y las plantillas NO se eliminan.\n\n`
   +`Esta acción no se puede deshacer.`);
  if(!ok)return;
  setBusy(p.id);
  try{
   const r=await api.deleteProject(p.id);
   setMsg({kind:'ok',text:`"${p.name}" eliminado (${r.songs} canción/es, ${r.compositions_removed} composición/es).`});
   load();
  }catch(e:any){
   setMsg({kind:'err',text:String(e.message||e)});
  }finally{setBusy(null);}
 };

 const [editing,setEditing]=useState<Template|null>(null);
 // BUG ORIGINAL: el editor se renderizaba con `{editing && ...}`. Para CREAR una
 // plantilla nueva `editing` es `null`, asi que el panel nunca aparecia y el
 // boton "Nueva plantilla" no hacia nada. `editorOpen` separa "esta abierto el
 // editor" de "que plantilla se esta editando" (null = alta nueva).
 const [editorOpen,setEditorOpen]=useState(false);
 const [tplName,setTplName]=useState('');
 const [tplDesc,setTplDesc]=useState('');
 const [tplPos,setTplPos]=useState('');

 const openEditor=(t:Template|null)=>{
  setEditing(t);
  setTplName(t?t.name:'');
  setTplDesc(t?(t.description||''):'');
  setTplPos(t?t.positions.join(', '):'');
  setEditorOpen(true);
  setMsg(null);
 };
 const closeEditor=()=>{setEditorOpen(false);setEditing(null);};
 const parsePos=(raw:string)=>raw.split(',').map(s=>s.trim()).filter(Boolean);
 const saveTemplate=async()=>{
  const positions=parsePos(tplPos);
  if(!tplName.trim()){setMsg({kind:'err',text:'La plantilla necesita un nombre.'});return;}
  if(positions.length===0){setMsg({kind:'err',text:'Agrega al menos un puesto (separa con comas).'});return;}
  setBusy(editing?-editing.id:0);
  try{
   if(editing) await api.updateTemplate(editing.id,{name:tplName.trim(),description:tplDesc.trim(),positions});
   else await api.createTemplate({name:tplName.trim(),description:tplDesc.trim(),positions});
   setMsg({kind:'ok',text:`Plantilla "${tplName.trim()}" ${editing?'actualizada':'creada'}.`});
   closeEditor();
   load();
  }catch(e:any){
   setMsg({kind:'err',text:String(e.message||e)});
  }finally{setBusy(null);}
 };

 // --- Proyecto en blanco: sin Excel y sin plantilla ---
 const [blankOpen,setBlankOpen]=useState(false);
 const [blankName,setBlankName]=useState('');
 const [blankDesc,setBlankDesc]=useState('');

 const createBlankProject=async()=>{
  const name=blankName.trim();
  if(!name){setMsg({kind:'err',text:'El proyecto necesita un nombre.'});return;}
  setBusy(0);
  try{
   const p=await api.createProject({name,description:blankDesc.trim()||undefined});
   setMsg({kind:'ok',text:`Proyecto "${name}" creado. Ya puedes agregar canciones, personas y marimbas.`});
   setBlankOpen(false);setBlankName('');setBlankDesc('');
   load();
   open(p.id);
  }catch(e:any){
   setMsg({kind:'err',text:String(e.message||e)});
  }finally{setBusy(null);}
 };

 const removeTemplate=async(t:Template)=>{
  const ok=window.confirm(
   `¿Eliminar la plantilla "${t.name}"?\n\n`
   +`Solo afecta a propuestas futuras. Las marimbas ya guardadas en composiciones\n`
   +`son copias independientes y no se modifican.`);
  if(!ok)return;
  setBusy(-t.id);
  try{
   await api.deleteTemplate(t.id);
   setMsg({kind:'ok',text:`Plantilla "${t.name}" eliminada.`});
   load();
  }catch(e:any){
   setMsg({kind:'err',text:String(e.message||e)});
  }finally{setBusy(null);}
 };

 return(
  <main className="page dash">
   <header className="dash-hero">
    <span className="eyebrow">Acomodo</span>
    <h1>Cada puesto, en su marimba.</h1>
    <p>
     Importa el Excel que ya usan, revisa participantes y construye distribuciones
     visuales editables. Las plantillas proponen la forma de cada marimba; tú
     decides el resultado final.
    </p>
    <div className="dash-stats">
     <div className="stat"><b>{projects.length}</b><span>trabajos</span></div>
     <div className="stat"><b>{templates.length}</b><span>plantillas</span></div>
    </div>
   </header>

   {msg&&(
    <div className={`dash-msg ${msg.kind}`} role="status" onClick={()=>setMsg(null)}>
     {msg.text}<span className="dash-msg-x">✕</span>
    </div>
   )}

   <div className="grid2 dash-grid">
    <section className="card">
     <div className="tpl-head">
      <h2>Trabajos anteriores</h2>
      <button className="primary" onClick={()=>{setBlankOpen(v=>!v);setMsg(null);}}>
       ＋ Nuevo proyecto
      </button>
     </div>
     <p className="hint">Abrir, renombrar o eliminar un trabajo guardado.</p>
     {blankOpen&&(
      <div className="tpl-editor">
       <h3>Proyecto en blanco</h3>
       <p className="hint">
        Se crea un trabajo vacío: sin Excel y sin plantilla. Dentro podrás
        agregar canciones, personas y marimbas manualmente, o importar un Excel
        más adelante.
       </p>
       <label className="field">Nombre del proyecto
        <input value={blankName} onChange={e=>setBlankName(e.target.value)}
         placeholder="Concierto de fin de año" autoFocus/>
       </label>
       <label className="field">Descripción (opcional)
        <input value={blankDesc} onChange={e=>setBlankDesc(e.target.value)}
         placeholder="Notas internas"/>
       </label>
       <div className="pp-form-actions">
        <button className="primary" onClick={createBlankProject}
         disabled={busy!==null||!blankName.trim()}>
         {busy!==null?'Creando…':'Crear y abrir'}
        </button>
        <button onClick={()=>setBlankOpen(false)}>Cancelar</button>
       </div>
      </div>
     )}
     {projects.length===0
      ?<p className="hint">Aún no hay trabajos guardados.</p>
      :<div className="proj-list">
       {projects.map(p=>(
        <div className="project" key={p.id}>
         <button className="project-open" onClick={()=>open(p.id)}>
          <strong>{p.name}</strong>
          <small>{p.source_filename||'Proyecto manual'}</small>
         </button>
         <div className="project-btns">
          <button title="Renombrar proyecto" disabled={busy===p.id}
           onClick={()=>rename(p)}>✎</button>
          <button className="danger" title="Eliminar proyecto" disabled={busy===p.id}
           onClick={()=>remove(p)}>🗑</button>
         </div>
        </div>
       ))}
      </div>}
    </section>

    <ImportPanel onDone={(id)=>{load();if(id)open(id);}} projects={projects}/>
   </div>

   <section className="card dash-templates">
    <div className="tpl-head">
     <h2>Plantillas de marimba</h2>
     <button className="primary" onClick={()=>openEditor(null)}>＋ Nueva plantilla</button>
    </div>
    <p className="hint">
     Al aplicar sugerencias solo se usan estas marimbas, y cada persona se coloca
     únicamente en un puesto que coincida con su puesto musical.
    </p>
    {editorOpen&&(
     <div className="tpl-editor">
      <h3>{editing?'Editar plantilla':'Nueva plantilla'}</h3>
      <div className="row2">
       <label className="field">Nombre
        <input value={tplName} onChange={e=>setTplName(e.target.value)} placeholder="Marimba grande" autoFocus/>
       </label>
       <label className="field">Descripción
        <input value={tplDesc} onChange={e=>setTplDesc(e.target.value)} placeholder="Opcional"/>
       </label>
      </div>
      <label className="field">Puestos (separados por comas, en orden)
       <input value={tplPos} onChange={e=>setTplPos(e.target.value)} placeholder="Primera, Primera, Centro, Bajo"/>
      </label>
      <div className="chips">
       {parsePos(tplPos).map((p,i)=><span className="chip" key={i}>{p}</span>)}
      </div>
      {parsePos(tplPos).length===0&&(
       <p className="hint warn">Agrega al menos un puesto para poder guardar la plantilla.</p>
      )}
      <div className="pp-form-actions">
       <button className="primary" onClick={saveTemplate}
        disabled={busy!==null||!tplName.trim()||parsePos(tplPos).length===0}>
        {busy!==null?'Guardando…':editing?'Guardar cambios':'Crear plantilla'}
       </button>
       <button onClick={closeEditor}>Cancelar</button>
      </div>
     </div>
    )}
    {templates.length===0
     ?<p className="hint">No hay plantillas registradas.</p>
     :<div className="tpl-grid">
      {templates.map(t=>(
       <div className="tpl-card" key={t.id}>
        <div className="tpl-head">
         <strong>{t.name}</strong>
         <div className="tpl-acts">
          <button title={`Editar ${t.name}`} disabled={busy===-t.id}
           onClick={()=>openEditor(t)}>✎</button>
          <button className="danger" title="Eliminar plantilla" disabled={busy===-t.id}
           onClick={()=>removeTemplate(t)}>🗑</button>
         </div>
        </div>
        <small className="hint">{t.description||'Sin descripción'}</small>
        <div className="tpl-slots">
         {t.positions.map((p,i)=><span className="chip" key={i}>{p}</span>)}
        </div>
        <small className="hint">{t.positions.length} puestos</small>
       </div>
      ))}
     </div>}
   </section>
  </main>
 );
}