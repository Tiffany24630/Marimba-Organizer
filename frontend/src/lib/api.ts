const API=import.meta.env.VITE_API_URL||'http://localhost:8000/api';

// Fase 7C: la sesion viaja en una cookie HttpOnly, asi que el navegador debe
// enviarla (`credentials:'include'`) y las peticiones que cambian estado deben
// llevar el token anti-CSRF en una cabecera. El token se lee de la cookie
// `marimba_csrf`, que es legible por JS a proposito: por si sola no autentica.
const UNSAFE=['POST','PUT','PATCH','DELETE'];

function csrfToken():string{
 const m=document.cookie.match(/(?:^|;\s*)marimba_csrf=([^;]+)/);
 return m?decodeURIComponent(m[1]):'';
}

async function req(path:string,options:RequestInit={}){
 const method=(options.method||'GET').toUpperCase();
 const headers:Record<string,string>={...((options.headers as any)||{})};
 if(UNSAFE.includes(method)&&!('X-CSRF-Token' in headers)){
  const t=csrfToken();
  // Sin token, el backend respondera 403. No se intenta sortearlo.
  if(t)headers['X-CSRF-Token']=t;
 }
 const r=await fetch(API+path,{credentials:'include',...options,headers});
 if(!r.ok)throw new Error(await r.text());
 return r.json();
}
export const api={
 projects:()=>req('/projects'), project:(id:number)=>req(`/projects/${id}`),
 // Alta de proyecto en blanco: sin Excel y sin plantilla. El usuario arma las
 // canciones, personas y marimbas manualmente dentro del proyecto.
 createProject:(payload:{name:string;description?:string})=>req('/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),
 renameProject:(id:number,name:string)=>req(`/projects/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})}),
 deleteProject:(id:number)=>req(`/projects/${id}`,{method:'DELETE'}), people:()=>req('/people'),
 renamePerson:(id:number,name:string)=>req(`/people/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})}),
 // Explicit scopes, mirroring the backend contract:
 //  - 'composition': only drops the visual representation from the project's compositions.
 //  - 'project': also removes the SongAssignment rows inside this project's songs.
 // Neither one ever deletes the global catalog row.
 removePersonFromProject:(id:number,projectId:number,scope:'composition'|'project')=>req(`/people/${id}?project_id=${projectId}&scope=${scope}`,{method:'DELETE'}),
 positions:()=>req('/positions'), templates:()=>req('/marimba-templates'),
 deleteTemplate:(id:number)=>req(`/marimba-templates/${id}`,{method:'DELETE'}),
 updateTemplate:(id:number,payload:{name?:string;description?:string;positions?:string[]})=>req(`/marimba-templates/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),
 createTemplate:(payload:{name:string;description?:string;positions:string[]})=>req('/marimba-templates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),
 createPerson:(name:string,projectId?:number)=>req('/people',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,project_id:projectId??null})}),
 preview:(file:File)=>{const f=new FormData();f.append('file',file);return req('/imports/preview',{method:'POST',body:f})},
 confirm:(payload:any)=>req('/imports/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),
 createComposition:(payload:any)=>req('/compositions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),
 updateComposition:(id:number,payload:any)=>req(`/compositions/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),
 renameComposition:(id:number,name:string)=>req(`/compositions/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})}),
 // 7B.3: leer UNA composicion guardada (la usa la exportacion masiva, que
 // necesita el contenido persistido de cada una, no el estado del lienzo).
 // --- Fase 7C: autenticacion y administracion ---
 // La sesion viaja en cookie HttpOnly: el token NUNCA se guarda en
 // localStorage ni sessionStorage. Solo el token anti-CSRF, que por si solo no
 // sirve para autenticarse, se lee de la cookie legible.
 login:(email:string,password:string)=>req('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})}),
 logout:()=>req('/auth/logout',{method:'POST'}),
 me:()=>req('/auth/me'),
 forgotPassword:(email:string)=>req('/auth/forgot-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})}),
 resetPassword:(token:string,new_password:string)=>req('/auth/reset-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,new_password})}),
 changePassword:(current_password:string,new_password:string)=>req('/auth/change-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({current_password,new_password})}),
 // Administracion: el backend comprueba el rol; la UI solo la oculta.
 adminUsers:(q:string='')=>req('/admin/users'+(q?`?q=${encodeURIComponent(q)}`:'')),
 adminCreateUser:(p:{name:string;email:string;password:string})=>req('/admin/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)}),
 adminSetActive:(id:number,active:boolean)=>req(`/admin/users/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({active})}),
 adminSendReset:(id:number)=>req(`/admin/users/${id}/send-reset`,{method:'POST'}),
 // --- Fase 7D: colaboracion y auditoria ---
 // Solo el propietario puede compartir: el backend lo comprueba igual que la
 // interfaz. Estos endpoints nunca devuelven contrasenas ni hashes.
 projectAccess:(pid:number)=>req(`/projects/${pid}/access`),
 collaborators:(pid:number)=>req(`/projects/${pid}/collaborators`),
 addCollaborator:(pid:number,payload:{email:string;role:'editor'|'reader'})=>req(`/projects/${pid}/collaborators`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),
 changeCollaboratorRole:(pid:number,userId:number,role:'editor'|'reader')=>req(`/projects/${pid}/collaborators/${userId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({role})}),
 removeCollaborator:(pid:number,userId:number)=>req(`/projects/${pid}/collaborators/${userId}`,{method:'DELETE'}),
 auditLog:(pid:number,limit=100,offset=0)=>req(`/projects/${pid}/audit-log?limit=${limit}&offset=${offset}`),
 // Fase 7B.3: leer UNA composicion guardada (la usa la exportacion masiva, que
 // necesita el contenido persistido de cada una, no el estado del lienzo).
 composition:(id:number)=>req(`/compositions/${id}`),
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
 applySuggestions:(songId:number,payload:{proposals:any[];name?:string;marimba_plan?:{name:string;positions:string[]}[]})=>req(`/songs/${songId}/suggestions/apply`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),
 // Fase 7A: propone personas para los puestos de la composicion YA COLOCADA.
 // No crea marimbas ni persiste nada: es una previsualizacion.
 proposeOnComposition:(songId:number)=>req(`/songs/${songId}/propose-on-composition`,{method:'POST'}),
 // Acepta la propuesta: cambia solo asignaciones y guarda una composicion nueva.
 applyAssignments:(compositionId:number,payload:{assignments:{slot_id:string;person_id:number|null}[];name?:string})=>req(`/compositions/${compositionId}/apply-assignments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),
  // --- Fase 9C: historial PERSISTENTE de versiones ---
  // A diferencia del undo/redo del navegador, esto sobrevive a recargar.
  compositionVersions:(cid:number)=>req(`/compositions/${cid}/versions`),
  createCompositionVersion:(cid:number)=>req(`/compositions/${cid}/versions`,{method:'POST'}),
  restoreCompositionVersion:(cid:number,vid:number)=>req(`/compositions/${cid}/versions/${vid}/restore`,{method:'POST'}),
  // --- Fase 9E: enlace PUBLICO de solo lectura ---
  // El GET publico NO lleva sesion: el backend lo resuelve unicamente con el
  // token. Los otros tres son de administracion y el backend exige ademas ser
  // el PROPIETARIO (aqui solo se refleja esa decision, no la impone).
  publicComposition:(token:string)=>req(`/public/compositions/${encodeURIComponent(token)}`),
  publicLink:(cid:number)=>req(`/compositions/${cid}/public-link`),
  createPublicLink:(cid:number,expires_at?:string|null)=>req(`/compositions/${cid}/public-link`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(expires_at?{expires_at}:{})}),
  revokePublicLink:(cid:number)=>req(`/compositions/${cid}/public-link`,{method:'DELETE'}),
  // --- Fase 9I: listado AGREGADO de enlaces del propietario ---
  // Auditoria de solo lectura: el backend filtra por PROPIEDAD en la consulta
  // y no devuelve token, huella ni ids internos (el token no es recuperable).
  publicLinksList:()=>req('/public-links'),
};
