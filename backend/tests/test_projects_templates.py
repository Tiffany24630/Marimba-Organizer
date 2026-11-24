"""Gestion de proyectos, plantillas y construccion de marimbas desde plantillas."""
import random
from fastapi.testclient import TestClient
from app.main import app

client=TestClient(app)

def _u(p):
    return f'{p} {random.randint(100000,999999)}'

def _project_with_song(persons):
    """Proyecto con una cancion; `persons` = [(nombre, posicion), ...]"""
    pid=client.post('/api/projects',json={'name':_u('QA Proyecto')}).json()['id']
    assignments=[{'person':n,'position':pos,'mark':'X'} for n,pos in persons]
    r=client.post('/api/imports/confirm',json={'project_id':pid,'sheets':[{'name':'Hoja1','songs':[
        {'name':'Cancion QA','assignments':assignments}]}]})
    assert r.status_code==200
    proj=client.get(f'/api/projects/{pid}').json()
    return pid, proj['songs'][0]['id']

# ------------------------------------------------- Proyecto: renombrar/eliminar

def test_rename_project_updates_name_and_validates():
    pid=client.post('/api/projects',json={'name':_u('QA Original')}).json()['id']
    nuevo=_u('QA Renombrado')
    r=client.patch(f'/api/projects/{pid}',json={'name':nuevo})
    assert r.status_code==200 and r.json()['name']==nuevo
    assert client.get(f'/api/projects/{pid}').json()['project']['name']==nuevo

    assert client.patch(f'/api/projects/{pid}',json={'name':'   '}).status_code==400
    assert client.patch('/api/projects/99999999',json={'name':'X'}).status_code==404

def test_rename_project_rejects_duplicate_name():
    a=client.post('/api/projects',json={'name':_u('QA A')}).json()['id']
    nombre=_u('QA B')
    client.post('/api/projects',json={'name':nombre})
    assert client.patch(f'/api/projects/{a}',json={'name':nombre}).status_code==409
    actual=client.get(f'/api/projects/{a}').json()['project']['name']
    assert client.patch(f'/api/projects/{a}',json={'name':actual}).status_code==200

def test_delete_project_removes_songs_assignments_and_compositions():
    pid,sid=_project_with_song([('QA Uno','Primera'),('QA Dos','Segunda')])
    people_before={p['name'] for p in client.get('/api/people').json()}
    client.post('/api/compositions',json={'project_id':pid,'song_id':sid,'name':'Comp QA','data':{'elements':[]}})

    r=client.delete(f'/api/projects/{pid}')
    assert r.status_code==200
    body=r.json()
    assert body['deleted'] is True and body['songs']==1 and body['assignments_removed']==2

    assert client.get(f'/api/projects/{pid}').status_code==404
    assert not any(p['id']==pid for p in client.get('/api/projects').json())
    # El catalogo de personas NO se toca.
    assert people_before<={p['name'] for p in client.get('/api/people').json()}
    assert client.delete('/api/projects/99999999').status_code==404

# ------------------------------------------------- Plantillas

def test_delete_template_removes_only_that_template():
    client.get('/api/marimba-templates')
    t=client.post('/api/marimba-templates',json={
        'name':_u('Temporal'),'description':'x','positions':['Primera','Bajo']}).json()
    r=client.delete(f"/api/marimba-templates/{t['id']}")
    assert r.status_code==200 and r.json()['deleted'] is True
    assert not any(x['id']==t['id'] for x in client.get('/api/marimba-templates').json())
    assert client.delete('/api/marimba-templates/99999999').status_code==404


# ------------------------------- Plantillas: motores de sugerencias/distribucion

def test_suggestions_use_templates_instead_of_one_big_marimba():
    pid,sid=_project_with_song([('QA A','Primera'),('QA B','Primera'),
                                ('QA C','Segunda'),('QA D','Bajo')])
    data=client.get(f'/api/songs/{sid}/suggestions').json()
    plan=data.get('marimba_plan')
    assert plan, 'debe incluir un plan de marimbas derivado de plantillas'
    names={m['name'] for m in plan}
    # No debe colapsar todo en una sola marimba.
    assert len(names)>1, f'se esperaba mas de una marimba, se obtuvo {names}'
    for m in plan:
        assert m['positions'], 'cada marimba conserva los puestos de su plantilla'

    comp=client.post(f'/api/songs/{sid}/suggestions/apply',json={
        'proposals':data['proposals'],'name':'Aplicada','marimba_plan':plan}).json()
    marimbas=[e for e in comp['data']['elements'] if e['type']=='marimba']
    assert len(marimbas)>1, 'la composicion debe traer varias marimbas'
    for m in marimbas:
        assert len(m['positions'])>0

