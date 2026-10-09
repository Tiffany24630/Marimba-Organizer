"""
Fase 9I - listado AGREGADO de enlaces publicos del PROPIETARIO.

Se comprueban las cuatro cosas que no deben mezclarse:
  1. el propietario AUDITA todos sus enlaces de una vista (9I-B01);
  2. el aislamiento ocurre EN la consulta: nadie ve enlaces ajenos (B02/B09);
  3. los estados se DERIVAN de datos existentes con la semantica 9G
     (active/expired/revoked, con precedencia de REVOCADO sobre EXPIRADO);
  4. la respuesta no expone token, huella ni ids internos.

Los proyectos se nombran con un prefijo unico por prueba: el listado es
AGREGADO, asi que un conteo global se contaminaria con los enlaces que las
suites 9E/9G dejaron para el mismo propietario. Se asierte sobre «esta hay».
"""
from datetime import datetime, timedelta, timezone
import json

from app.db.session import SessionLocal
from app.models import (Project, Composition, PublicCompositionLink, User)
from conftest import logout, _crear_usuario, _login
from test_enlace_publico_9e import _base, _colaborar, _como, _crear
from test_enlace_publico_9e import OWNER, EDITOR, READER, AJENO
from test_caducidad_9g import _vencer_en_base

OWNER_B='pub.owner2@marimba.local'


def _proyecto_de(email,nombre):
    """Proyecto + composicion PROPIOS de `email` (para el aislamiento A/B)."""
    _crear_usuario(email)
    db=SessionLocal()
    try:
        u=db.query(User).filter(User.email==email).first()
        p=Project(name=nombre,owner_id=u.id)
        db.add(p); db.commit(); db.refresh(p)
        c=Composition(project_id=p.id,name='Comp '+nombre,
                      width=1600,height=900,data={'elements':[]})
        db.add(c); db.commit(); db.refresh(c)
        return p.id,c.id
    finally:
        db.close()


def _items(client):
    """El listado tal cual llega al frontend."""
    r=client.get('/api/public-links')
    assert r.status_code==200, r.text
    return r.json()


def _de(client,nombre_proyecto):
    """Items del listado que pertenecen a UN proyecto (por nombre unico)."""
    return [x for x in _items(client)
            if x['project_name']==nombre_proyecto]


# --- 1. El propietario audita sus enlaces -----------------------------------

def test_9i_b01_el_propietario_obtiene_sus_enlaces(client):
    _como(client,OWNER)
    _,cid=_base('9i b01')
    _crear(client,cid)
    filas=_de(client,'9i b01')
    assert len(filas)==1, filas
    f=filas[0]
    assert f['composition_name']=='Composicion publica'
    assert f['status']=='active'
    assert f['created_at'] is not None
    assert f['expires_at'] is None
    assert f['revoked_at'] is None


def test_9i_b03_composicion_sin_enlace_no_aparece(client):
    _como(client,OWNER)
    pid,cid=_base('9i b03')
    _crear(client,cid)
    # Segunda composicion del MISMO proyecto, sin enlace: no genera fila.
    db=SessionLocal()
    try:
        otra=Composition(project_id=pid,name='Sin enlace',width=1600,
                         height=900,data={'elements':[]})
        db.add(otra); db.commit()
    finally:
        db.close()
    assert len(_de(client,'9i b03'))==1


# --- 2. Estados derivados (semantica 9G, sin duplicar logica) ---------------

def test_9i_b04_activo_sin_caducidad(client):
    _como(client,OWNER)
    _,cid=_base('9i b04')
    _crear(client,cid)
    assert _de(client,'9i b04')[0]['status']=='active'


def test_9i_b05_activo_con_expiracion_futura(client):
    _como(client,OWNER)
    _,cid=_base('9i b05')
    futura=(datetime.now(timezone.utc)+timedelta(hours=48)).isoformat()
    r=client.post(f'/api/compositions/{cid}/public-link',
                  json={'expires_at':futura})
    assert r.status_code==200, r.text
    f=_de(client,'9i b05')[0]
    assert f['status']=='active'
    assert f['expires_at'] is not None


def test_9i_b06_expirado(client):
    _como(client,OWNER)
    _,cid=_base('9i b06')
    _crear(client,cid)
    _vencer_en_base(cid,datetime.now(timezone.utc)-timedelta(seconds=5))
    assert _de(client,'9i b06')[0]['status']=='expired'


def test_9i_b07_revocado(client):
    _como(client,OWNER)
    _,cid=_base('9i b07')
    _crear(client,cid)
    r=client.delete(f'/api/compositions/{cid}/public-link')
    assert r.status_code==200, r.text
    f=_de(client,'9i b07')[0]
    assert f['status']=='revoked'
    assert f['revoked_at'] is not None


