from fastapi.testclient import TestClient
from app.main import app
from app.services.suggestions.requirements import compare_requirements, get_composition_capacity, get_song_requirements_report

client=TestClient(app)

def _project(name):
    r=client.post('/api/projects',json={'name':name})

    assert r.status_code==200

    return r.json()['id']

def _song(pid,name,counts):
    """Crear una cancion con asignaciones reales (misma via que el Excel)."""
    assignments=[]
    i=0

    for pos,qty in counts.items():
        for _ in range(qty):
            i+=1
            assignments.append({'person':f'{name} {pos} {i}','position':pos,'mark':'X'})

    payload={'project_id':pid,'sheets':[{'name':'Hoja1','songs':[
        {'name':name,'assignments':assignments}]}]}
    r=client.post('/api/imports/confirm',json=payload)

    assert r.status_code==200

    proj=client.get(f'/api/projects/{pid}').json()

    return [s for s in proj['songs'] if s['name']==name][0]['id']

def _marimba(mid,name,types):
    return {'id':mid,'type':'marimba','name':name,'x':0,'y':0,'width':380,'height':150,
            'rotation':0,'scaleX':1,'scaleY':1,
            'positions':[{'id':f'{mid}_p{i}','type':t,'personId':None}
                         for i,t in enumerate(types)]}

def _composition(pid,sid,name,elements):
    r=client.post('/api/compositions',json={'project_id':pid,'song_id':sid,
                                            'name':name,'data':{'elements':elements}})

    assert r.status_code==200

    return r.json()['id']

def _report(sid,composition_id=None):
    url=f'/api/songs/{sid}/requirements'

    if composition_id is not None:
        url+=f'?composition_id={composition_id}'

    r=client.get(url)

    assert r.status_code==200

    return r.json()

def _by_type(rep):
    return {x['position_type']:x for x in rep['requirements']}

def test_r01_requisitos_completos():
    pid=_project('Req 01 completa')
    sid=_song(pid,'Cancion completa',{'Primera':2,'Segunda':1,'Bajo':1})
    _composition(pid,sid,'Comp completa',[
        _marimba('mA','Marimba A',['Primera','Primera','Segunda','Bajo'])])

    rep=_report(sid)
    rows=_by_type(rep)

    assert rep['complete'] is True
    assert rep['totals']=={'required':4,'available':4,'missing':0}
    assert {r['status'] for r in rep['requirements']}=={'covered'}
    assert rows['Primera']['available']==2
    assert rows['Bajo']['missing']==0

def test_r02_requisito_parcialmente_cubierto():
    pid=_project('Req 02 parcial')
    sid=_song(pid,'Cancion parcial',{'Primera':4,'Bajo':1})
    _composition(pid,sid,'Comp parcial',[
        _marimba('mA','Marimba A',['Primera','Primera','Bajo'])])

    rep=_report(sid)
    rows=_by_type(rep)

    assert rep['complete'] is False
    assert rows['Primera']['required']==4
    assert rows['Primera']['available']==2
    assert rows['Primera']['missing']==2
    assert rows['Primera']['status']=='partial'
    assert rows['Bajo']['status']=='covered'
    assert rep['totals']=={'required':5,'available':3,'missing':2}

def test_r03_requisito_completamente_faltante():
    pid=_project('Req 03 faltante')
    sid=_song(pid,'Cancion faltante',{'Bajo':2,'Primera':1})
    _composition(pid,sid,'Comp sin bajo',[
        _marimba('mA','Marimba A',['Primera'])])

    rep=_report(sid)
    rows=_by_type(rep)

    assert rep['complete'] is False
    assert rows['Bajo']['available']==0
    assert rows['Bajo']['missing']==2
    assert rows['Bajo']['status']=='missing'
    assert rows['Primera']['status']=='covered'
    assert rep['totals']['missing']==2

def test_r04_varios_tipos_de_puestos():
    pid=_project('Req 04 varios tipos')
    sid=_song(pid,'Cancion variada',{'Primera':2,'Segunda':1,'Bajo':1,'Centro':1})
    _composition(pid,sid,'Comp variada',[
        _marimba('mA','Marimba A',['Primera','Primera','Segunda','Centro','Bajo'])])

    rep=_report(sid)

    assert rep['complete'] is True
    assert len(rep['requirements'])==4
    assert rep['totals']=={'required':5,'available':5,'missing':0}
    assert rep['position_counts']=={'Bajo':1,'Centro':1,'Primera':2,'Segunda':1}

