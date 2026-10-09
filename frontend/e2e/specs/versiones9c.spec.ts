/**
 * Fase 9C - historial PERSISTENTE de versiones de una composicion.
 *
 * El valor de esta funcionalidad es que el historial sobreviva a recargar. Por
 * eso la prueba RECARGA entre crear la version y consultarla: si el historial
 * viviera en el estado de React, desapareceria y la prueba fallaria.
 *
 * Se demuestra ademas que restaurar NO borra las versiones anteriores.
 */
import {test,expect,type Page} from '@playwright/test';
import {entrar,escribir,CORREOS,unico} from './helpers';

async function crearProyectoConComposicion(page: Page, nombre: string,
                                           etiqueta: string){
  const pr=await escribir(page,'POST','/projects',{name:nombre});
  const pid=(pr.cuerpo as {id:number}).id;
  const sg=await escribir(page,'POST',`/projects/${pid}/songs`,{name:'Cancion'});
  const sid=(sg.cuerpo as {id:number}).id;
  const el=etiqueta==='ORIGEN'
    ?{id:'m1',type:'marimba',name:'Marimba',x:100,y:100,width:900,height:150,
      positions:[{id:'s1',type:'Primera',personId:null}]}
    :{id:'m2',type:'marimba',name:'Cambiada',x:400,y:300,width:1200,height:150,
      positions:[{id:'s2',type:'Segunda',personId:null}]};
  const cp=await escribir(page,'POST','/compositions',{
    project_id:pid,song_id:sid,name:'Composicion 9C',
    width:1600,height:900,data:{elements:[el]},
  });
  expect(cp.status,'crear composicion').toBe(200);
  return {pid,cid:(cp.cuerpo as {id:number}).id};
}

test.describe('Historial persistente de versiones',()=>{
  test('guardar, restaurar y comprobar que el historial sobrevive a recargar',
       async({page})=>{
    await entrar(page,CORREOS.dueno);
    const {pid,cid}=await crearProyectoConComposicion(
      page,unico('Versiones 9C'),'ORIGEN');

    // --- Version 1: se crea por la API y se comprueba desde el servidor. ---
    const v1=await escribir(page,'POST',`/compositions/${cid}/versions`);
    expect(v1.status,'crear version 1').toBe(200);
    expect((v1.cuerpo as {version_number:number}).version_number).toBe(1);

    // --- Se cambia el estado guardado (como haria el boton Guardar). ---
    await escribir(page,'PUT',`/compositions/${cid}`,{
      project_id:pid,name:'Composicion 9C',song_id:null,width:1600,height:900,
      data:{elements:[{id:'m2',type:'marimba',name:'Cambiada',x:400,y:300,
            width:1200,height:150,
            positions:[{id:'s2',type:'Segunda',personId:null}]}]},
    });
    await escribir(page,'POST',`/compositions/${cid}/versions`);

    // --- RECARGA: el historial tiene que seguir ahí. ---
    await page.reload({waitUntil:'domcontentloaded'});
    const lista=await escribir(page,'GET',`/compositions/${cid}/versions`);
    const numeros=(lista.cuerpo as {versions:{version_number:number}[]})
      .versions.map(v=>v.version_number);
    expect(numeros,'tras recargar deben seguir las dos versiones')
      .toEqual([2,1]);

    // --- Restaurar la version 1 devuelve el estado ORIGINAL. ---
    const vs=(lista.cuerpo as {versions:{id:number;version_number:number}[]}).versions;
    const uno=vs.find(v=>v.version_number===1)!;
    const res=await escribir(page,'POST',
      `/compositions/${cid}/versions/${uno.id}/restore`);
    expect(res.status,'restaurar version 1').toBe(200);
    const cuerpo=res.cuerpo as {
      composition:{data:{elements:{id:string}[]}};
      restored_version:number;previous_state_saved_as:number};
    expect(cuerpo.restored_version).toBe(1);
    expect(cuerpo.composition.data.elements[0].id).toBe('m1');
    // El estado que se iba a perder quedo guardado: nada se destruye.
    expect(cuerpo.previous_state_saved_as).toBeGreaterThan(2);

    // --- Las versiones antiguas NO se han borrado. ---
    const despues=await escribir(page,'GET',`/compositions/${cid}/versions`);
    const quedan=(despues.cuerpo as {versions:{version_number:number}[]})
      .versions.map(v=>v.version_number);
    expect(quedan.sort()).toEqual([1,2,3]);
  });

  test('la interfaz muestra el historial y anuncia el resultado',
       async({page})=>{
    await entrar(page,CORREOS.dueno);
    const {cid}=await crearProyectoConComposicion(
      page,unico('Versiones UI 9C'),'ORIGEN');
    await escribir(page,'POST',`/compositions/${cid}/versions`);

    await page.goto(page.url());
    await entrar(page,CORREOS.dueno);
    // Se abre el proyecto y su composicion por la interfaz real.
    await page.locator('button.project-open').first().click();
    await page.getByRole('button',{name:'Abrir editor'}).first().click();
    await page.locator('.canvas-panel').waitFor({state:'visible',timeout:30_000});

    const panel=page.getByRole('tab',{name:'Paneles'});
    if(await panel.count())await panel.click();

    const historial=page.locator('.version-history');
    await expect(historial,'el historial se muestra').toBeVisible({timeout:20_000});
    await historial.getByRole('button',{name:'Actualizar historial'}).click();
    // `exact` es necesario: "Versión 1" aparece tambien dentro del botón
    // «Restaurar la versión 1», y sin él el selector es ambiguo.
    await expect(historial.getByText('Versión 1',{exact:true})).toBeVisible();

    // Botones con texto: ningun icono sin nombre accesible.
    const guardar=historial.getByRole('button',{name:'Guardar versión ahora'});
    await expect(guardar,'el botón de guardar tiene nombre').toBeVisible();
    await guardar.click();

    // El resultado se ANUNCIA por role=status, no solo cambia el color.
    const estado=historial.locator('.vh-status');
    await expect(estado).toHaveAttribute('role','status');
    await expect(estado).toContainText('Versión 2 guardada',{timeout:20_000});
  });
});