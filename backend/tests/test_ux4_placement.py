"""UX-4: invariantes de colocacion y homonimos entre proyectos."""
import random
import pytest
from fastapi.testclient import TestClient
from app.main import app

client=TestClient(app)

@pytest.fixture(autouse=True)
def _restore_default_templates():
    """
    Estas pruebas vacian el catálogo global de plantillas para poder afirmar
    sobre la FORMA exacta de cada marimba. Al terminar se restaura calling a
    GET /marimba-templates, que recrea los DEFAULT_TEMPLATES si no hay ninguno,
    para no dejar el resto de la suite sin plantillas.
    """
    yield
    for t in client.get('/api/marimba-templates').json():
        client.delete(f"/api/marimba-templates/{t['id']}")
    client.get('/api/marimba-templates')

def _u(p):
    return f'{p} {random.randint(100000,999999)}'

# ------------------------------------------------- Homonimos entre proyectos

def test_same_name_can_exist_in_two_different_projects():
    """
    UX-4: `people.name` ya no tiene UNIQUE global. El chequeo scoped por proyecto
    de `POST /people` debe ser el unico que manda: el mismo nombre en OTRO
    proyecto es una persona distinta y debe poder crearse.
    """
    nombre=_u('QA Homonimo')
    a=client.post('/api/projects',json={'name':_u('QA Proy A')}).json()['id']
    b=client.post('/api/projects',json={'name':_u('QA Proy B')}).json()['id']

    ra=client.post('/api/people',json={'name':nombre,'project_id':a})
    rb=client.post('/api/people',json={'name':nombre,'project_id':b})
    assert ra.status_code==200, ra.text
    assert rb.status_code==200, rb.text
    assert ra.json()['id']!=rb.json()['id']

    # Dentro del mismo proyecto sigue siendo un duplicado.
    assert client.post('/api/people',json={'name':nombre,'project_id':a}).status_code==409
    # Sin project_id no hay ambito, asi que se exige unicidad global.
    assert client.post('/api/people',json={'name':nombre}).status_code==409
    # Un project_id inexistente se rechaza.
    assert client.post('/api/people',json={'name':_u('QA X'),'project_id':99999999}).status_code==404

# ------------------------------------------------- Ayudas de plantilla

def _template(name,positions):
    r=client.post('/api/marimba-templates',
                  json={'name':_u(name),'positions':positions})
    assert r.status_code==200, r.text
    return r.json()

def _song_with(positions_and_names):
    """Crea un proyecto con una cancion y devuelve (project_id, song_id)."""
    pid=client.post('/api/projects',json={'name':_u('QA Proy')}).json()['id']
    assignments=[{'person':n,'position':p,'mark':'X'} for p,n in positions_and_names]
    r=client.post('/api/imports/confirm',json={'project_id':pid,'sheets':[
        {'name':'H','songs':[{'name':'Cancion','assignments':assignments}]}]})
    assert r.status_code==200, r.text
    return pid, client.get(f'/api/projects/{pid}/songs').json()[0]['id']

def _drop_all_templates():
    """
    Aísla la prueba del resto. El catálogo de plantillas es GLOBAL y compartido,
    así que sin esto los `DEFAULT_TEMPLATES` (Primera/Segunda/Tercera...) ganarían
    la selección y las aserciones sobre la forma de la marimba no probarian nada.
    """
    for t in client.get('/api/marimba-templates').json():
        client.delete(f"/api/marimba-templates/{t['id']}")

def _apply(sid,name='QA'):
    body=client.get(f'/api/songs/{sid}/suggestions').json()
    comp=client.post(f'/api/songs/{sid}/suggestions/apply',json={
        'proposals':body['proposals'],'name':name,
        'marimba_plan':body['marimba_plan']}).json()
    return body, comp

# ------------------------------------------------- Puestos de plantilla

def test_suggestions_place_people_only_in_matching_template_slots():
    """
    UX-4: cada persona debe caer en un puesto cuyo tipo coincide EXACTAMENTE con
    su puesto musical, y dos personas nunca comparten el mismo puesto fisico.
    """
    _drop_all_templates()
    _template('QA Tenor',['Centro','Centro','Bajo'])
    nombres=[_u('QA M%d'%i) for i in range(3)]
    _,sid=_song_with([('Centro',nombres[0]),('Centro',nombres[1]),('Bajo',nombres[2])])

    _,comp=_apply(sid,'QA Slots')
    els=comp['data']['elements']
    marimbas=[e for e in els if e['type']=='marimba']
    people=[e for e in els if e['type']=='person']

    # Las marimbas conservan la forma de su plantilla (3 puestos, no mas).
    assert marimbas, 'debe haber marimbas de plantilla'
    for m in marimbas:
        assert len(m['positions'])==3, (
            f"{m['name']} tiene {len(m['positions'])} puestos, se esperaban 3")

    by_id={m['id']:m for m in marimbas}
    # Cada persona queda en un puesto de SU MISMO tipo musical.
    for pe in people:
        slot=next(p for p in by_id[pe['marimbaId']]['positions']
                  if p['id']==pe['marimbaPositionId'])
        assert slot['type']==pe['positionType'], (
            f"{pe['name']} ({pe['positionType']}) quedo en un puesto {slot['type']}")

    # Ningun puesto puede alojar a dos personas.
    occupied=[(e['marimbaId'],e['marimbaPositionId']) for e in people]
    assert len(occupied)==len(set(occupied)), 'dos personas comparten el mismo puesto'

    # Las dos "Centro" ocupan los DOS puestos Centro, no el mismo.
    centros=[e for e in people if e['positionType']=='Centro']
    assert len(centros)==2
    assert len({e['marimbaPositionId'] for e in centros})==2

