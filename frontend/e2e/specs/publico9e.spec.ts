/**
 * Fase 9E - enlace PUBLICO de solo lectura.
 *
 * Flujo real completo: el propietario crea el enlace desde el panel lateral,
 * alguien SIN sesion abre la URL, y la pagina muestra la composicion en modo
 * consulta sin ningun control de edicion. Despues se revoca y el mismo enlace
 * deja de servir.
 *
 * Negados que dan valor a la fase:
 *  - la pagina publica NO pide sesion ni muestra la barra de sesion;
 *  - NO hay controles de edicion (ni siquiera "Volver al editor");
 *  - editor y lector NO ven el panel, y el backend les devuelve 404;
 *  - tras revocar, la URL antigua responde como cualquier token inexistente.
 */
import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {entrar,escribir,leer,compartir,CORREOS,unico,WEB,
        aislarRateLimitE2E} from './helpers';

aislarRateLimitE2E();

/** Proyecto + cancion + composicion, igual que en 9D. */
async function escena(page:Page){
 const nombre=unico('Enlace 9E');
 // La sesion PRIMERO: `escribir` lee la cookie anti-CSRF del documento.
 await entrar(page,CORREOS.dueno);
 const pr=await escribir(page,'POST','/projects',{name:nombre});
 const pid=(pr.cuerpo as {id:number}).id;
 const sg=await escribir(page,'POST',`/projects/${pid}/songs`,{name:'Luna de Xelaju'});
 const sid=(sg.cuerpo as {id:number}).id;
 const cp=await escribir(page,'POST','/compositions',{
  project_id:pid,song_id:sid,name:'Composicion compartida 9E',
  width:1600,height:900,
  data:{elements:[
   {id:'m1',type:'marimba',name:'Marimba Grande',x:100,y:100,width:900,height:150,
    positions:[{id:'p1',type:'Primera',personId:101},
               {id:'p2',type:'Bajo',personId:null}]},
   {id:'e1',type:'person',name:'Ana Ruiz',personId:101,positionType:'Primera',
    x:150,y:120,width:150,height:44,rotation:0,scaleX:1,scaleY:1,
    marimbaId:'m1',marimbaPositionId:'p1'},
  ]},
 });
 expect(cp.status,'crear composicion').toBe(200);
 const cid=(cp.cuerpo as {id:number}).id;

 // El proyecto se creo DESPUES de cargar el dashboard: hay que recargar.
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('button.project-open',{hasText:nombre}).first().click();
 await page.getByRole('button',{name:'Abrir editor'}).first().click();
 await page.locator('.canvas-panel').waitFor({state:'visible',timeout:30_000});
 return {pid,cid,nombre};
}

/** Panel «Paneles» → la seccion «Enlace publico» debe estar visible. */
async function abrirPanelEnlace(page:Page){
 const panel=page.getByRole('tab',{name:'Paneles'});
 if(await panel.count())await panel.click();
 await expect(page.locator('.link-panel'),
              'la seccion del enlace existe para el propietario')
   .toBeVisible({timeout:20_000});
}

/** Crea el enlace y devuelve la URL mostrada en el panel. */
async function crearEnlace(page:Page){
 await abrirPanelEnlace(page);
 await page.getByRole('button',{name:'Crear enlace publico'}).click();
 const campo=page.locator('#public-link-url');
 await expect(campo,'la URL se muestra al crearla').toBeVisible({timeout:15_000});
 return await campo.inputValue();
}

