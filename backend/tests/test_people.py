"""UX-2.5: alcance del borrado de personas, renombrado y conservacion de asignaciones."""
import random
from fastapi.testclient import TestClient
from app.main import app

client=TestClient(app)

def _unique(prefix):
    return f'{prefix} {random.randint(100000,999999)}'

def _person(prefix='QA Persona'):
    name=_unique(prefix)
    r=client.post('/api/people',json={'name':name})
    assert r.status_code==200
    return r.json()['id'],name

def _project_with_song(person_name,project_name):
    """Proyecto con una cancion y una asignacion real para `person_name`."""
    pid=client.post('/api/projects',json={'name':project_name}).json()['id']
    r=client.post('/api/imports/confirm',json={'project_id':pid,'sheets':[{'name':'Hoja1','songs':[
        {'name':'Cancion QA','assignments':[{'person':person_name,'position':'Primera','mark':'X'}]}]}]})
    assert r.status_code==200
    return pid

def _assignments(pid):
    proj=client.get(f'/api/projects/{pid}').json()
    return [a for s in proj['songs'] for a in s['assignments']]

def _composition_with_person(pid,person_id):
    data={'elements':[
        {'id':'m1','type':'marimba','name':'M','x':0,'y':0,'width':380,'height':150,'rotation':0,'scaleX':1,'scaleY':1,
         'positions':[{'id':'p1','type':'Primera','personId':person_id}]},
        {'id':'pe1','type':'person','name':'Alguien','personId':person_id,'positionType':'Primera',
         'x':10,'y':10,'width':150,'height':44,'rotation':0,'scaleX':1,'scaleY':1,
         'marimbaId':'m1','marimbaPositionId':'p1'}]}
    return client.post('/api/compositions',json={'project_id':pid,'name':'Comp QA','data':data}).json()['id']

def test_create_person_rejects_blank_and_duplicates():
    assert client.post('/api/people',json={'name':'   '}).status_code==400

    pid,name=_person('QA Unica')
    assert client.post('/api/people',json={'name':name}).status_code==409

def test_project_person_can_be_reactivated_after_project_removal():
    project_id=client.post('/api/projects',json={'name':_unique('QA Reactivar')}).json()['id']
    name=_unique('QA Reintegrable')
    first=client.post('/api/people',json={'name':name,'project_id':project_id})
    assert first.status_code==200
    person_id=first.json()['id']

    removed=client.delete(f'/api/people/{person_id}',params={
        'project_id':project_id,'scope':'project'})
    assert removed.status_code==200

    again=client.post('/api/people',json={'name':name,'project_id':project_id})
    assert again.status_code==200
    assert again.json()['id']==person_id
    assert again.json()['active'] is True

def test_rename_person_updates_catalog_and_validates():
    pid,name=_person('QA Renombrable')
    r=client.patch(f'/api/people/{pid}',json={'name':_unique('QA Renombrada')})
    assert r.status_code==200 and r.json()['id']==pid

    assert client.patch(f'/api/people/{pid}',json={'name':'  '}).status_code==400
    assert client.patch('/api/people/99999999',json={'name':'X'}).status_code==404

def test_rename_rejects_name_taken_by_another_person():
    a,_=_person('QA A')
    b,name_b=_person('QA B')
    assert client.patch(f'/api/people/{a}',json={'name':name_b}).status_code==409
    assert {a,b}<={p['id'] for p in client.get('/api/people').json()}


# ------------------------------------------------- Alcance del borrado (P1)

def test_catalogue_delete_is_refused_while_the_person_has_assignments():
    pid,name=_person('QA Con historial')
    project_id=_project_with_song(name,_unique('QA Proyecto'))

    r=client.delete(f'/api/people/{pid}')
    assert r.status_code==409
    # Ni la persona ni su asignacion desaparecen.
    assert any(p['id']==pid for p in client.get('/api/people').json())
    assert len(_assignments(project_id))==1

def test_catalogue_delete_is_refused_while_referenced_by_a_composition():
    pid,name=_person('QA En composicion')
    project_id=client.post('/api/projects',json={'name':_unique('QA Proyecto comp')}).json()['id']
    _composition_with_person(project_id,pid)

    r=client.delete(f'/api/people/{pid}')
    assert r.status_code==409
    assert any(p['id']==pid for p in client.get('/api/people').json())

def test_catalogue_delete_succeeds_for_an_unreferenced_person():
    pid,_=_person('QA Suelta')
    r=client.delete(f'/api/people/{pid}')
    assert r.status_code==200
    assert r.json()['deleted'] is True and r.json()['scope']=='catalog'
    assert not any(p['id']==pid for p in client.get('/api/people').json())

def test_composition_scope_preserves_person_and_assignments():
    pid,name=_person('QA Solo visual')
    project_id=_project_with_song(name,_unique('QA Proyecto visual'))
    _composition_with_person(project_id,pid)

    r=client.delete(f'/api/people/{pid}',params={'project_id':project_id,'scope':'composition'})
    assert r.status_code==200

    body=r.json()
    assert body['deleted'] is False
    assert body['scope']=='composition'
    assert body['assignments_removed']==0
    assert body['compositions_updated']==1

    # La persona sigue en el catalogo y su asignacion historica sigue viva.
    assert any(p['id']==pid for p in client.get('/api/people').json())
    assert len(_assignments(project_id))==1

    comps=client.get(f'/api/projects/{project_id}').json()['compositions']
    elements=comps[0]['data']['elements']
    assert not any(e.get('type')=='person' for e in elements)
    assert elements[0]['positions'][0]['personId'] is None

def test_composition_scope_is_idempotent():
    pid,name=_person('QA Idempotente')
    project_id=_project_with_song(name,_unique('QA Proyecto idem'))
    _composition_with_person(project_id,pid)

    first=client.delete(f'/api/people/{pid}',params={'project_id':project_id}).json()
    second=client.delete(f'/api/people/{pid}',params={'project_id':project_id}).json()
    assert first['compositions_updated']==1
    assert second['compositions_updated']==0

def test_project_scope_removes_assignments_only_of_that_project():
    pid,name=_person('QA Compartida')
    project_a=_project_with_song(name,_unique('QA Proyecto A'))
    project_b=_project_with_song(name,_unique('QA Proyecto B'))
    _composition_with_person(project_a,pid)

    r=client.delete(f'/api/people/{pid}',params={'project_id':project_a,'scope':'project'})
    assert r.status_code==200

    body=r.json()
    assert body['scope']=='project'
    assert body['assignments_removed']==1
    # La persona se conserva en el catalogo global.
    assert any(p['id']==pid for p in client.get('/api/people').json())
    # Solo desaparecen las asignaciones del proyecto indicado.
    assert _assignments(project_a)==[]
    assert len(_assignments(project_b))==1

def test_delete_person_validates_scope_and_project():
    pid,_=_person('QA Validada')
    project_id=client.post('/api/projects',json={'name':_unique('QA Proyecto val')}).json()['id']

    assert client.delete(f'/api/people/{pid}',params={'project_id':99999999}).status_code==404
    assert client.delete(f'/api/people/{pid}',params={'project_id':project_id,'scope':'nonsense'}).status_code==400
    assert client.delete('/api/people/99999999').status_code==404
