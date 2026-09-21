const API=import.meta.env.VITE_API_URL||'http://localhost:8000/api';
async function req(path:string,options:RequestInit={}){const r=await fetch(API+path,options); if(!r.ok) throw new Error(await r.text()); return r.json();}
export const api={
 projects:()=>req('/projects'), project:(id:number)=>req(`/projects/${id}`), people:()=>req('/people'),
 positions:()=>req('/positions'), templates:()=>req('/marimba-templates'),
 preview:(file:File)=>{const f=new FormData();f.append('file',file);return req('/imports/preview',{method:'POST',body:f})},
 confirm:(payload:any)=>req('/imports/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),
 createComposition:(payload:any)=>req('/compositions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),
 updateComposition:(id:number,payload:any)=>req(`/compositions/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),
 renameComposition:(id:number,name:string)=>req(`/compositions/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})}),
 deleteComposition:(id:number)=>req(`/compositions/${id}`,{method:'DELETE'}),
 duplicateComposition:(id:number,payload:{name?:string;song_id?:number|null}={})=>req(`/compositions/${id}/duplicate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),
 songs:(projectId:number)=>req(`/projects/${projectId}/songs`),
 createSong:(projectId:number,name:string)=>req(`/projects/${projectId}/songs`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})}),
 renameSong:(id:number,name:string)=>req(`/songs/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})}),
 deleteSong:(id:number)=>req(`/songs/${id}`,{method:'DELETE'}),
 songHistory:(songId:number)=>req(`/songs/${songId}/history`),
 songRequirements:(songId:number,compositionId?:number|null)=>req(`/songs/${songId}/requirements${compositionId!=null?`?composition_id=${compositionId}`:''}`),
 songSuggestions:(songId:number)=>req(`/songs/${songId}/suggestions`),
 songDistribution:(songId:number)=>req(`/songs/${songId}/distribution-suggestion`),
 applyDistribution:(songId:number,payload:{proposals:any[];name?:string})=>req(`/songs/${songId}/distribution/apply`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),
 applySuggestions:(songId:number,payload:{proposals:any[];name?:string})=>req(`/songs/${songId}/suggestions/apply`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),
};