def test_9i_b08_revocado_tiene_precedencia_sobre_expirado(client):
    """Con `revoked_at` y `expires_at` vencidos a la vez → REVOCADA (9I §9)."""
    _como(client,OWNER)
    _,cid=_base('9i b08')
    _crear(client,cid)
    _vencer_en_base(cid,datetime.now(timezone.utc)-timedelta(seconds=5))
    r=client.delete(f'/api/compositions/{cid}/public-link')
    assert r.status_code==200, r.text
    assert _de(client,'9i b08')[0]['status']=='revoked'


# --- 3. Aislamiento ----------------------------------------------------------

def test_9i_b02_cada_propietario_ve_lo_suyo_y_nada_mas(client):
    _como(client,OWNER)
    _,cida=_base('9i b02 a')
    _crear(client,cida)
    _,cidb=_proyecto_de(OWNER_B,'9i b02 b')
    _como(client,OWNER_B)
    _crear(client,cidb)

    _como(client,OWNER_B)
    assert _de(client,'9i b02 b'),'B ve su enlace'
    assert not _de(client,'9i b02 a'),'B NO ve el de A'

    _como(client,OWNER)
    assert _de(client,'9i b02 a'),'A ve su enlace'
    assert not _de(client,'9i b02 b'),'A NO ve el de B'


def test_9i_b09_editor_lector_y_ajeno_no_reciben_enlaces_ajenos(client):
    _como(client,OWNER)
    pid,cid=_base('9i b09')
    _crear(client,cid)
    _colaborar(pid,EDITOR,'editor')
    _colaborar(pid,READER,'reader')
    for quien in (EDITOR,READER,AJENO):
        _como(client,quien)
        assert not _de(client,'9i b09'), quien
        # Ni siquiera el PROYECTO ajeno se refleja en el listado.
        assert all(x['project_name']!='9i b09' for x in _items(client))


def test_9i_sin_sesion_responde_401(client):
    _como(client,OWNER)
    _,cid=_base('9i anon')
    _crear(client,cid)
    logout(client)
    assert client.get('/api/public-links').status_code==401


# --- 4. La respuesta no expone secretos -------------------------------------

def test_9i_b10_la_respuesta_no_expone_secretos_ni_ids(client):
    _como(client,OWNER)
    _,cid=_base('9i b10')
    _crear(client,cid)
    r=client.get('/api/public-links')
    assert r.status_code==200, r.text
    filas=_de(client,'9i b10')
    assert len(filas)==1
    # Contrato EXACTO: ni un campo mas (sin token, hash, ids ni auditoria).
    assert set(filas[0].keys())=={'project_name','composition_name',
                                  'created_at','expires_at','revoked_at',
                                  'status'}
    # El listado es agregado: solo la fila de ESTE proyecto se audita por
    # secretos (otras suites 9E dejan filas con nombres como «pub hash»).
    texto=json.dumps(filas,ensure_ascii=False).lower()
    for prohibido in ('token','hash','user_id','composition_id','project_id',
                      'password','owner_id','audit'):
        assert prohibido not in texto, prohibido
    assert filas[0]['status'] in {'active','expired','revoked'}


# --- 5. UTC, cascada y orden -------------------------------------------------

def test_9i_b11_expiracion_utc_naive_se_interpreta_como_utc(client):
    """SQLite devuelve naive; `_aware` (9G) lo trata como UTC, sin duplicar."""
    _como(client,OWNER)
    _,cid=_base('9i b11')
    _crear(client,cid)
    naive=(datetime.now(timezone.utc)-timedelta(seconds=5)).replace(
        tzinfo=None)
    _vencer_en_base(cid,naive)
    assert _de(client,'9i b11')[0]['status']=='expired'


def test_9i_b12_composicion_borrada_no_deja_enlaces_huerfanos(client):
    _como(client,OWNER)
    _,cid=_base('9i b12')
    _crear(client,cid)
    r=client.delete(f'/api/compositions/{cid}')
    assert r.status_code==200, r.text
    assert not _de(client,'9i b12'),'el enlace desaparece con la composicion'
    db=SessionLocal()
    try:
        assert db.query(PublicCompositionLink).filter(
            PublicCompositionLink.composition_id==cid).count()==0
    finally:
        db.close()


def test_9i_orden_estable_por_fecha_de_creacion_desc(client):
    _como(client,OWNER)
    _,cid1=_base('9i orden 1')
    _crear(client,cid1)
    _,cid2=_base('9i orden 2')
    _crear(client,cid2)
    filas=_items(client)
    nombres=[x['project_name'] for x in filas]
    # El mas reciente primero; con timestamps identicos desempata el id.
    assert nombres.index('9i orden 2')<nombres.index('9i orden 1'), nombres