def test_r05_marimba_con_posiciones_dinamicas():
    pid=_project('Req 05 dinamica')
    sid=_song(pid,'Cancion dinamica',{'Primera':5})
    cid=_composition(pid,sid,'Comp 6 primeras',[
        _marimba('mX','Marimba X',['Primera']*6)])

    rep=_report(sid,cid)
    rows=_by_type(rep)

    assert rows['Primera']['available']==6
    assert rows['Primera']['missing']==0
    assert rows['Primera']['status']=='covered'
    assert rep['complete'] is True

def test_r06_composicion_5_primeras_aunque_template_tenga_4():
    pid=_project('Req 06 template vs composicion')
    sid=_song(pid,'Cancion cinco primeras',{'Primera':5})
    tpl=[t for t in client.get('/api/marimba-templates').json()
         if t['name']=='Marimba grande'][0]

    assert len(tpl['positions'])==4
    assert tpl['positions'].count('Primera')==2

    tipos=tpl['positions']+['Primera','Primera','Primera']
    cid=_composition(pid,sid,'Comp con 5 primeras',[_marimba('mG','Marimba grande',tipos)])
    rep=_report(sid,cid)
    rows=_by_type(rep)
    after=[t for t in client.get('/api/marimba-templates').json()
           if t['name']=='Marimba grande'][0]

    assert rows['Primera']['available']==5
    assert rep['complete'] is True
    assert len(after['positions'])==4

def test_r07_composicion_sin_marimbas():
    pid=_project('Req 07 sin marimbas')
    sid=_song(pid,'Cancion sin marimbas',{'Primera':2,'Bajo':1})
    cid=_composition(pid,sid,'Comp vacia',[])

    rep=_report(sid,cid)

    assert rep['complete'] is False
    assert rep['totals']=={'required':3,'available':0,'missing':3}
    assert {r['status'] for r in rep['requirements']}=={'missing'}
    assert rep['extra_capacity']==[]

def test_r08_cancion_inexistente():
    r=client.get('/api/songs/999999/requirements')

    assert r.status_code==404

def test_r09_tipos_de_posiciones_dinamicos():
    pid=_project('Req 09 tipos dinamicos')
    sid=_song(pid,'Cancion nuevos tipos',{'Contrabajo':2,'Percusion':1})
    templ=client.get('/api/marimba-templates').json()

    assert all('Contrabajo' not in t['positions'] for t in templ)

    cid=_composition(pid,sid,'Comp nuevos tipos',[
        _marimba('mN','Marimba nueva',['Contrabajo','Contrabajo','Percusion'])])
    rep=_report(sid,cid)
    rows=_by_type(rep)

    assert rep['complete'] is True
    assert rows['Contrabajo']['available']==2
    assert rows['Percusion']['available']==1

def test_r10_compatibilidad_con_datos_existentes():
    pid=_project('Req 10 compatibilidad')
    sid=_song(pid,'Cancion compat',{'Primera':1,'Bajo':1})
    sin_req_sid=_song(pid,'Cancion sin requisitos',{})
    comp=_composition(pid,sid,'Comp compat',[
        _marimba('mA','Marimba A',['Primera','Bajo'])])
    rep=_report(sid,comp)

    assert rep['position_counts']=={'Bajo':1,'Primera':1}
    assert rep['song_id']==sid
    assert rep['song_name']=='Cancion compat'
    assert rep['has_requirements'] is True

    vac=_report(sin_req_sid)

    assert vac['position_counts']=={}
    assert vac['requirements']==[]
    assert vac['has_requirements'] is False
    assert vac['complete'] is True
    assert vac['capacity_source']=='sin_composicion'
    assert vac['composition_id'] is None

    sin_comp=_report(sid)

    assert sin_comp['composition_id']==comp
    assert get_composition_capacity(None)=={}
    assert get_song_requirements_report