def test_suggestions_never_duplicate_a_person():
    # La misma persona aparece con dos puestos distintos en la misma cancion.
    nombre=_u('QA Doble')
    pid=client.post('/api/projects',json={'name':_u('QA Dup')}).json()['id']
    client.post('/api/imports/confirm',json={'project_id':pid,'sheets':[{'name':'H','songs':[
        {'name':'C','assignments':[
            {'person':nombre,'position':'Primera','mark':'X'},
            {'person':nombre,'position':'Bajo','mark':'X'}]}]}]})
    sid=client.get(f'/api/projects/{pid}').json()['songs'][0]['id']

    data=client.get(f'/api/songs/{sid}/suggestions').json()
    ids=[p['person_id'] for p in data['proposals']]
    assert len(ids)==len(set(ids)), 'las propuestas no pueden repetir persona'

    comp=client.post(f'/api/songs/{sid}/suggestions/apply',json={
        'proposals':data['proposals'],'marimba_plan':data.get('marimba_plan')}).json()
    pids=[e['personId'] for e in comp['data']['elements'] if e['type']=='person']
    assert len(pids)==len(set(pids)), 'la composicion no puede tener la misma persona dos veces'
    element_ids=[e['id'] for e in comp['data']['elements']]
    assert len(element_ids)==len(set(element_ids)), 'los ids de elemento deben ser unicos'

def test_distribution_without_previous_composition_uses_templates():
    pid,sid=_project_with_song([('QA X','Primera'),('QA Y','Primera'),
                                ('QA Z','Segunda'),('QA W','Bajo')])
    dist=client.get(f'/api/songs/{sid}/distribution-suggestion').json()
    assert dist['slot_source']=='templates'
    assert dist['marimbas_available'], 'debe proponer al menos una marimba'
    assert dist['assignments'], 'debe producir asignaciones sin composicion previa'
    assert not dist['unfulfilled_requirements'], dist['unfulfilled_requirements']

    comp=client.post(f'/api/songs/{sid}/distribution/apply',json={
        'proposals':dist['assignments'],'name':'Distribucion'}).json()
    els=comp['data']['elements']
    marimbas=[e for e in els if e['type']=='marimba']
    people=[e for e in els if e['type']=='person']
    assert len(marimbas)>=1
    assert len(people)==len(dist['assignments'])
    pids=[e['personId'] for e in people]
    assert len(pids)==len(set(pids))
    eids=[e['id'] for e in els]
    assert len(eids)==len(set(eids))
    # Cada persona sentada ocupa un unico puesto.
    slot_owners=[(e['marimbaId'],e['marimbaPositionId']) for e in people]
    assert len(slot_owners)==len(set(slot_owners))
    # Ningun puesto puede tener dos personas.
    for m in marimbas:
        occupied=[p['personId'] for p in m['positions'] if p['personId'] is not None]
        assert len(occupied)==len(set(occupied))

def test_distribution_prefers_previous_composition_when_available():
    # Dos canciones: la primera tiene composicion, la segunda debe reusarla.
    pid=client.post('/api/projects',json={'name':_u('QA Continuidad')}).json()['id']
    client.post('/api/projects/%d/songs'%pid,json={'name':'Cancion Uno'})
    client.post('/api/projects/%d/songs'%pid,json={'name':'Cancion Dos'})
    songs={s['name']:s['id'] for s in client.get(f'/api/projects/{pid}/songs').json()}

    # La primera cancion necesita musicos para poder proponer.
    client.post('/api/imports/confirm',json={'project_id':pid,'sheets':[{'name':'H','songs':[
        {'name':'Cancion Uno','assignments':[
            {'person':_u('QA U1'),'position':'Primera','mark':'X'},
            {'person':_u('QA U2'),'position':'Bajo','mark':'X'}]}]}]})
    songs={s['name']:s['id'] for s in client.get(f'/api/projects/{pid}/songs').json()}
    s1,s2=songs['Cancion Uno'],songs['Cancion Dos']

    # Cancion Dos sin participaciones: se agrega una para que haya que proponer.
    client.post('/api/imports/confirm',json={'project_id':pid,'sheets':[{'name':'H2','songs':[
        {'name':'Cancion Dos','assignments':[
            {'person':_u('QA D1'),'position':'Primera','mark':'X'}]}]}]})
    songs={s['name']:s['id'] for s in client.get(f'/api/projects/{pid}/songs').json()}
    s2=songs['Cancion Dos']

    dist1=client.get(f'/api/songs/{s1}/distribution-suggestion').json()
    assert dist1['slot_source']=='templates', 'sin composicion previa arranca de plantillas'
    client.post(f'/api/songs/{s1}/distribution/apply',json={
        'proposals':dist1['assignments'],'name':'Base'})

    # Ahora la cancion siguiente debe reusar los puestos reales de la primera.
    dist2=client.get(f'/api/songs/{s2}/distribution-suggestion').json()
    assert dist2['slot_source']=='composition', 'con composicion previa debe reusar sus puestos'
