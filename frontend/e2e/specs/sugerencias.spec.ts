import {test,expect,type Page} from '@playwright/test';
import {entrar,escribir,leer,CORREOS,unico} from './helpers';

async function preparar(page:Page){
  await entrar(page,CORREOS.dueno);
  const nombre=unico('Sugerencias');
  const importado=await escribir(page,'POST','/imports/confirm',{
    project_name:nombre,
    sheets:[{name:'Hoja1',songs:[{name:'Cancion propuesta',assignments:[
      {person:'Ana propuesta',position:'Primera',mark:'X'},
    ]}]}],
  });
  expect(importado.status,'la importacion de prueba debe crear datos').toBe(200);
  const proyectoId=(importado.cuerpo as {id:number}).id;
  expect(proyectoId).toBeTruthy();
  const detalle=await leer(page,`/projects/${proyectoId}`);
  expect(detalle.status).toBe(200);
  const cancion=(JSON.parse(detalle.cuerpo) as any).songs[0];
  const comp=await escribir(page,'POST','/compositions',{
    project_id:proyectoId,
    song_id:cancion.id,
    name:'Lienzo original',width:1200,height:700,
    data:{elements:[
      {id:'m1',type:'marimba',name:'Marimba propuesta',x:80,y:80,
       width:380,height:150,rotation:0,scaleX:1,scaleY:1,locked:false,
       positions:[{id:'slot-1',type:'Primera',personId:null}]},
    ]},
  });
  expect(comp.status,'crear lienzo').toBe(200);
  // El import crea el proyecto con el nombre derivado de la carga; se renombra
  // para que el selector de proyecto sea inequívoco en el navegador.
  await page.reload({waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:new RegExp(nombre)}).first().click();
  await page.getByRole('button',{name:'Abrir editor'}).first().click();
  await page.locator('.canvas-panel').waitFor({state:'visible',timeout:30_000});
  const panel=page.getByRole('tab',{name:'Paneles'});
  if(await panel.count())await panel.click();
  return {proyectoId};
}

test.describe('Previsualizacion de sugerencias',()=>{
  test('cancelar descarta la propuesta y no crea una composicion',async({page})=>{
    const {proyectoId}=await preparar(page);
    await page.getByRole('button',{name:'Proponer distribución'}).click();
    await expect(page.getByText(/cambios ·/)).toBeVisible({timeout:20_000});
    await page.getByRole('button',{name:'Cancelar'}).click();
    await expect(page.getByRole('button',{name:'Proponer distribución'})).toBeVisible();
    const proyecto=await leer(page,`/projects/${proyectoId}`);
    expect(proyecto.status).toBe(200);
    const composiciones=(JSON.parse(proyecto.cuerpo) as any).compositions;
    expect(composiciones.filter((c:any)=>String(c.name).includes('propuesta'))).toHaveLength(0);
  });

  test('aplicar confirma los cambios y crea la composicion propuesta',async({page})=>{
    const {proyectoId}=await preparar(page);
    await page.getByRole('button',{name:'Proponer distribución'}).click();
    await expect(page.getByText(/cambios ·/)).toBeVisible({timeout:20_000});
    await page.getByRole('button',{name:/Aplicar 1 cambios/}).click();
    await expect(page.getByRole('button',{name:'Proponer distribución'})).toBeVisible({timeout:20_000});
    const proyecto=await leer(page,`/projects/${proyectoId}`);
    expect(proyecto.status).toBe(200);
    const composiciones=(JSON.parse(proyecto.cuerpo) as any).compositions;
    expect(composiciones.some((c:any)=>String(c.name).includes('propuesta'))).toBe(true);
  });
});