def test_r11_usa_la_composicion_indicada():
    pid=_project('Req 11 composicion indicada')
    sid=_song(pid,'Cancion dos composiciones',{'Primera':5})
    cid_a=_composition(pid,sid,'Comp A dos primeras',
                       [_marimba('mA','Marimba A',['Primera','Primera'])])
    cid_b=_composition(pid,sid,'Comp B cinco primeras',
                       [_marimba('mB','Marimba B',['Primera']*5)])
    por_defecto=_report(sid)
    explicita=_report(sid,cid_a)

    assert por_defecto['composition_id']==cid_b
    assert por_defecto['complete'] is True
    assert explicita['composition_id']==cid_a
    assert explicita['complete'] is False
    assert _by_type(explicita)['Primera']['missing']==3

def test_r12_composicion_invalida_o_de_otra_cancion():
    pid=_project('Req 12 composicion invalida')
    sid=_song(pid,'Cancion origen',{'Primera':1})
    otra_sid=_song(pid,'Cancion destino',{'Primera':1})
    cid=_composition(pid,sid,'Comp origen',[_marimba('mA','Marimba A',['Primera'])])

    assert client.get(f'/api/songs/{sid}/requirements?composition_id=999999').status_code==404
    assert client.get(f'/api/songs/{otra_sid}/requirements?composition_id={cid}').status_code==400

def test_r13_capacidad_suma_varias_marimbas():
    pid=_project('Req 13 varias marimbas')
    sid=_song(pid,'Luna de Xelaju',{'Primera':5,'Segunda':2,'Bajo':1})
    cid=_composition(pid,sid,'Luna - Ensayo',[
        _marimba('mA','Marimba A',['Primera','Primera','Segunda','Bajo']),
        _marimba('mB','Marimba B',['Primera','Segunda'])])
    rep=_report(sid,cid)
    rows=_by_type(rep)

    assert rep['totals']=={'required':8,'available':6,'missing':2}
    assert rep['complete'] is False
    assert rows['Primera']['available']==3 and rows['Primera']['missing']==2
    assert rows['Primera']['status']=='partial'
    assert rows['Segunda']['status']=='covered'
    assert rows['Bajo']['status']=='covered'
    assert rep['capacity_source']=='composition'

def test_r14_compare_requirements_es_pura():
    filas=compare_requirements({'Primera':3,'Bajo':1,'Centro':2},
                               {'Primera':5,'Centro':1})

    assert [f['position_type'] for f in filas]==['Primera','Centro','Bajo']
    assert filas[0]=={'position_type':'Primera','required':3,'available':5,
                      'missing':0,'status':'covered'}
    assert filas[1]['status']=='partial' and filas[1]['missing']==1
    assert filas[2]['status']=='missing' and filas[2]['available']==0
    assert compare_requirements({},{})==[]

def test_r15_capacidad_ignora_datos_malformados():
    pid=_project('Req 15 datos malformados')
    sid=_song(pid,'Cancion malformada',{'Primera':1})
    r=client.post('/api/compositions',json={'project_id':pid,'song_id':sid,
        'name':'Comp rara','data':{'elements':[
            'no-es-dict',
            {'type':'person','id':'person_1'},
            {'type':'marimba','id':'mZ','name':'Marimba Z','positions':None},
            {'type':'marimba','id':'mY','name':'Marimba Y',
             'positions':['x',{'id':'y0','type':'Primera'},{}]}]}})

    assert r.status_code==200

    rep=_report(sid,r.json()['id'])
    rows=_by_type(rep)

    assert rows['Primera']['available']==1
    assert rep['complete'] is True

def test_r16_no_modifica_composicion_ni_asignaciones():
    pid=_project('Req 16 no modifica nada')
    sid=_song(pid,'Cancion intacta',{'Primera':3})
    cid=_composition(pid,sid,'Comp intacta',[
        _marimba('mA','Marimba A',['Primera'])])
    antes=client.get(f'/api/compositions/{cid}').json()
    song_antes=client.get(f'/api/songs/{sid}').json()
    rep=_report(sid,cid)
    despues=client.get(f'/api/compositions/{cid}').json()
    song_despues=client.get(f'/api/songs/{sid}').json()

    assert rep['complete'] is False
    assert _by_type(rep)['Primera']['missing']==2
    assert despues['data']==antes['data']
    assert len(despues['data']['elements'])==1
    assert len(despues['data']['elements'][0]['positions'])==1
    assert song_despues['assignments']==song_antes['assignments']
    assert len(song_despues['compositions'])==1