test.describe('Enlace publico de solo lectura (9E)',()=>{

 test('el propietario crea el enlace y alguien sin sesion lo consulta',
      async({page,browser})=>{
  const {cid}=await escena(page);
  const url=await crearEnlace(page);
  expect(url,'la URL apunta a la ruta publica')
   .toContain('/public/compositions/');
  expect(url.length).toBeGreaterThan('/public/compositions/'.length);

  // Contexto NUEVO: sin ninguna cookie, como un visitante cualquiera.
  const ctx=await browser.newContext();
  const p2=await ctx.newPage();
  await p2.goto(url,{waitUntil:'domcontentloaded'});

  // Se ve la composicion, en modo consulta.
  await expect(p2.getByRole('heading',
    {name:'Composicion compartida 9E'})).toBeVisible({timeout:20_000});
  await expect(p2.getByText('Composición compartida')).toBeVisible();
  await expect(p2.getByText('Luna de Xelaju')).toBeVisible();
  await expect(p2.getByRole('heading',{name:'Marimba Grande'})).toBeVisible();
  await expect(p2.getByText('Ana Ruiz')).toBeVisible();
  await expect(p2.getByText('Vacante',{exact:true})).toBeVisible();

  // Sin sesion de la app: ni barra de sesion ni cookie de acceso.
  await expect(p2.getByRole('button',{name:'Cerrar sesión'})).toHaveCount(0);
  const cookies=await ctx.cookies();
  expect(cookies.some(c=>c.name==='marimba_session'),'sin cookie de sesion')
   .toBe(false);

  // Negado central: NINGUN control de edicion. El unico boton es Imprimir.
  await expect(p2.locator('input,select,textarea')).toHaveCount(0);
  await expect(p2.locator('canvas')).toHaveCount(0);
  await expect(p2.getByRole('button',{name:'Volver al editor'})).toHaveCount(0);
  await expect(p2.getByRole('button')).toHaveCount(1);
  await expect(p2.getByRole('button',{name:'Imprimir'})).toBeVisible();

  // axe en la pagina publica: cero infracciones, sin desactivar reglas.
  const r=await new AxeBuilder({page:p2}).analyze();
  expect(r.violations.map(v=>`${v.id} (${v.impact})`)).toEqual([]);

  // Abrir el enlace no toca lo guardado.
  const leido=await escribir(page,'GET',`/compositions/${cid}`);
  expect(leido.status).toBe(200);
  expect((leido.cuerpo as {name:string}).name)
   .toBe('Composicion compartida 9E');
  await ctx.close();
 });

 test('un token inexistente responde con el mismo mensaje uniforme',
      async({browser})=>{
  const ctx=await browser.newContext();
  const p=await ctx.newPage();
  await p.goto(`${WEB}/public/compositions/no-existe-9e`,
               {waitUntil:'domcontentloaded'});
  await expect(p.getByRole('heading',{name:'Este enlace no funciona'}))
   .toBeVisible({timeout:20_000});
  await expect(p.getByText(/no es valido, ha sido revocado/)).toBeVisible();
  // Nada de la composicion en el cuerpo del error.
  await expect(p.getByText('Composicion compartida 9E')).toHaveCount(0);
  await ctx.close();
 });

 test('revocar deja la URL antigua inutil y permite crear otra nueva',
      async({page,browser})=>{
  const {cid}=await escena(page);
  const urlVieja=await crearEnlace(page);
  const tokenViejo=urlVieja.split('/').pop()!;

  // Revocar pide confirmacion; se acepta desde el listener.
  page.on('dialog',d=>{void d.accept();});
  await page.getByRole('button',{name:'Revocar'}).click();
  await expect(page.getByText(/Revocado el/)).toBeVisible({timeout:15_000});
  await expect(page.getByRole('button',{name:'Crear enlace publico'}))
   .toBeVisible();

  // La URL antigua muere: misma respuesta que cualquier token invalido.
  const r=await leer(page,`/public/compositions/${tokenViejo}`);
  expect(r.status,'el backend responde 404').toBe(404);
  const ctx=await browser.newContext();
  const p2=await ctx.newPage();
  await p2.goto(urlVieja,{waitUntil:'domcontentloaded'});
  await expect(p2.getByRole('heading',{name:'Este enlace no funciona'}))
   .toBeVisible({timeout:20_000});
  await ctx.close();

  // Se crea OTRA: el token nuevo es distinto y el viejo no vuelve.
  const urlNueva=await crearEnlace(page);
  expect(urlNueva).not.toBe(urlVieja);
  const ctx3=await browser.newContext();
  const p3=await ctx3.newPage();
  await p3.goto(urlNueva,{waitUntil:'domcontentloaded'});
  await expect(p3.getByRole('heading',
    {name:'Composicion compartida 9E'})).toBeVisible({timeout:20_000});
  await ctx3.close();

  // Revocar no destruye la composicion ni su contenido.
  const ok=await escribir(page,'GET',`/compositions/${cid}`);
  expect(ok.status).toBe(200);
 });

 test('editor y lector no ven el panel y el backend les devuelve 404',
      async({page,browser})=>{
  const {pid,cid,nombre}=await escena(page);
  await compartir(page,pid,CORREOS.editor,'editor');
  await compartir(page,pid,CORREOS.lector,'reader');

  // Editor: la seccion no existe en su interfaz.
  const ed=await browser.newContext();
  const pe=await ed.newPage();
  await entrar(pe,CORREOS.editor);
  await pe.locator('button.project-open',{hasText:nombre}).first().click();
  await pe.getByRole('button',{name:'Abrir editor'}).first().click();
  await pe.locator('.canvas-panel').waitFor({state:'visible',timeout:30_000});
  const tab=pe.getByRole('tab',{name:'Paneles'});
  if(await tab.count())await tab.click();
  await expect(pe.locator('.link-panel')).toHaveCount(0);

  // Y el backend le cierra la puerta por igual (404, no 403: sin pistas).
  const post=await escribir(pe,'POST',`/compositions/${cid}/public-link`);
  expect(post.status,'editor no publica').toBe(404);
  await ed.close();

  // Lector: tampoco, ni siquiera puede ver el estado.
  const le=await browser.newContext();
  const pl=await le.newPage();
  await entrar(pl,CORREOS.lector);
  const postL=await escribir(pl,'POST',`/compositions/${cid}/public-link`);
  expect(postL.status,'lector no publica').toBe(404);
  const getL=await escribir(pl,'GET',`/compositions/${cid}/public-link`);
  expect(getL.status,'lector ni siquiera ve el estado').toBe(404);
  await le.close();
 });
});
