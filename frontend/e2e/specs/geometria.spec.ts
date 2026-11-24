import {test, expect, Page} from '@playwright/test';
import {entrar, crearProyecto, escribir, unico, CORREOS, WEB} from './helpers';

/**
 * Fase 7N - PRUEBAS E2E DE LA COLOCACION POR TECLADO.
 *
 * 7M anadio los controles de mover y NO tenian prueba. Aqui se ejercitan los
 * controles REALES de la interfaz; nunca se llama al store desde la prueba.
 *
 * La marimba nace con una persona YA SENTADA, para comprobar lo importante:
 * que al mover la marimba la persona se traslada el mismo delta y conserva
 * su posicion relativa dentro de ella.
 */

const BOTON='Edici\u00f3n sin rat\u00f3n';

function escena(bloqueada=false){
 return [
  {id:'m1', type:'marimba', name:'Marimba tenor',
   x:200, y:150, width:1200, height:600, locked:bloqueada,
   positions:[{id:'s1', type:'Primera', personId:1},
               {id:'s2', type:'Segunda', personId:null}]},
  {id:'p1', type:'person', personId:1, name:'Ana',
   x:260, y:230, width:140, height:180, positionType:'Primera',
   marimbaId:'m1', marimbaPositionId:'s1'},
 ];
}

async function crear(page: Page, nombre: string, bloqueada=false){
 const pid=await crearProyecto(page, nombre);
 const c=await escribir(page,'POST',`/projects/${pid}/songs`,
  {name:'Cancion 7N'});
 expect(c.status).toBe(200);
 const sid=(c.cuerpo as {id:number}).id;
 const comp=await escribir(page,'POST','/compositions',{
  project_id:pid, song_id:sid, name:'Composicion 7N',
  width:1600, height:900, data:{elements:escena(bloqueada)}});
 expect(comp.status).toBe(200);
 return {pid, cid:(comp.cuerpo as {id:number}).id};
}

async function abrirAccesible(page: Page, nombre: string){
 await page.goto(WEB,{waitUntil:'domcontentloaded'});
 await page.locator('button.project-open',{hasText:nombre}).first()
  .click({timeout:30_000});
 await page.locator('button.primary',{hasText:'Abrir editor'}).first()
  .click({timeout:30_000});
 await page.locator('.canvas-panel').waitFor({state:'visible',timeout:30_000});
 await page.getByRole('button',{name:BOTON}).click();
 const panel=page.locator('.acc-editor');
 await expect(panel).toBeVisible({timeout:15_000});
 return panel;
}

/** Coordenadas leidas de los CAMPOS de la vista accesible. */
async function leerCoords(sel:any){
 return {
  x:Number(await sel.locator('input[id^="acc-x-"]').first().inputValue()),
  y:Number(await sel.locator('input[id^="acc-y-"]').first().inputValue()),
 };
}

/** Estado persistido de marimba y persona, leido por la API. */
async function guardado(page: Page, cid: number){
 const r=await escribir(page,'GET',`/compositions/${cid}`);
 const g=JSON.parse(r.texto);
 return {m:g.data.elements.find((e:any)=>e.id==='m1'),
         p:g.data.elements.find((e:any)=>e.id==='p1')};
}

