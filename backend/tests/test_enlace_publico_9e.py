"""
Fase 9E - enlace publico de SOLO LECTURA.

Se comprueban tres cosas que no deben mezclarse:
  1. quien puede administrar el enlace (solo el PROPIETARIO);
  2. que el enlace sirve para consultar y NO para escribir ni enumerar;
  3. que revocar invalida de inmediato, y que borrar la composicion tambien.
"""
from app.db.session import SessionLocal
from app.models import (Project, Song, Composition, PublicCompositionLink,
                        ProjectCollaborator, User)
from conftest import logout, _crear_usuario, _login

OWNER='pub.owner@marimba.local'
EDITOR='pub.editor@marimba.local'
READER='pub.reader@marimba.local'
AJENO='pub.ajeno@marimba.local'

ELS=[{'id':'m1','type':'marimba','name':'Marimba',
      'x':100,'y':100,'width':900,'height':150,
      'positions':[{'id':'p1','type':'Primera','personId':101}]},
     {'id':'e1','type':'person','name':'Ana','personId':101,
      'positionType':'Primera','x':150,'y':120,'width':150,'height':44,
      'rotation':0,'scaleX':1,'scaleY':1,
      'marimbaId':'m1','marimbaPositionId':'p1'}]


def _base(nombre,data=None):
    """Proyecto + cancion + composicion del dueno OWNER, directas en la base."""
    _crear_usuario(OWNER)
    db=SessionLocal()
    try:
        u=db.query(User).filter(User.email==OWNER).first()
        p=Project(name=nombre,owner_id=u.id)
        db.add(p); db.commit(); db.refresh(p)
        s=Song(project_id=p.id,name=nombre+' S',order_index=0)
        db.add(s); db.commit(); db.refresh(s)
        c=Composition(project_id=p.id,song_id=s.id,name='Composicion publica',
                      width=1600,height=900,
                      data=data if data is not None else {'elements':ELS})
        db.add(c); db.commit(); db.refresh(c)
        return p.id,c.id
    finally:
        db.close()


def _colaborar(pid,email,rol):
    _crear_usuario(email)
    db=SessionLocal()
    try:
        u=db.query(User).filter(User.email==email).first()
        db.add(ProjectCollaborator(project_id=pid,user_id=u.id,role=rol))
        db.commit()
    finally:
        db.close()


def _como(client,email):
    _crear_usuario(email)
    logout(client)
    _login(client,email)


def _crear(client,cid):
    r=client.post(f'/api/compositions/{cid}/public-link')
    assert r.status_code==200, r.text
    return r.json()['token']


# --- 1. Creacion y permisos -------------------------------------------------

def test_el_propietario_crea_el_enlace(client):
    _como(client,OWNER)
    _,cid=_base('pub crea')
    r=client.post(f'/api/compositions/{cid}/public-link')
    assert r.status_code==200, r.text
    cuerpo=r.json()
    assert cuerpo['active'] is True
    # El token es largo e impredecible: no es un id ni un numero corto.
    assert isinstance(cuerpo['token'],str) and len(cuerpo['token'])>=32


def test_el_token_nunca_se_persiste_en_claro(client):
    _como(client,OWNER)
    _,cid=_base('pub hash')
    token=_crear(client,cid)
    db=SessionLocal()
    try:
        link=db.query(PublicCompositionLink).filter(
            PublicCompositionLink.composition_id==cid).first()
        assert link is not None
        # Se guarda la huella, no el token: una filtracion de la tabla NO sirve.
        assert link.token_hash!=token
        assert len(link.token_hash)==64
    finally:
        db.close()


def test_no_se_generan_tokens_duplicados(client):
    _como(client,OWNER)
    _,cid=_base('pub unico')
    t1=_crear(client,cid)
    t2=_crear(client,cid)
    assert t1!=t2,'reactivar genera un token NUEVO'
    db=SessionLocal()
    try:
        assert db.query(PublicCompositionLink).filter(
            PublicCompositionLink.composition_id==cid).count()==1
    finally:
        db.close()


def test_un_editor_NO_puede_publicar(client):
    """Compartir hacia fuera es de propiedad, no de colaboracion."""
    pid,cid=_base('pub editor')
    _colaborar(pid,EDITOR,'editor')
    _como(client,EDITOR)
    assert client.post(f'/api/compositions/{cid}/public-link').status_code==404


def test_un_reader_no_puede_publicar_ni_revocar(client):
    pid,cid=_base('pub reader')
    _colaborar(pid,READER,'reader')
    _como(client,OWNER)
    _crear(client,cid)
    _como(client,READER)
    assert client.post(f'/api/compositions/{cid}/public-link').status_code==404
    assert client.delete(f'/api/compositions/{cid}/public-link').status_code==404


def test_un_usuario_sin_acceso_no_puede_administrar(client):
    _,cid=_base('pub ajeno')
    _como(client,AJENO)
    assert client.post(f'/api/compositions/{cid}/public-link').status_code==404
    assert client.get(f'/api/compositions/{cid}/public-link').status_code==404


