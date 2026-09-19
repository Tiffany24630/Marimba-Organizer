from fastapi.testclient import TestClient
from io import BytesIO

from openpyxl import Workbook
from app.main import app

client=TestClient(app)


def test_health():
    assert client.get('/api/health').json()=={'status':'ok'}


def test_default_templates_are_seeded():
    r=client.get('/api/marimba-templates')
    assert r.status_code==200
    names={t['name'] for t in r.json()}
    assert {'Marimba tenor','Marimba grande','Marimbito'}<=names


def test_composition_roundtrip_keeps_configurable_marimba():
    p=client.post('/api/projects',json={'name':'Proyecto test'}).json()
    data={'elements':[{
        'id':'m1','type':'marimba','name':'Marimba Grande 1','x':10,'y':20,
        'width':380,'height':150,'rotation':0,'scaleX':1,'scaleY':1,
        'positions':[{'id':'p1','type':'Primera','personId':None},{'id':'p2','type':'Centro','personId':None}]
    }]}
    c=client.post('/api/compositions',json={'project_id':p['id'],'name':'Comp 1','data':data})
    assert c.status_code==200
    cid=c.json()['id']
    got=client.get(f'/api/compositions/{cid}').json()
    assert got['data']==data
    upd=client.put(f'/api/compositions/{cid}',json={'project_id':p['id'],'name':'Comp 1b','data':data})
    assert upd.status_code==200 and upd.json()['name']=='Comp 1b'


def test_import_confirm_creates_project_with_songs_and_assignments():
    payload={'project_name':'Concierto test','sheets':[{'name':'Hoja1','songs':[
        {'name':'Canción 1','assignments':[{'person':'Tiffany Salazar','position':'Centro','mark':'X'}]}
    ]}]}
    r=client.post('/api/imports/confirm',json=payload)
    assert r.status_code==200
    proj=client.get(f"/api/projects/{r.json()['id']}").json()
    a=proj['songs'][0]['assignments'][0]
    assert a['person']=='Tiffany Salazar' and a['position']=='Centro' and a['mark']=='X'


def _make_xlsx(rows):
    wb=Workbook()
    ws=wb.active
    ws['A1']='Nombre'; ws['B1']='Canción 1'
    ws['B2']='Primera'
    for i,(name,mark) in enumerate(rows,start=3):
        ws.cell(row=i,column=1,value=name)
        ws.cell(row=i,column=2,value=mark)
    buf=BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_preview_valid_excel():
    content=_make_xlsx([('Tiffany Salazar','X'),('María López','X')])
    r=client.post('/api/imports/preview',files={'file':('personas.xlsx',content)})
    assert r.status_code==200
    d=r.json()
    assert set(d['people'])>=({'Tiffany Salazar','María López'})
    assert d['positions']==['Primera']
    assert d['stats']['valid_rows']==2
    assert 'duplicates' in d


def test_preview_rejects_invalid_extension():
    r=client.post('/api/imports/preview',files={'file':('datos.csv',b'a,b')})
    assert r.status_code==400
    assert 'extensión' in r.json()['detail'].lower()


def test_preview_rejects_empty_file():
    r=client.post('/api/imports/preview',files={'file':('vacio.xlsx',b'')})
    assert r.status_code==400
    assert 'vacío' in r.json()['detail'].lower()


def test_preview_rejects_corrupt_file():
    r=client.post('/api/imports/preview',files={'file':('roto.xlsx',b'contenido que no es un zip')})
    assert r.status_code==422


def test_preview_rejects_oversized_file():
    big=b'\x00'*(10*1024*1024+1)
    r=client.post('/api/imports/preview',files={'file':('grande.xlsx',big)})
    assert r.status_code==413
    assert 'tamaño' in r.json()['detail'].lower()


def test_preview_excel_without_valid_rows():
    wb=Workbook()
    ws=wb.active
    ws['A1']='ID'; ws['B1']='Stock Actual'; ws['A2']=1
    buf=BytesIO(); wb.save(buf)
    r=client.post('/api/imports/preview',files={'file':('sin_datos.xlsx',buf.getvalue())})
    assert r.status_code==422
    assert 'no contiene filas válidas' in r.json()['detail'].lower()


def test_confirm_into_existing_project_avoids_duplicate_people():
    p=client.post('/api/projects',json={'name':'Proyecto import'}).json()
    sheets=[{'name':'H','songs':[{'name':'C','assignments':[
        {'person':'Ana García','position':'Tenor','mark':'X'},
        {'person':'ana  garcía','position':'Bajo','mark':'X'},
    ]}]}]
    r1=client.post('/api/imports/confirm',json={'project_id':p['id'],'source_filename':'a.xlsx','sheets':sheets})
    assert r1.status_code==200 and r1.json()['id']==p['id']
    r2=client.post('/api/imports/confirm',json={'project_id':p['id'],'source_filename':'b.xlsx','sheets':sheets})
    assert r2.status_code==200

    people=client.get('/api/people').json()
    anas=[x for x in people if 'ana' in x['name'].lower()]
    assert len(anas)==1

    proj=client.get(f"/api/projects/{p['id']}").json()
    positions=sorted({a['position'] for s in proj['songs'] for a in s['assignments']})
    assert positions==['Bajo','Tenor']
    assert proj['project']['source_filename']=='a.xlsx'


