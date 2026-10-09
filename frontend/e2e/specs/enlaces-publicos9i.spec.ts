import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {entrar,abrirComo,escribir,leer,unico,WEB,CORREOS,
        aislarRateLimitE2E} from './helpers';

aislarRateLimitE2E();

/** Proyecto + cancion del dueno (base de la escena 9I). */
async function proyecto(page:Page){
  const nombre=unico('Enlaces 9I');
  await entrar(page,CORREOS.dueno);
  const pr=await escribir(page,'POST','/projects',{name:nombre});
  expect(pr.status,'crear proyecto').toBe(200);
  const pid=(pr.cuerpo as {id:number}).id;
  const sg=await escribir(page,'POST',`/projects/${pid}/songs`,{name:'Luna'});
  expect(sg.status,'crear cancion').toBe(200);
  const sid=(sg.cuerpo as {id:number}).id;
  return {pid,sid,nombre};
}

/** Composicion dentro del proyecto base. */
async function composicion(page:Page,pid:number,sid:number,nombre:string){
  const cp=await escribir(page,'POST','/compositions',{
    project_id:pid,song_id:sid,name:nombre,width:1600,height:900,
    data:{elements:[]},
  });
  expect(cp.status,'crear composicion').toBe(200);
  return (cp.cuerpo as {id:number}).id;
}

/** Enlace por API (la misma ruta que usa el panel individual). */
async function enlace(page:Page,cid:number,expires_at?:string){
  const r=await escribir(page,'POST',`/compositions/${cid}/public-link`,
                        expires_at?{expires_at}:{});
  expect(r.status,'crear enlace').toBe(200);
  return (r.cuerpo as {token:string}).token;
}

/** Abre el panel de proyectos y despliega el listado 9I. */
async function abrirListado(page:Page){
  await page.goto(WEB,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Ver mis enlaces'})
    .click({timeout:30_000});
}

test.describe('Listado agregado de enlaces del propietario (9I)',()=>{

  test('distingue activa, expirada y revocada, con «Sin caducidad»',
       async({page})=>{
    const {pid,sid,nombre}=await proyecto(page);
    // Nombres unicos por ejecucion: el listado es agregado y conserva filas
    // de ejecuciones anteriores; con nombres fijos el filtro matchearia
    // varias filas y Playwright fallaria en strict mode.
    const tag=unico('9I');
    const nA=`Comp Activa ${tag}`;
    const nB=`Comp Expirada ${tag}`;
    const nC=`Comp Revocada ${tag}`;
    const cA=await composicion(page,pid,sid,nA);
    const cB=await composicion(page,pid,sid,nB);
    const cC=await composicion(page,pid,sid,nC);
    await enlace(page,cA);
    // Expiracion: se crea con caducidad de 2s y se espera como en 9G.
    await enlace(page,cB,new Date(Date.now()+2000).toISOString());
    await enlace(page,cC);
    const del=await escribir(page,'DELETE',`/compositions/${cC}/public-link`);
    expect(del.status,'revocar').toBe(200);
    await expect.poll(async()=>{
      const r=await leer(page,`/compositions/${cB}/public-link`);
      if(r.status!==200)return false;
      try{
        return (JSON.parse(r.cuerpo) as {expired:boolean}).expired===true;
      }catch{return false;}
    },{timeout:20_000}).toBe(true);

    await abrirListado(page);
    const tabla=page.getByRole('table');
    await expect(tabla,'el listado se despliega').toBeVisible({timeout:30_000});

    // Columnas de auditoria (9I §7).
    for(const h of ['Proyecto','Composición','Estado','Creado','Caducidad'])
      await expect(page.getByRole('columnheader',{name:h})).toBeVisible();

    // Las tres composiciones, cada una con SU estado en su fila.
    await expect(tabla).toContainText(nombre);
    await expect(page.getByRole('row')
      .filter({hasText:nA})
      .getByText('Activa',{exact:true})).toBeVisible();
    await expect(page.getByRole('row')
      .filter({hasText:nB})
      .getByText('Expirada',{exact:true})).toBeVisible();
    await expect(page.getByRole('row')
      .filter({hasText:nC})
      .getByText('Revocada',{exact:true})).toBeVisible();

    // Sin caducidad solo en la fila activa que no la tiene (9G).
    await expect(page.getByRole('row').filter({hasText:nA})
      .getByText('Sin caducidad')).toBeVisible();
    await expect(page.getByRole('row').filter({hasText:nB})
      .getByText('Sin caducidad')).toHaveCount(0);
  });

  test('la seccion de enlaces no tiene infracciones axe',async({page})=>{
    // Escena minima propia: el analisis axe corre sobre la seccion nueva
    // (`.include`, patron de dialogos.spec.ts), sin desactivar reglas.
    // `test.slow()` triplica el timeout: axe inyecta y recorre el DOM.
    test.slow();
    const {pid,sid}=await proyecto(page);
    const cid=await composicion(page,pid,sid,`Comp Axe ${unico('9I')}`);
    await enlace(page,cid);
    await abrirListado(page);
    const tabla=page.getByRole('table');
    await expect(tabla,'el listado se despliega').toBeVisible({timeout:30_000});
    const res=await new AxeBuilder({page}).include('.dash-public-links')
      .analyze();
    expect(res.violations,'axe vista de listado 9I').toEqual([]);
  });

  test('el editor no ve los enlaces publicados por el dueno',
       async({page,browser})=>{
    const {pid,sid,nombre}=await proyecto(page);
    const cid=await composicion(page,pid,sid,`Comp Aislamiento ${unico('9I')}`);
    await enlace(page,cid);
    const {ctx,page:otra}=await abrirComo(browser,CORREOS.editor);
    await otra.goto(WEB,{waitUntil:'domcontentloaded'});
    await otra.getByRole('button',{name:'Ver mis enlaces'})
      .click({timeout:30_000});
    // El proyecto del dueno NO aparece jamas en la sesion del editor.
    await expect(otra.getByText(nombre,{exact:true}),
                 'el aislamiento es del backend').toHaveCount(0);
    await expect(otra.getByRole('button',{name:'Ocultar listado'}))
      .toBeVisible();
    await ctx.close();
  });

  test('quien no tiene enlaces ve el estado vacio explicito',async({page})=>{
    await entrar(page,CORREOS.intruso);
    await abrirListado(page);
    await expect(page.getByText('No tienes enlaces públicos.'))
      .toBeVisible({timeout:30_000});
    // Vacio NO es «cargando»: el anuncio de carga no esta presente.
    await expect(page.getByRole('status')).toHaveCount(0);
  });
});
