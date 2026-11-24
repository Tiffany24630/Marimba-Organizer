/**
 * Fase 9D - vista de ensayo / impresion.
 *
 * Se comprueba el flujo real: abrir la vista, ver la informacion, detectar
 * vacantes y personas sueltas, e imprimir.
 *
 * Tambien se comprueban las tres negated que dan valor a esta fase:
 *  - la vista NO expone controles de edicion;
 *  - imprimir invoca `window.print()` (interceptado; no se abre el dialogo);
 *  - abrir e imprimir NO modifica la composicion guardada.
 */
import {test,expect,type Page} from '@playwright/test';
import {entrar,escribir,CORREOS,unico} from './helpers';

async function escena(page:Page){
 const nombre=unico('Ensayo 9D');
 // La sesion va PRIMERO: `escribir` lee la cookie anti-CSRF del documento, y en
 // `about:blank` el navegador deniega el acceso a `document.cookie`.
 await entrar(page,CORREOS.dueno);
 const pr=await escribir(page,'POST','/projects',{name:nombre});
 const pid=(pr.cuerpo as {id:number}).id;
 const sg=await escribir(page,'POST',`/projects/${pid}/songs`,{name:'Luna de Xelaju'});
 const sid=(sg.cuerpo as {id:number}).id;
 // Dos marimbas; la primera tiene un puesto ocupado y otro VACANTE.
 // Ana esta sentada; Beto se queda sin asignar a proposito.
 const cp=await escribir(page,'POST','/compositions',{
  project_id:pid,song_id:sid,name:'Composicion de ensayo',
  width:1600,height:900,
  data:{elements:[
   {id:'m1',type:'marimba',name:'Marimba Grande',x:100,y:100,width:900,height:150,
    positions:[{id:'p1',type:'Primera',personId:101},
               {id:'p2',type:'Bajo',personId:null}]},
   {id:'m2',type:'marimba',name:'Marimba Tenor',x:100,y:400,width:900,height:150,
    positions:[{id:'p3',type:'Centro',personId:null}]},
   {id:'e1',type:'person',name:'Ana Ruiz',personId:101,positionType:'Primera',
    x:150,y:120,width:150,height:44,rotation:0,scaleX:1,scaleY:1,
    marimbaId:'m1',marimbaPositionId:'p1'},
   {id:'e2',type:'person',name:'Beto Soto',personId:102,positionType:'Bajo',
    x:150,y:430,width:150,height:44,rotation:0,scaleX:1,scaleY:1,
    marimbaId:null,marimbaPositionId:null},
  ]},
 });
 expect(cp.status,'crear composicion').toBe(200);
 const cid=(cp.cuerpo as {id:number}).id;

 // El proyecto se creo DESPUES de cargar el dashboard: hay que recargar para
 // que la lista lo muestre.
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('button.project-open',{hasText:nombre}).first().click();
 await page.getByRole('button',{name:'Abrir editor'}).first().click();
 await page.locator('.canvas-panel').waitFor({state:'visible',timeout:30_000});
 return {pid,cid};
}

/** Abre la vista de ensayo por la interfaz real: panel «Paneles» → botón. */
async function abrirEnsayo(page:Page){
 const panel=page.getByRole('tab',{name:'Paneles'});
 if(await panel.count())await panel.click();
 await page.getByRole('button',{name:'Vista de ensayo'}).click();
 const v=page.locator('.rehearsal');
 await expect(v,'la vista se abre').toBeVisible({timeout:20_000});
 return v;
}

test.describe('Vista de ensayo / impresion',()=>{
 test('muestra la distribucion, los vacantes y las personas sin asignar',
      async({page})=>{
  await escena(page);

  const v=await abrirEnsayo(page);

  // Encabezado: composicion y cancion.
  await expect(v.getByRole('heading',{name:'Composicion de ensayo'})).toBeVisible();
  await expect(v.getByText('Luna de Xelaju')).toBeVisible();
  await expect(v.getByText('Vista de ensayo')).toBeVisible();

  // Marimbas y puestos.
  await expect(v.getByRole('heading',{name:'Marimba Grande'})).toBeVisible();
  await expect(v.getByRole('heading',{name:'Marimba Tenor'})).toBeVisible();
  await expect(v.getByRole('rowheader',{name:/Primera/})).toBeVisible();
  await expect(v.getByRole('rowheader',{name:/Bajo/})).toBeVisible();

  // La persona asignada aparece CON SU NOMBRE.
  await expect(v.getByText('Ana Ruiz')).toBeVisible();

  // Los puestos vacios se muestran COMO VACANTES, no se esconden.
  // `exact` es necesario: el resumen de arriba dice "2 vacantes" y sin `exact`
  // ese texto tambien contaria como un vacante mas.
  await expect(v.getByText('Vacante',{exact:true})).toHaveCount(2);

  // Y las personas sin asignar van en su propia seccion.
  const sueltas=v.locator('.rh-unassigned');
  await expect(sueltas).toBeVisible();
  await expect(sueltas.getByText('Beto Soto')).toBeVisible();

  // El resumen cuadra: 3 puestos, 1 ocupado, 2 vacantes.
  await expect(v.getByText(/1 de 3 puestos ocupados/)).toBeVisible();
  await expect(v.getByText(/2 vacantes/)).toBeVisible();
  });

 test('no ofrece ningun control de edicion',async({page})=>{
  await escena(page);
  const v=await abrirEnsayo(page);

  // Ni campos, ni areas de texto, ni canvas dentro de la vista.
  await expect(v.locator('input,select,textarea')).toHaveCount(0);
  await expect(v.locator('canvas')).toHaveCount(0);
  // Los unicos botones son Volver e Imprimir.
  const botones=v.getByRole('button');
  await expect(botones).toHaveCount(2);
  await expect(v.getByRole('button',{name:'Imprimir'})).toBeVisible();
  await expect(v.getByRole('button',{name:'Volver al editor'})).toBeVisible();
 });

 test('imprimir invoca window.print() sin modificar la composicion',
      async({page})=>{
  const {cid}=await escena(page);

  // Estado guardado ANTES de abrir e imprimir.
  const antes=await escribir(page,'GET',`/compositions/${cid}`);
  const guardadoAntes=(antes.cuerpo as {data:unknown}).data;

  const v=await abrirEnsayo(page);

  // Se sustituye `window.print` DESDE la pagina ya cargada: no se abre el
  // dialogo nativo. No se usa `addInitScript` a proposito, porque obligaria a
  // recargar y eso sacaria de la vista de ensayo.
  await page.evaluate(()=>{
   const w=window as unknown as {__imprimido:boolean};
   w.__imprimido=false;
   window.print=()=>{w.__imprimido=true;};
  });

  await v.getByRole('button',{name:'Imprimir'}).click();
  await expect
   .poll(async()=>page.evaluate(
    ()=>(window as unknown as {__imprimido:boolean}).__imprimido),
   {timeout:10_000})
   .toBe(true);

  // Y la composicion guardada sigue EXACTAMENTE igual.
  const despues=await escribir(page,'GET',`/compositions/${cid}`);
  expect((despues.cuerpo as {data:unknown}).data).toEqual(guardadoAntes);
 });
});