async function guardar(page: Page){
 await page.getByRole('button',{name:'Guardar'}).first().click();
 await page.waitForTimeout(1200);
}
test.describe('Colocacion de marimbas por teclado', () => {
  test('las cuatro direcciones mueven la marimba y trasladan a la persona',
    async ({page}) => {
      await entrar(page, CORREOS.dueno);
      const nombre=unico('Mover 7N');
      const {cid}=await crear(page, nombre);
      const panel=await abrirAccesible(page, nombre);

      const antes=await leerCoords(panel);
      expect(antes,'la marimba debe empezar en 200,150')
       .toEqual({x:200,y:150});

      // Posicion de la persona respecto a la marimba ANTES de mover.
      const g0=await guardado(page, cid);
      const relX0=g0.p.x-g0.m.x;
      const relY0=g0.p.y-g0.m.y;

      const dirs:[string,number,number][]=[
        ['Mover Marimba tenor 10 a la derecha',10,0],
        ['Mover Marimba tenor 10 a la izquierda',-10,0],
        ['Mover Marimba tenor 10 abajo',0,10],
        ['Mover Marimba tenor 10 arriba',0,-10],
      ];

      let esperado={x:antes.x,y:antes.y};
      for(const [nombreBoton,dx,dy] of dirs){
        await panel.getByRole('button',{name:nombreBoton}).click();
        esperado={x:esperado.x+dx,y:esperado.y+dy};
        expect(await leerCoords(panel),`tras ${nombreBoton}`)
         .toEqual(esperado);
      }

      await guardar(page);
      const g1=await guardado(page, cid);
      expect(g1.m.x,'la marimba guarda el x final').toBe(esperado.x);
      expect(g1.m.y,'la marimba guarda el y final').toBe(esperado.y);
      expect(g1.p.x-g0.p.x,'la persona se traslada el mismo delta en X')
       .toBe(g1.m.x-antes.x);
      expect(g1.p.y-g0.p.y,'la persona se traslada el mismo delta en Y')
       .toBe(g1.m.y-antes.y);
      expect(g1.p.x-g1.m.x,'la posicion RELATIVA no cambia').toBe(relX0);
      expect(g1.p.y-g1.m.y,'la posicion RELATIVA no cambia').toBe(relY0);
      // Y sigue sentada en el mismo puesto: nada se descolgo.
      expect(g1.p.marimbaId).toBe('m1');
      expect(g1.p.marimbaPositionId).toBe('s1');
    });

  test('las coordenadas exactas se aplican y persisten al recargar',
    async ({page}) => {
      await entrar(page, CORREOS.dueno);
      const nombre=unico('Coords 7N');
      const {cid}=await crear(page, nombre);
      const panel=await abrirAccesible(page, nombre);

      const campoX=panel.locator('input[id^="acc-x-"]').first();
      await campoX.fill('640');
      await expect(campoX,'el campo muestra el valor aplicado')
       .toHaveValue('640');

      await guardar(page);
      await page.reload({waitUntil:'domcontentloaded'});
      await page.locator('button.project-open',{hasText:nombre}).first()
       .click({timeout:30_000});
      await page.locator('button.primary',{hasText:'Abrir editor'}).first()
       .click({timeout:30_000});
      await page.locator('.canvas-panel')
       .waitFor({state:'visible',timeout:30_000});

      const g=await guardado(page, cid);
      expect(g.m.x,'la coordenada exacta persiste').toBe(640);
      expect(g.p.x-g.m.x,'la persona conserva su posicion relativa')
       .toBe(60);
    });

  test('coordenadas negativas se rechazan', async ({page}) => {
      await entrar(page, CORREOS.dueno);
      const nombre=unico('Negativas 7N');
      const {cid}=await crear(page, nombre);
      const panel=await abrirAccesible(page, nombre);

      const campoY=panel.locator('input[id^="acc-y-"]').first();
      await campoY.fill('-50');
      // 8C - OPCION A. Desde 8A el campo mantiene un BORRADOR: escribir no es
      // confirmar. Antes cada `onChange` llamaba a `mover()` y la recorte se
      // repintaba al instante; ahora se normaliza AL CONFIRMAR.
      // Se mantiene la intencion del escenario: una posicion negativa no puede
      // quedar aplicada al modelo. La correccion la sigue aportando `mover()`
      // (`Math.max(0,...)`), NO una regla nueva en `Numero`: las coordenadas
      // negativas siguen siendo validas en el contrato general del store.
      await campoY.blur();
      await expect(campoY,'no se admite posicion negativa')
       .toHaveValue('0');
      await guardar(page);
      const g=await guardado(page, cid);
      expect(g.m.y,'la marimba no baja de cero')
       .toBeGreaterThanOrEqual(0);
    });
  test('deshacer y rehacer recuperan las coordenadas exactas',
    async ({page}) => {
      await entrar(page, CORREOS.dueno);
      const nombre=unico('Historial 7N');
      const {cid}=await crear(page, nombre);
      const panel=await abrirAccesible(page, nombre);

      await panel.getByRole('button',
       {name:'Mover Marimba tenor 10 a la derecha'}).click();
      await panel.getByRole('button',
       {name:'Mover Marimba tenor 10 abajo'}).click();
      expect(await leerCoords(panel)).toEqual({x:210,y:160});

      await panel.getByRole('button',{name:'Deshacer'}).click();
      expect(await leerCoords(panel),'deshacer revierte el ultimo')
       .toEqual({x:210,y:150});

      await panel.getByRole('button',{name:'Rehacer'}).click();
      expect(await leerCoords(panel),'rehacer lo vuelve a aplicar')
       .toEqual({x:210,y:160});

      await panel.getByRole('button',{name:'Deshacer'}).click();
      await panel.getByRole('button',{name:'Deshacer'}).click();
      expect(await leerCoords(panel)).toEqual({x:200,y:150});
      await guardar(page);
      const g=await guardado(page, cid);
      expect(g.m.x,'el estado deshecho es el que se guarda').toBe(200);
      expect(g.m.y).toBe(150);
      expect(g.p.x-g.m.x,'la persona vuelve con su marimba').toBe(60);
    });

  test('una marimba bloqueada no se puede mover', async ({page}) => {
      await entrar(page, CORREOS.dueno);
      const nombre=unico('Bloqueo 7N');
      const {cid}=await crear(page, nombre, true);
      const panel=await abrirAccesible(page, nombre);

      await expect(panel.getByRole('button',{name:/Mover Marimba tenor/})
       .first(),'los controles de mover estan deshabilitados')
       .toBeDisabled();
      await expect(panel.locator('input[id^="acc-x-"]').first(),
       'el campo de coordenadas esta deshabilitado').toBeDisabled();

      await guardar(page);
      const g=await guardado(page, cid);
      expect(g.m.x,'una marimba bloqueada NO se mueve').toBe(200);
      expect(g.m.y).toBe(150);
    });

  test('el estado se conserva al alternar entre lienzo y vista accesible',
    async ({page}) => {
      await entrar(page, CORREOS.dueno);
      const nombre=unico('Alternar 7N');
      await crear(page, nombre);
      const panel=await abrirAccesible(page, nombre);

      await panel.getByRole('button',
       {name:'Mover Marimba tenor 10 a la derecha'}).click();
      const movida=await leerCoords(panel);
      expect(movida).toEqual({x:210,y:150});

      await page.getByRole('button',{name:'Ver el lienzo'}).click();
      await expect(page.locator('.canvas-panel')).toBeVisible();
      await page.getByRole('button',{name:BOTON}).click();
      await expect(page.locator('.acc-editor')).toBeVisible();
      expect(await leerCoords(page.locator('.acc-editor')),
       'la posicion no se pierde al cambiar de vista').toEqual(movida);
    });
});