def test_two_instances_of_same_template_are_not_merged():
    """
    UX-4: dos instancias de la misma plantilla comparten nombre. Agrupar por
    nombre las fusionaba en una marimba con el doble de puestos (el "tenor" con
    6 en vez de 3). Ahora cada instancia conserva su forma original.
    """
    _drop_all_templates()
    _template('QA Gemela',['Primera','Segunda'])
    nombres=[_u('QA G%d'%i) for i in range(4)]
    _,sid=_song_with([('Primera',nombres[0]),('Primera',nombres[1]),
                      ('Segunda',nombres[2]),('Segunda',nombres[3])])

    _,comp=_apply(sid,'QA Gemelas')
    marimbas=[e for e in comp['data']['elements'] if e['type']=='marimba']
    assert marimbas
    for m in marimbas:
        assert len(m['positions'])==2, (
            f"{m['name']} tiene {len(m['positions'])} puestos; las instancias de "
            'la plantilla se fusionaron en vez de repetirse')

def test_unplaced_people_are_reported_not_silently_misplaced():
    """
    UX-4: si las plantillas no cubren un puesto musical, esa persona se reporta
    en `unplaced` en vez de meterse en un puesto de otro tipo.
    """
    _drop_all_templates()
    _template('QA SoloPrimera',['Primera','Primera'])
    nombres=[_u('QA U%d'%i) for i in range(2)]
    _,sid=_song_with([('Bajo',nombres[0]),('Bajo',nombres[1])])

    body,_=_apply(sid,'QA Unplaced')
    sin_puesto={u['name'] for u in body['unplaced']}
    assert sin_puesto==set(nombres), body['unplaced']
    for p in body['proposals']:
        if p['name'] in sin_puesto:
            assert p['marimba_position_index']==-1, p

# ------------------------------------------------- Plantillas: gestion

def test_template_can_be_created_and_updated_from_the_dashboard():
    """UX-4: crear y editar plantillas desde la pantalla principal."""
    client.get('/api/marimba-templates')
    t=_template('QA Original',['Primera','Centro'])

    nuevo=_u('QA Editada')
    r=client.patch(f"/api/marimba-templates/{t['id']}",
                   json={'name':nuevo,'positions':['Bajo','Segunda','Centro']})
    assert r.status_code==200
    assert r.json()['name']==nuevo
    assert r.json()['positions']==['Bajo','Segunda','Centro']

    # Validaciones.
    assert client.patch(f"/api/marimba-templates/{t['id']}",
                        json={'name':'   '}).status_code==400
    assert client.patch(f"/api/marimba-templates/{t['id']}",
                        json={'positions':[]}).status_code==400
    assert client.patch('/api/marimba-templates/99999999',
                        json={'name':'X'}).status_code==404
    # No se puede renombrar a un nombre ya usado.
    other=_template('QA Ocupado',['Primera'])
    assert client.patch(f"/api/marimba-templates/{t['id']}",
                        json={'name':other['name']}).status_code==409

def test_updated_template_changes_subsequent_suggestions():
    """UX-4: editar una plantilla debe reflejarse en las propuestas siguientes."""
    _drop_all_templates()
    t=_template('QA Editable',['Primera','Primera','Primera','Primera'])
    _,sid=_song_with([('Primera',_u('QA R1'))])

    body,_=_apply(sid,'QA Antes')
    m=next(x for x in body['marimba_plan'] if x['id'].startswith(f'tpl{t["id"]}_'))
    assert m['positions']==['Primera']*4, m

    client.patch(f"/api/marimba-templates/{t['id']}",
                 json={'positions':['Primera','Segunda']})
    body2,_=_apply(sid,'QA Despues')
    m2=next(x for x in body2['marimba_plan'] if x['id'].startswith(f'tpl{t["id"]}_'))
    assert m2['positions']==['Primera','Segunda'], m2
