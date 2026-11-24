import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {entrar,escribir,leer,unico,WEB,aislarRateLimitE2E} from './helpers';

aislarRateLimitE2E();

/** Proyecto + cancion + composicion, igual que en 9E. */
async function escena(page:Page){
  const nombre=unico('Caducidad 9G');
  await entrar(page,'despliegue7f-a@prueba.local');
  const pr=await escribir(page,'POST','/projects',{name:nombre});
  const pid=(pr.cuerpo as {id:number}).id;
  const sg=await escribir(page,'POST',`/projects/${pid}/songs`,{name:'Luna'});
  const sid=(sg.cuerpo as {id:number}).id;
  const cp=await escribir(page,'POST','/compositions',{
    project_id:pid,song_id:sid,name:'Composicion con caducidad 9G',
    width:1600,height:900,
    data:{elements:[
      {id:'m1',type:'marimba',name:'Marimba Grande',x:100,y:100,
       width:900,height:150,
       positions:[{id:'p1',type:'Primera',personId:101},
                  {id:'p2',type:'Bajo',personId:null}]},
      {id:'e1',type:'person',name:'Ana Ruiz',personId:101,
       positionType:'Primera',x:150,y:120,width:150,height:44,
       rotation:0,scaleX:1,scaleY:1,marimbaId:'m1',marimbaPositionId:'p1'},
    ]},
  });
  expect(cp.status,'crear composicion').toBe(200);
  const cid=(cp.cuerpo as {id:number}).id;
  return {pid,cid,nombre};
}

/** Crea el enlace por API (el panel usa la misma ruta). */
async function crearEnlace(page:Page,cid:number,expires_at?:string){
  const r=await escribir(page,'POST',`/compositions/${cid}/public-link`,
                         expires_at?{expires_at}:{});
  expect(r.status,'crear enlace').toBe(200);
  const token=(r.cuerpo as {token:string}).token;
  expect(token.length).toBeGreaterThan(10);
  return token;
}

test.describe('Caducidad opcional del enlace publico (9G)',()=>{

  test('sin expiracion: la pagina publica funciona (9E intacto)',
       async({page,browser})=>{
    const {cid}=await escena(page);
    const token=await crearEnlace(page,cid);
    const ctx=await browser.newContext();
    const p=await ctx.newPage();
    await p.goto(`${WEB}/public/compositions/${token}`,
                 {waitUntil:'domcontentloaded'});
    await expect(p.getByRole('heading',{name:'Composicion con caducidad 9G'}))
      .toBeVisible({timeout:20_000});
    await ctx.close();
  });

  test('expiracion futura: la pagina publica funciona',async({page,browser})=>{
    const {cid}=await escena(page);
    const futura=new Date(Date.now()+3600_000).toISOString();
    const token=await crearEnlace(page,cid,futura);
    const st=await escribir(page,'GET',`/compositions/${cid}/public-link`);
    expect(st.status).toBe(200);
    expect((st.cuerpo as {expires_at:string|null}).expires_at).not.toBe(null);
    const ctx=await browser.newContext();
    const p=await ctx.newPage();
    await p.goto(`${WEB}/public/compositions/${token}`,
                 {waitUntil:'domcontentloaded'});
    await expect(p.getByRole('heading',{name:'Composicion con caducidad 9G'}))
      .toBeVisible({timeout:20_000});
    const axe=new AxeBuilder({page:p});
    const res=await axe.analyze();
    expect(res.violations,'axe en pagina publica con caducidad').toEqual([]);
    await ctx.close();
  });

  test('expiracion alcanzada: 404 sin contenido',async({page,browser})=>{
    const {cid}=await escena(page);
    const casi=new Date(Date.now()+2000).toISOString();
    const token=await crearEnlace(page,cid,casi);
    const antes=await leer(page,`/public/compositions/${token}`);
    expect(antes.status,'recien creado aun vale').toBe(200);
    await expect.poll(
      async()=>(await leer(page,`/public/compositions/${token}`)).status,
      'tras expirar responde 404',{timeout:20_000}).toBe(404);
    const ctx=await browser.newContext();
    const p=await ctx.newPage();
    await p.goto(`${WEB}/public/compositions/${token}`,
                 {waitUntil:'domcontentloaded'});
    await expect(p.getByRole('heading',{name:'Este enlace no funciona'}))
      .toBeVisible({timeout:20_000});
    await expect(p.getByText('Composicion con caducidad 9G')).toHaveCount(0);
    await ctx.close();
  });

  test('revocacion sigue funcionando con caducidad de por medio',
       async({page,browser})=>{
    const {cid}=await escena(page);
    const futura=new Date(Date.now()+3600_000).toISOString();
    const viejo=await crearEnlace(page,cid,futura);
    const del=await escribir(page,'DELETE',`/compositions/${cid}/public-link`);
    expect(del.status,'revocar').toBe(200);
    const muerto=await leer(page,`/public/compositions/${viejo}`);
    expect(muerto.status,'el token anterior muere').toBe(404);
    const nuevo=await crearEnlace(page,cid);
    expect(nuevo).not.toBe(viejo);
    const ctx=await browser.newContext();
    const p=await ctx.newPage();
    await p.goto(`${WEB}/public/compositions/${nuevo}`,
                 {waitUntil:'domcontentloaded'});
    await expect(p.getByRole('heading',{name:'Composicion con caducidad 9G'}))
      .toBeVisible({timeout:20_000});
    await ctx.close();
  });
});
