import {useState} from 'react';
import {api} from '../lib/api';

type Assignment={person:string;position:string;mark:string};
type Song={name:string;assignments:Assignment[]};
type Preview={
 sheets:{name:string;songs:Song[]}[];
 people:string[];
 positions:string[];
 marks:string[];
 stats?:{valid_rows:number;empty_rows:number;warnings:string[]};
 matches?:{source:string;candidate:string;score:number}[];
 duplicates?:{exact:string[][];similar:{names:string[];score:number}[]};
 source_filename?:string;
};

const DEFAULT_POSITIONS=['Primera','Segunda','Centro','Bajo','Tenor'];

export default function ImportPanel({onDone,projects}:{onDone:(id?:number)=>void;projects?:{id:number,name:string}[]}){
 const [file,setFile]=useState<File|null>(null);
 const [data,setData]=useState<Preview|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState<string|null>(null);
 const [name,setName]=useState('Nuevo concierto');
 const [targetProject,setTargetProject]=useState<number|null>(null);
 // correcciones manuales: clave "hoja|canción|índice" → {person,position}
 const [fixes,setFixes]=useState<Record<string,{person?:string;position?:string}>>({});

 const validate=(f:File):string|null=>{
  const ext=(f.name.split('.').pop()||'').toLowerCase();
  if(!['xlsx','xlsm','xls'].includes(ext))return `Extensión no válida (.${ext}). Solo se admiten .xlsx, .xlsm y .xls.`;
  if(f.size===0)return 'El archivo está vacío (0 bytes).';
  if(f.size>10*1024*1024)return 'El archivo supera el tamaño permitido (10 MB).';
  return null;
 };

 const run=async()=>{
  if(!file)return;
  setError(null);
  const v=validate(file);
  if(v){setError(v);return;}
  setBusy(true);
  try{
   const p:Preview=await api.preview(file);
   setData(p);
   setFixes({});
   if(p.sheets.length===0||p.people.length===0)setError('El archivo no contiene filas válidas. Verifica canciones (fila 1), posiciones (fila 2) y personas con marcas (desde la fila 3).');
  }catch(e:any){
   let msg=e.message;
   try{const j=JSON.parse(msg);msg=j.detail||msg;}catch{/**/}
   setError(msg||'Error al analizar el archivo.');
   setData(null);
  }finally{setBusy(false)}
 };

 const keyOf=(sheet:string,song:string,i:number)=>`${sheet}|${song}|${i}`;

 const buildPayload=()=>{
  const sheets=data!.sheets.map(sh=>({
   name:sh.name,
   songs:sh.songs.map(sg=>({
    name:sg.name,
    assignments:sg.assignments.map((a,i)=>{
     const k=keyOf(sh.name,sg.name,i);
     const f=fixes[k]||{};
     return {person:(f.person??a.person??'').trim(),position:(f.position??a.position??'').trim(),mark:a.mark};
    }).filter(a=>a.person&&a.position),
   })).filter(sg=>sg.assignments.length>0),
  })).filter(sh=>sh.songs.length>0);
  return sheets;
 };

 const confirm=async()=>{
  if(!data)return;
  setBusy(true);
  setError(null);
  try{
   const sheets=buildPayload();
   if(sheets.length===0){setError('No queda ninguna asignación válida tras las correcciones. Revisa las filas advertidas.');setBusy(false);return;}
   const payload=targetProject!=null
    ?{project_id:targetProject,source_filename:data.source_filename,sheets}
    :{project_name:name.trim()||'Nuevo concierto',source_filename:data.source_filename,sheets};
   const res=await api.confirm(payload);
   onDone(res.id);
  }catch(e:any){
   let msg=e.message;
   try{const j=JSON.parse(msg);msg=j.detail||msg;}catch{/**/}
   setError(msg||'Error al confirmar la importación.');
  }finally{setBusy(false)}
 };
 const totalAssignments=data?.sheets.reduce((n,sh)=>n+sh.songs.reduce((m,sg)=>m+sg.assignments.length,0),0)||0;
 const warnings=data?.stats?.warnings||[];
 const dups=data?.duplicates;

 return (
  <section className="card">
   <h2>Importar Excel</h2>
   <p>Formato esperado: canciones en la fila 1, puestos musicales en la fila 2 y personas con marcas desde la fila 3. Límite: 10 MB (.xlsx, .xlsm, .xls).</p>
   <input type="file" accept=".xlsx,.xlsm,.xls" onChange={e=>{setFile(e.target.files?.[0]||null);setData(null);setError(null);}}/>
   <button onClick={run} disabled={!file||busy}>{busy?'Procesando…':'Analizar'}</button>
   {error&&<p className="import-error">⚠ {error}</p>}

   {data&&<div className="import-result">
    <input value={name} onChange={e=>setName(e.target.value)} placeholder="Nombre del trabajo" disabled={targetProject!=null}/>
    {projects&&projects.length>0&&(
     <label className="field">O importar en un proyecto existente
      <select value={targetProject??''} onChange={e=>setTargetProject(e.target.value?Number(e.target.value):null)}>
       <option value="">— crear proyecto nuevo —</option>
       {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
     </label>)}

    <p>✓ {data.sheets.length} hojas · {data.people.length} personas · {data.positions.length} posiciones · {totalAssignments} asignaciones · {data.stats?.valid_rows??0} filas válidas · {data.stats?.empty_rows??0} filas vacías</p>
    <p className="hint">Posiciones detectadas: {data.positions.length?data.positions.join(', '):'ninguna'} · Marcas: {data.marks.join(', ')||'—'}</p>

    {dups&&dups.exact.length>0&&<div className="review-block warn"><h3>Posibles duplicados exactos</h3>
     <ul>{dups.exact.map((g,i)=><li key={i}>{g.join(' · ')}</li>)}</ul></div>}
    {dups&&dups.similar.length>0&&<div className="review-block warn"><h3>Nombres similares (revisa si son la misma persona)</h3>
     <ul>{dups.similar.slice(0,10).map((d,i)=><li key={i}>{d.names.join(' ↔ ')} ({d.score}%)</li>)}</ul></div>}
    {data.matches&&data.matches.length>0&&<div className="review-block"><h3>Coincidencias con personas existentes</h3>
     <ul>{data.matches.slice(0,12).map(m=><li key={m.source}>{m.source} → {m.candidate} ({m.score}%)</li>)}</ul></div>}
    {warnings.length>0&&<div className="review-block warn"><h3>Filas con advertencias ({warnings.length})</h3>
     <ul>{warnings.slice(0,15).map((w,i)=><li key={i}>{w}</li>)}</ul></div>}

    <h3>Asignaciones persona → posición (editable)</h3>
    <div className="review-block">
     {data.sheets.map(sh=><div key={sh.name}>
      <h4>Hoja: {sh.name}</h4>
      {sh.songs.map(sg=><div key={sg.name}>
       <strong>{sg.name}</strong>
       <table className="review-table">
        <thead><tr><th>Persona</th><th>Posición</th><th>Marca</th></tr></thead>
        <tbody>
         {sg.assignments.map((a,i)=>{
          const k=keyOf(sh.name,sg.name,i);
          const f=fixes[k]||{};
          const bad=!((f.person??a.person)&&(f.position??a.position));
          return <tr key={i} className={bad?'bad':''}>
           <td><input list="import-people" value={f.person??a.person} onChange={e=>setFixes(s=>({...s,[k]:{...f,person:e.target.value}}))}/></td>
           <td><input list="import-positions" value={f.position??a.position} onChange={e=>setFixes(s=>({...s,[k]:{...f,position:e.target.value}}))}/></td>
           <td>{a.mark}</td>
          </tr>;
         })}
        </tbody>
       </table>
      </div>)}
     </div>)}
     <datalist id="import-people">{data.people.map(p=><option key={p} value={p}/>)}</datalist>
     <datalist id="import-positions">{Array.from(new Set([...DEFAULT_POSITIONS,...data.positions])).map(p=><option key={p} value={p}/>)}</datalist>
    </div>

    <button className="primary" onClick={confirm} disabled={busy}>Confirmar importación</button>
   </div>}
  </section>
 );
}

