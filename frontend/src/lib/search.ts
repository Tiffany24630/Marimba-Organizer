/**
 * Fase 7B.2 - busqueda de trabajos.
 *
 * El dashboard ya carga la lista completa de proyectos de una vez (no hay
 * paginacion en la API), asi que el filtrado se hace en el cliente: es
 * instantaneo y no anade peticiones ni cambia el formato de los datos.
 * Cuando exista paginacion, esta funcion sigue siendo util como filtro local
 * y habra que combinarla con la consulta del servidor.
 */
export type ProjectLike={id:number;name:string;source_filename?:string|null};

export function normalizeQuery(raw:string):string{
 return raw.trim().toLocaleLowerCase();
}

/** Coincidencia parcial, sin distinguir mayusculas ni acentos. */
export function matchesProject(p:ProjectLike,q:string):boolean{
 const n=normalizeQuery(q);
 if(!n)return true;
 const name=(p.name||'').toLocaleLowerCase();
 const file=(p.source_filename||'').toLocaleLowerCase();
 return name.includes(n)||file.includes(n);
}

export function filterProjects<T extends ProjectLike>(list:T[],q:string):T[]{
 return list.filter(p=>matchesProject(p,q));
}

/** Quita acentos para que "concierto" encuentre "concierto" y "Concierto". */
export function fold(s:string):string{
 return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
}
