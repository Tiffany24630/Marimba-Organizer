// Fase 7B.2 y 7B.3 - buscador del dashboard y exportacion masiva
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText,file);
const s=require('../src/lib/search.ts');
const ex=require('../src/lib/export.ts');
const lay=require('../src/lib/layout.ts');

const LIST=[
 {id:1,name:'Concierto de Primavera',source_filename:'primavera.xlsx'},
 {id:2,name:'Navidad en la Plaza',source_filename:null},
 {id:3,name:'ensayo general',source_filename:'ensayo.xlsx'},
 {id:4,name:'Festival de Otoño',source_filename:null},
];

// ---------- 7B.2 buscador ----------

test('7B.2 coincide por coincidencia parcial del nombre',()=>{
 assert.deepEqual(s.filterProjects(LIST,'Conci').map(p=>p.id),[1]);
 assert.deepEqual(s.filterProjects(LIST,'Navidad').map(p=>p.id),[2]);
 // Parcial en medio de la palabra.
 assert.deepEqual(s.filterProjects(LIST,'Primavera').map(p=>p.id),[1]);
});

test('7B.2 ignora mayusculas y minusculas',()=>{
 assert.deepEqual(s.filterProjects(LIST,'concierto').map(p=>p.id),[1]);
 assert.deepEqual(s.filterProjects(LIST,'CONCIERTO').map(p=>p.id),[1]);
 assert.deepEqual(s.filterProjects(LIST,'ConCiErTo').map(p=>p.id),[1]);
 // Tambien en el nombre del archivo de origen.
 assert.deepEqual(s.filterProjects(LIST,'ENSAYO').map(p=>p.id),[3]);
});

test('7B.2 una consulta vacia devuelve todo y una sin coincidencias, nada',()=>{
 assert.equal(s.filterProjects(LIST,'').length,4);
 assert.equal(s.filterProjects(LIST,'   ').length,4);
 assert.equal(s.filterProjects(LIST,'zzz-no-existe').length,0);
});

test('7B.2 no muta la lista original',()=>{
 const copia=JSON.stringify(LIST);
 s.filterProjects(LIST,'Navidad');
 assert.equal(JSON.stringify(LIST),copia);
});

// ---------- 7B.3 exportacion ----------

test('7B.3 nombres de archivo seguros y unicos',()=>{
 // Caracteres prohibidos por el sistema de archivos.
 const n=ex.safeFileName('Concierto: "OTOÑO"/2024?*<>|');
 assert.equal(n.includes(':'),false);
 assert.equal(n.includes('/'),false);
 assert.equal(n.includes('?'),false);
 assert.equal(n.includes('*'),false);
 assert.equal(n.includes('"'),false);
 assert.equal(n.includes('<'),false);
 assert.equal(n.includes('>'),false);
 assert.equal(n.includes('|'),false);
 // Vacio / solo invalidos -> marcador utilizable, no cadena vacia.
 assert.ok(ex.safeFileName('').length>0);
 assert.ok(ex.safeFileName('   ').length>0);
 assert.ok(ex.safeFileName(null).length>0);
 // Nombres reservados de Windows.
 assert.equal(ex.safeFileName('CON'),'_CON');
 // Sin puntos/espacios al final (invalido en Windows).
 assert.equal(ex.safeFileName('pieza.'),'pieza');
 assert.equal(ex.safeFileName('pieza  '),'pieza');
 assert.ok(ex.safeFileName('a'.repeat(400)).length<=120);
});

test('7B.3 el nombre de imagen incluye cancion, composicion e indice',()=>{
 const f=ex.imageFileName({index:0,total:12,song:'Navidad',composition:'Distribución A'});
 assert.equal(f,'Navidad - Distribución A - 01.png');
 // Sin cancion (composicion suelta) tambien es valido.
 assert.equal(ex.imageFileName({index:2,total:3,song:null,composition:'Manual'}),
  'Manual - 3.png');
 // Dos composiciones con el MISMO nombre NO colisionan por el indice.
 const a=ex.imageFileName({index:0,total:2,song:'X',composition:'Igual'});
 const b=ex.imageFileName({index:1,total:2,song:'X',composition:'Igual'});
 assert.notEqual(a,b);
});

test('7B.3 el rotulo se recorta y la composicion vacia no tiene encuadre',()=>{
 assert.equal(ex.captionText('Corto'),'Corto');
 const largo=ex.captionText('a'.repeat(100));
 assert.ok(largo.length<=42);
 assert.ok(largo.endsWith('…'));
 assert.equal(ex.captionText(''),'');
 assert.equal(ex.captionText(null),'');
 // Sin elementos no hay nada que dibujar: se informa en vez de fallar.
 assert.equal(ex.compositionBounds([]),null);
 assert.equal(ex.compositionBounds(null),null);
});

test('7B.3 el encuadre contiene todos los elementos',()=>{
 const M={x:100,y:80,width:400,height:150,rotation:0,scaleX:1,scaleY:1};
 const els=[
  {...M,id:'m',type:'marimba',name:'M',
   positions:[{id:'s1',type:'Primera',personId:1},{id:'s2',type:'Primera',personId:null}]},
  {id:'p',type:'person',name:'Ana',personId:1,positionType:'Primera',x:0,y:0,width:80,height:40,
   rotation:0,scaleX:1,scaleY:1,marimbaId:'m',marimbaPositionId:'s1'},
 ];
 const b=ex.compositionBounds(els,48);
 assert.ok(b);
 // La persona asignada se dibuja dentro de su puesto, asi que la caja mas
 // pequena es la de la MARIMBA. `x`/`y` son el desplazamiento que hace caber
 // todo respetando el padding.
 assert.equal(b.x,48-M.x);
 assert.equal(b.y,48-M.y);
 assert.equal(b.width,M.width+48*2);
 assert.equal(b.height,M.height+48*2);
 // Una persona SUELTA (fuera de toda marimba) si usa su x/y, y enlarge el encuadre:
 const suelta=[...els,{...els[1],id:'p2',personId:2,name:'Luis',
  marimbaId:null,marimbaPositionId:null,x:900,y:600}];
 const b2=ex.compositionBounds(suelta,48);
 assert.equal(b2.width,900+80+48*2-M.x);
 assert.equal(b2.height,600+40+48*2-M.y);
});