def test_confirm_unknown_project_returns_404():
    r=client.post('/api/imports/confirm',json={'project_id':999999,'sheets':[]})
    assert r.status_code==404


def test_song_crud_and_integrity():
    p=client.post('/api/projects',json={'name':'Concierto 20 de febrero 2026'}).json()

    s1=client.post(f"/api/projects/{p['id']}/songs",json={'name':'Luna de Xelajú'})
    assert s1.status_code==200 and s1.json()['name']=='Luna de Xelajú'

    s2=client.post(f"/api/projects/{p['id']}/songs",json={'name':'El Grito'}).json()
    s3=client.post(f"/api/projects/{p['id']}/songs",json={'name':'Noche de Luna'}).json()

    songs=client.get(f"/api/projects/{p['id']}/songs").json()
    assert [s['name'] for s in songs]==['Luna de Xelajú','El Grito','Noche de Luna']

    dup=client.post(f"/api/projects/{p['id']}/songs",json={'name':'luna de xelajú'})
    assert dup.status_code==409

    empty=client.post(f"/api/projects/{p['id']}/songs",json={'name':'   '})
    assert empty.status_code==400

    ren=client.patch(f"/api/songs/{s2['id']}",json={'name':'El Grito (final)'})
    assert ren.status_code==200 and ren.json()['name']=='El Grito (final)'

    other=client.post('/api/projects',json={'name':'Otro proyecto'}).json()
    oc=client.post(f"/api/projects/{other['id']}/songs",json={'name':'Canción ajena'}).json()

    cross=client.post('/api/compositions',json={'project_id':p['id'],'song_id':oc['id'],'name':'X','data':{}})
    assert cross.status_code==400

    ghost=client.post('/api/compositions',json={'project_id':p['id'],'song_id':999999,'name':'X','data':{}})
    assert ghost.status_code==404

    nop=client.post('/api/compositions',json={'project_id':999999,'song_id':None,'name':'X','data':{}})
    assert nop.status_code==404

    d=client.delete(f"/api/songs/{s3['id']}")
    assert d.status_code==200
    assert client.get(f"/api/songs/{s3['id']}").status_code==404
    songs=client.get(f"/api/projects/{p['id']}/songs").json()
    assert [s['name'] for s in songs]==['Luna de Xelajú','El Grito (final)']


def test_duplicate_composition_independent_copy():
    p=client.post('/api/projects',json={'name':'Proyecto dup'}).json()
    s1=client.post(f"/api/projects/{p['id']}/songs",json={'name':'Luna de Xelajú'}).json()
    s2=client.post(f"/api/projects/{p['id']}/songs",json={'name':'El Grito'}).json()

    data={'elements':[{'id':'m1','type':'marimba','name':'Marimba A','x':1,'y':2,'width':380,'height':150,
        'rotation':15,'scaleX':1.2,'scaleY':1.2,
        'positions':[{'id':'p1','type':'Primera','personId':7},{'id':'p2','type':'Segunda','personId':None}]}]}
    c=client.post('/api/compositions',json={'project_id':p['id'],'song_id':s1['id'],'name':'Luna de Xelajú','data':data}).json()

    d=client.post(f"/api/compositions/{c['id']}/duplicate",json={'song_id':s2['id'],'name':'El Grito - distribución'})
    assert d.status_code==200
    copy=d.json()
    assert copy['id']!=c['id'] and copy['song_id']==s2['id']
    assert copy['data']==data

    mod=dict(data)
    mod['elements']=[dict(data['elements'][0])]
    mod['elements'][0]['name']='MODIFICADA'
    client.put(f"/api/compositions/{copy['id']}",json={'project_id':p['id'],'song_id':s2['id'],'name':'El Grito - distribución','data':mod})

    orig=client.get(f"/api/compositions/{c['id']}").json()
    got=client.get(f"/api/compositions/{copy['id']}").json()
    assert orig['data']['elements'][0]['name']=='Marimba A'
    assert got['data']['elements'][0]['name']=='MODIFICADA'

    dup_default=client.post(f"/api/compositions/{c['id']}/duplicate",json={})
    assert dup_default.status_code==200 and dup_default.json()['name'].endswith('(copia)')

    bad=client.post(f"/api/compositions/{c['id']}/duplicate",json={'song_id':999999})
    assert bad.status_code==404


def test_duplicate_rejects_song_from_other_project():
    p1=client.post('/api/projects',json={'name':'P1'}).json()
    p2=client.post('/api/projects',json={'name':'P2'}).json()
    s2=client.post(f"/api/projects/{p2['id']}/songs",json={'name':'Canción P2'}).json()
    c=client.post('/api/compositions',json={'project_id':p1['id'],'name':'C P1','data':{}}).json()

    r=client.post(f"/api/compositions/{c['id']}/duplicate",json={'song_id':s2['id']})
    assert r.status_code==400


def test_get_song_returns_404_for_missing():
    assert client.get('/api/songs/999999').status_code==404