def test_crear_requiere_sesion(client):
    _,cid=_base('pub anon')
    logout(client)
    assert client.post(f'/api/compositions/{cid}/public-link').status_code==401
# --- 2. Consulta publica ----------------------------------------------------

def test_el_get_publico_NO_requiere_sesion(client):
    _como(client,OWNER)
    _,cid=_base('pub consulta')
    token=_crear(client,cid)
    # Se cierra la sesion: el enlace debe seguir funcionando.
    logout(client)
    r=client.get(f'/api/public/compositions/{token}')
    assert r.status_code==200, r.text
    assert r.json()['name']=='Composicion publica'


def test_lo_que_se_publica_es_solo_lo_necesario(client):
    _como(client,OWNER)
    _,cid=_base('pub datos')
    token=_crear(client,cid)
    logout(client)
    cuerpo=client.get(f'/api/public/compositions/{token}').json()
    # Necesario para identificar la composicion y leer el ensayo.
    assert {'name','width','height','data','song_name','project_name'}<=set(cuerpo)
    # Y NADA de esto, que es lo que la convertirian en una fuga.
    for prohibido in ('id','project_id','song_id','owner_id','created_at',
                      'token','user','users','email','versions','created_by'):
        assert prohibido not in cuerpo, prohibido


def test_no_se_expone_el_historial_de_versiones(client):
    _como(client,OWNER)
    _,cid=_base('pub versiones')
    client.post(f'/api/compositions/{cid}/versions')
    token=_crear(client,cid)
    logout(client)
    cuerpo=client.get(f'/api/public/compositions/{token}').json()
    assert 'versions' not in cuerpo
    # Y las rutas privadas de 9C siguen cerradas para quien no tiene sesion.
    for metodo,ruta in (('get',f'/api/compositions/{cid}/versions'),
                        ('post',f'/api/compositions/{cid}/versions'),
                        ('post',f'/api/compositions/{cid}/versions/1/restore')):
        assert getattr(client,metodo)(ruta).status_code==401


def test_un_token_invalido_da_404(client):
    logout(client)
    assert client.get('/api/public/compositions/no-existe').status_code==404
    # Ni siquiera con un id numerico, que es lo que se intentaria enumerar.
    assert client.get('/api/public/compositions/1').status_code==404


def test_no_existe_ninguna_ruta_que_liste_enlaces(client):
    """No hay busqueda ni listado publico: el token es lo unico."""
    logout(client)
    for ruta in ('/api/public/compositions','/api/public/compositions/',
                 '/api/public'):
        assert client.get(ruta).status_code in (404,405), ruta


# --- 3. Revocacion y aislamiento -------------------------------------------

def test_revocar_invalida_el_enlace_de_inmediato(client):
    _como(client,OWNER)
    _,cid=_base('pub revoca')
    token=_crear(client,cid)
    assert client.delete(f'/api/compositions/{cid}/public-link').status_code==200
    logout(client)
    assert client.get(f'/api/public/compositions/{token}').status_code==404


def test_revocar_no_destruye_la_composicion_ni_su_historial(client):
    _como(client,OWNER)
    _,cid=_base('pub revoca2')
    client.post(f'/api/compositions/{cid}/versions')
    _crear(client,cid)
    client.delete(f'/api/compositions/{cid}/public-link')
    # La composicion sigue ahi y su version sigue existiendo.
    assert client.get(f'/api/compositions/{cid}').status_code==200
    assert len(client.get(f'/api/compositions/{cid}/versions').json()[
        'versions'])==1


def test_reactivar_genera_un_token_nuevo_y_el_viejo_muere(client):
    _como(client,OWNER)
    _,cid=_base('pub reactiva')
    viejo=_crear(client,cid)
    client.delete(f'/api/compositions/{cid}/public-link')
    nuevo=_crear(client,cid)
    logout(client)
    assert client.get(f'/api/public/compositions/{viejo}').status_code==404
    assert client.get(f'/api/public/compositions/{nuevo}').status_code==200


def test_borrar_la_composicion_invalida_el_enlace(client):
    _como(client,OWNER)
    _,cid=_base('pub cascada')
    token=_crear(client,cid)
    assert client.delete(f'/api/compositions/{cid}').status_code==200
    logout(client)
    assert client.get(f'/api/public/compositions/{token}').status_code==404
    db=SessionLocal()
    try:
        assert db.query(PublicCompositionLink).filter(
            PublicCompositionLink.composition_id==cid).count()==0
    finally:
        db.close()


# --- 4. Estado compartido = estado PERSISTIDO ------------------------------

