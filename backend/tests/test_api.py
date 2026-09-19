from fastapi.testclient import TestClient
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
