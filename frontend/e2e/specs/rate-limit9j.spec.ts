/**
 * Fase 9J - rate-limit del acceso publico por token.
 *
 * Determinista y sin esperas largas: la politica se configura por entorno
 * (`PUBLIC_LINK_RATE_LIMIT` / `PUBLIC_LINK_RATE_WINDOW_S`; en `marimba7f`
 * el compose E2E fija 10 req / 60 s). Aqui se reproduce el 429 con N+1
 * peticiones rapidas al MISMO enlace valido, se comprueba el mensaje 429
 * accesible en la vista publica, y la regresion 9E/9G/9I corre aparte.
 */
import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {entrar,escribir,unico,WEB,CORREOS,aislarRateLimitE2E} from './helpers';

aislarRateLimitE2E();

/** Enlace valido creado por el dueno; devuelve URL publica y token. */
async function enlaceValido(page:Page){
  await entrar(page,CORREOS.dueno);
  const nombre=unico('Limite 9J');
  const pr=await escribir(page,'POST','/projects',{name:nombre});
  expect(pr.status,'crear proyecto').toBe(200);
  const pid=(pr.cuerpo as {id:number}).id;
  const sg=await escribir(page,'POST',`/projects/${pid}/songs`,{name:'Luna'});
  const sid=(sg.cuerpo as {id:number}).id;
  const cp=await escribir(page,'POST','/compositions',{
    project_id:pid,song_id:sid,name:'Comp Limite 9J',width:1600,height:900,
    // Contenido minimo para que la vista renderice el banner «Solo lectura».
    data:{elements:[
      {id:'m1',type:'marimba',name:'Marimba Grande',x:100,y:100,width:900,
       height:150,positions:[{id:'p1',type:'Primera',personId:101}]},
      {id:'e1',type:'person',name:'Ana Ruiz',personId:101,
       positionType:'Primera',x:150,y:120,width:150,height:44,rotation:0,
       scaleX:1,scaleY:1,marimbaId:'m1',marimbaPositionId:'p1'},
    ]},
  });
  expect(cp.status,'crear composicion').toBe(200);
  const cid=(cp.cuerpo as {id:number}).id;
  const lk=await escribir(page,'POST',`/compositions/${cid}/public-link`,{});
  expect(lk.status,'crear enlace').toBe(200);
  const token=(lk.cuerpo as {token:string}).token;
  return {url:`${WEB}/public/compositions/${token}`,token};
}

/** GET crudo contra la API (sin sesion): devuelve status + Retry-After. */
async function getCrudo(page:Page,token:string){
  return page.evaluate(async(d)=>{
    const r=await fetch(`${d.api}/public/compositions/${d.token}`);
    return {status:r.status,retry:r.headers.get('retry-after'),
            cuerpo:await r.text()};
  },{api:'http://localhost:18000/api',token});
}

test.describe('Rate-limit del acceso publico (9J)',()=>{

  test('enlace valido funciona y el exceso responde 429 con Retry-After',async({page})=>{
    const {token}=await enlaceValido(page);
    // Dentro del limite: 200 normal (semantica 9E intacta).
    const primero=await getCrudo(page,token);
    expect(primero.status,'dentro del limite').toBe(200);
    // Exceso: politica E2E pequena (ver compose) -> 429 rapido y determinista.
    let visto429=false;
    let retry:string|null=null;
    for(let i=0;i<40 && !visto429;i++){
      const r=await getCrudo(page,token);
      if(r.status===429){visto429=true;retry=r.retry;}
      else expect(r.status,'antes del limite solo 200').toBe(200);
    }
    expect(visto429,'el exceso responde 429').toBe(true);
    expect(retry,'Retry-After presente').not.toBeNull();
    expect(Number(retry),'Retry-After valido') .toBeGreaterThan(0);
  });

  test('la vista publica muestra el aviso 429 y pasa axe',async({browser})=>{
    const ctx=await browser.newContext();
    const page=await ctx.newPage();
    const {url,token}=await enlaceValido(page);
    // Este escenario debe provocar su propio 429; no depende del estado
    // dejado por el escenario anterior.
    for(let i=0;i<10;i++){
      const r=await getCrudo(page,token);
      expect(r.status,'dentro del limite').toBe(200);
    }
    await page.goto(url,{waitUntil:'load',timeout:5000});
    const aviso=page.getByRole('heading',{name:'Demasiadas solicitudes'});
    await expect(aviso).toBeVisible();
    await expect(page.getByText('Inténtalo de nuevo en unos momentos'))
      .toBeVisible();
    await expect(page.getByText('Comp Limite 9J')).toHaveCount(0);
    const res=await new AxeBuilder({page}).include('.pub-error').analyze();
    expect(res.violations,'axe aviso 429').toEqual([]);
  });
});