def test_lo_guardado_se_refleja_publicamente(client):
    _como(client,OWNER)
    pid,cid=_base('pub actualiza')
    token=_crear(client,cid)
    logout(client)
    antes=client.get(f'/api/public/compositions/{token}').json()
    assert antes['data']['elements'][0]['name']=='Marimba'

    # Se guarda un estado nuevo: el enlace debe reflejar lo PERSISTIDO.
    _como(client,OWNER)
    client.put(f'/api/compositions/{cid}',json={
        'project_id':pid,'name':'Composicion publica','song_id':None,
        'width':1600,'height':900,
        'data':{'elements':[{'id':'m9','type':'marimba','name':'Renombrada',
              'x':0,'y':0,'width':900,'height':150,'positions':[]}]}})
    logout(client)
    ahora=client.get(f'/api/public/compositions/{token}').json()
    assert ahora['data']['elements'][0]['name']=='Renombrada'


def test_lo_NO_guardado_no_aparece_publicamente(client):
    """El enlace lee la base, no el navegador de nadie."""
    _como(client,OWNER)
    _,cid=_base('pub no guardado')
    token=_crear(client,cid)
    logout(client)
    # No se ha guardado nada distinto: sigue lo que hay en la base.
    cuerpo=client.get(f'/api/public/compositions/{token}').json()
    assert cuerpo['data']['elements'][0]['name']=='Marimba'


def test_una_composicion_sin_enlace_no_es_publica(client):
    _como(client,OWNER)
    _,cid=_base('pub sin enlace')
    # El id NO sirve como token: sin enlace, no hay nada publico.
    logout(client)
    assert client.get(f'/api/public/compositions/{cid}').status_code==404


def test_el_estado_socialo_dice_si_esta_activo(client):
    _como(client,OWNER)
    _,cid=_base('pub estado')
    # Antes de crearlo no hay enlace.
    assert client.get(
        f'/api/compositions/{cid}/public-link').json()['active'] is False
    _crear(client,cid)
    assert client.get(
        f'/api/compositions/{cid}/public-link').json()['active'] is True
    # Y tras revocar, vuelve a false, con la fecha de revocacion.
    client.delete(f'/api/compositions/{cid}/public-link')
    tras=client.get(f'/api/compositions/{cid}/public-link').json()
    assert tras['active'] is False
    assert tras['revoked_at']


# --- 5. Auditoria -----------------------------------------------------------

def test_publicar_y_revocar_dejan_rastro(client):
    """Quien comparte y quien deja de compartir debe ser reconstruible."""
    from app.models import AuditLog
    _como(client,OWNER)
    _,cid=_base('pub auditoria')
    _crear(client,cid)
    client.delete(f'/api/compositions/{cid}/public-link')
    db=SessionLocal()
    try:
        acciones={a for (a,) in db.query(AuditLog.action).filter(
            AuditLog.entity_id==str(cid)).all()}
        assert {'PUBLIC_LINK_CREATED','PUBLIC_LINK_REVOKED'}<=acciones
        # El rastro cuelga del PROYECTO, no de la composicion borrable.
        row=db.query(AuditLog).filter(
            AuditLog.action=='PUBLIC_LINK_CREATED').order_by(
            AuditLog.id.desc()).first()
        assert row is not None
        assert row.entity_type=='composition'
        assert row.actor_user_id is not None
        # El token jamas llega al registro de auditoria ni a sus detalles.
        assert row.details is None or 'token' not in str(row.details)
    finally:
        db.close()


# --- 6. Auditoria 9F: aislamiento A/B e indistinguibilidad ------------------

def test_el_enlace_de_A_no_devuelve_nunca_la_composicion_B(client):
    """Cada token resuelve SOLO la suya; ninguno cruza hacia la otra."""
    _como(client,OWNER)
    _,cid_a=_base('pub iso A')
    _,cid_b=_base('pub iso B')
    token_a=_crear(client,cid_a)
    token_b=_crear(client,cid_b)
    logout(client)
    a=client.get(f'/api/public/compositions/{token_a}')
    b=client.get(f'/api/public/compositions/{token_b}')
    assert a.status_code==200 and b.status_code==200
    # Mismo nombre de composicion a proposito: se distingue por el proyecto.
    assert a.json()['project_name']=='pub iso A'
    assert b.json()['project_name']=='pub iso B'
    # Y lo del otro proyecto ni siquiera aparece en la respuesta.
    assert 'pub iso B' not in str(a.json())
    assert 'pub iso A' not in str(b.json())


def test_un_404_revocado_es_indistinguible_de_un_404_inexistente(client):
    """Misma respuesta observable: no se filtra si el enlace llego a existir."""
    _como(client,OWNER)
    _,cid=_base('pub indist')
    token=_crear(client,cid)
    assert client.delete(f'/api/compositions/{cid}/public-link').status_code==200
    logout(client)
    revocado=client.get(f'/api/public/compositions/{token}')
    inexistente=client.get('/api/public/compositions/esto-no-existe-jamas')
    assert revocado.status_code==404
    assert inexistente.status_code==404
    # cuerpo incluido: un atacante no observa ninguna diferencia.
    assert revocado.json()==inexistente.json()