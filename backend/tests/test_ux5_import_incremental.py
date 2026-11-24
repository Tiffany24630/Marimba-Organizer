"""UX-5: sumar piezas a un proyecto importando Excel, sin perder las existentes."""
import random
from fastapi.testclient import TestClient
from app.main import app

client=TestClient(app)

def _u(p):
    return f'{p} {random.randint(100000,999999)}'

def _sheet(songs):
    """songs = [(nombre, [personas...]), ...]"""
    return [{'name':'H','songs':[
        {'name':nm,'assignments':[{'person':p,'position':'Primera','mark':'X'} for p in ppl]}
        for nm,ppl in songs]}]

def _songs(pid):
    return client.get(f'/api/projects/{pid}/songs').json()

# ------------------------------------------------- Sumar piezas

def test_import_adds_songs_without_touching_existing_ones():
    """UX-5: el segundo Excel SUMA canciones; las previas quedan intactas."""
    pid=client.post('/api/projects',json={'name':_u('QA Incremental')}).json()['id']

    r1=client.post('/api/imports/confirm',json={
        'project_id':pid,'sheets':_sheet([('Alpha',[_u('QA A1')]),('Beta',[_u('QA B1')])])})
    assert r1.status_code==200
    first=r1.json()
    assert sorted(first['added_songs'])==['Alpha','Beta']
    assert first['songs_before']==0 and first['songs_after']==2
    antes={s['id']:(s['name'],s['assignment_count']) for s in _songs(pid)}
    assert len(antes)==2

    r2=client.post('/api/imports/confirm',json={
        'project_id':pid,'sheets':_sheet([('Gamma',[_u('QA C1')]),('Delta',[_u('QA D1')])])})
    assert r2.status_code==200
    second=r2.json()
    assert sorted(second['added_songs'])==['Delta','Gamma']
    assert second['songs_before']==2 and second['songs_after']==4
    assert second['duplicate_songs']==[]

    despues={s['id']:(s['name'],s['assignment_count']) for s in _songs(pid)}
    # Las dos originales siguen intactas (mismo id, nombre y participaciones).
    for sid,val in antes.items():
        assert despues.get(sid)==val, 'una cancion previa fue modificada'
    nombres=[n for n,_ in despues.values()]
    assert sorted(nombres)==['Alpha','Beta','Delta','Gamma']
    # Las nuevas van al final.
    orden=[s['name'] for s in sorted(_songs(pid),key=lambda x:x['order_index'])]
    assert orden[-2:]==['Gamma','Delta'], orden

def test_import_into_existing_project_keeps_its_compositions():
    """UX-5: sumar piezas no debe tocar las composiciones ya guardadas."""
    pid=client.post('/api/projects',json={'name':_u('QA Comp')}).json()['id']
    client.post('/api/imports/confirm',json={
        'project_id':pid,'sheets':_sheet([('Base',[_u('QA Z1')])])})
    song_id=_songs(pid)[0]['id']
    comp=client.post('/api/compositions',json={
        'project_id':pid,'song_id':song_id,'name':'Mi lienzo',
        'data':{'elements':[{'id':'m1','type':'marimba','name':'M','x':0,'y':0,
                             'width':380,'height':150,'rotation':0,'scaleX':1,'scaleY':1,
                             'positions':[{'id':'p0','type':'Primera','personId':None}]}]}}).json()
    before=client.get(f"/api/compositions/{comp['id']}").json()['data']

    client.post('/api/imports/confirm',json={
        'project_id':pid,'sheets':_sheet([('Nueva',[_u('QA Z2')])])})

    after=client.get(f"/api/compositions/{comp['id']}").json()['data']
    assert after==before, 'la composicion existente fue alterada'
    assert len(_songs(pid))==2

def test_duplicate_song_is_reported_but_still_added():
    """
    UX-5: una pieza con el mismo nombre se AGREGA igual (son piezas adicionales) y
    se reporta como duplicado, para que la interfaz pueda avisar. Descartarla en
    silencio seria peor: el usuario cree que se importo y no fue asi.
    """
    pid=client.post('/api/projects',json={'name':_u('QA Dup')}).json()['id']
    client.post('/api/imports/confirm',json={
        'project_id':pid,'sheets':_sheet([('Alma',[_u('QA D1')])])})

    r=client.post('/api/imports/confirm',json={
        'project_id':pid,'sheets':_sheet([('alma',[_u('QA D2')])])})
    body=r.json()
    assert r.status_code==200
    assert body['duplicate_songs']==['alma'], 'debe reportar el nombre repetido'
    assert body['added_songs']==['alma'], 'la pieza se agrega como adicional'
    nombres=[s['name'] for s in _songs(pid)]
    assert len(nombres)==2
    # La normalizacion no distingue mayusculas: siguen siendo la misma pieza.
    assert {n.lower() for n in nombres}=={'alma'}

def test_song_repeated_inside_same_file_is_ignored_once():
    """UX-5: repetida dentro del MISMO archivo se conserva solo la primera."""
    pid=client.post('/api/projects',json={'name':_u('QA MismoArchivo')}).json()['id']
    r=client.post('/api/imports/confirm',json={'project_id':pid,'sheets':[
        {'name':'H','songs':[
            {'name':'Repetida','assignments':[{'person':_u('QA R1'),'position':'Primera','mark':'X'}]},
            {'name':'Repetida','assignments':[{'person':_u('QA R2'),'position':'Primera','mark':'X'}]}]}]})
    body=r.json()
    assert r.status_code==200
    assert body['added_songs']==['Repetida']
    assert body['ignored_songs']==['Repetida']
    songs=_songs(pid)
    assert len(songs)==1
    # Solo una persona asignada: no se duplicaron las participaciones.
    assert songs[0]['assignment_count']==1

def test_order_index_continues_after_manual_song_creation():
    """
    UX-5: si el usuario creo canciones a mano y luego importa, los indices no
    deben repetirse. Antes se usaba len(project.songs), que falla si hay huecos.
    """
    pid=client.post('/api/projects',json={'name':_u('QA Ordenes')}).json()['id']
    client.post(f'/api/projects/{pid}/songs',json={'name':'Manual 1'})
    client.post(f'/api/projects/{pid}/songs',json={'name':'Manual 2'})
    # Se borra la del medio: queda un hueco en los indices.
    medio=[s for s in _songs(pid) if s['name']=='Manual 1'][0]
    client.delete(f"/api/songs/{medio['id']}")

    r=client.post('/api/imports/confirm',json={
        'project_id':pid,'sheets':_sheet([('Importada',[_u('QA I1')])])})
    assert r.status_code==200
    songs=_songs(pid)
    indices=[s['order_index'] for s in songs]
    assert len(indices)==len(set(indices)), f'indices repetidos: {indices}'

