"""
Fase 7C - pruebas de seguridad: autenticacion, aislamiento, CSRF, admin y
recuperacion de contrasena.

Todas usan usuarios AISLADOS creados aqui. No tocan la base real: corren
contra `test_marimba.db`, que `conftest.py` borra al arrancar.
"""
import pytest

from app.core.security import (hash_password, verify_password, new_token,
                               token_fingerprint, password_problem)
from app.db.session import SessionLocal
from app.models import User, Project, Song, Composition
from conftest import TEST_PASSWORD, logout, sin_csrf, con_csrf


# --- Utilidades de contrasenas (sin base de datos) -----------------------

def test_el_hash_nunca_contains_la_contrasena():
    h = hash_password('ClaveMuySecreta1')
    assert 'ClaveMuySecreta1' not in h
    assert h.startswith('pbkdf2_sha256$')
    assert verify_password('ClaveMuySecreta1', h)
    assert not verify_password('otra', h)


def test_la_sal_es_aleatoria_por_usuario():
    a = hash_password('MismaClave123')
    b = hash_password('MismaClave123')
    assert a != b, 'dos usuarios con la misma clave deben tener hashes distintos'


def test_verify_no_revienta_con_hash_corrupto():
    assert verify_password('x', 'no-es-un-hash') is False
    assert verify_password('', hash_password('Algo123456')) is False


def test_validacion_de_contrasena():
    # Corta.
    assert password_problem('Corta1') == 'La contrasena debe tener al menos 10 caracteres.'
    # Sin digitos.
    assert password_problem('Sololetraslargas') is not None
    # Sin letras: solo digitos.
    assert password_problem('12345678901') is not None
    # Valida: >=10, con letra y con digito.
    assert password_problem('Valida12345') is None
    # No es una cadena: se rechaza sin romperse.
    assert password_problem(None) is not None
    assert password_problem(12345678901) is not None


def test_el_token_se_guarda_solo_como_huella():
    t = new_token()
    assert token_fingerprint(t) != t
    assert len(token_fingerprint(t)) == 64


# --- Autenticacion -------------------------------------------------------

def test_login_correcto_devuelve_usuario_sin_hash(client, user_a):
    r = client.get('/api/auth/me')
    assert r.status_code == 200
    u = r.json()['user']
    assert u['email'] == user_a
    assert u['role'] == 'user'
    # Nunca se devuelve el hash ni la contrasena.
    assert 'password_hash' not in u
    assert 'password' not in u


def test_login_con_contrasena_incorrecta_falla(client, user_a):
    r = client.post('/api/auth/login',
                    json={'email': user_a, 'password': 'incorrecta999'})
    assert r.status_code == 401


def test_login_de_usuario_inexistente_da_el_mismo_error(client):
    logout(client)
    r = client.post('/api/auth/login',
                    json={'email': 'nadie@ejemplo.com', 'password': 'loquesea123'})
    # Mismo codigo y mensaje que una contrasena incorrecta: no se revela si
    # la cuenta existe.
    r2 = client.post('/api/auth/login',
                     json={'email': 'x@y.com', 'password': 'otra1234567'})
    assert r.status_code == r2.status_code == 401
    assert r.json()['detail'] == r2.json()['detail']


def test_logout_invalida_la_sesion(client, user_a):
    assert client.get('/api/auth/me').status_code == 200
    logout(client)
    assert client.get('/api/auth/me').status_code == 401


def test_sin_sesion_no_se_puede_leer_nada(client):
    logout(client)
    client._anon = True
    for ruta in ('/api/projects', '/api/people', '/api/positions'):
        assert client.get(ruta).status_code == 401, ruta
    client._anon = False


def test_usuario_desactivado_no_puede_operar(client, user_a):
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.email == user_a).first()
        u.active = False
        db.commit()
    finally:
        db.close()
    # Su sesion sigue viva en el navegador, pero debe rechazarse.
    assert client.get('/api/auth/me').status_code == 401
    assert client.get('/api/projects').status_code == 401


def test_cambio_de_contrasena_exige_la_actual(client, user_a):
    r = client.post('/api/auth/change-password',
                    json={'current_password': 'equivocada123',
                          'new_password': 'NuevaClave123'})
    assert r.status_code == 400
    # Con la correcta, cambia.
    r = client.post('/api/auth/change-password',
                    json={'current_password': TEST_PASSWORD,
                          'new_password': 'NuevaClave123'})
    assert r.status_code == 200
    logout(client)
    assert client.post('/api/auth/login',
                       json={'email': user_a,
                             'password': TEST_PASSWORD}).status_code == 401
    assert client.post('/api/auth/login',
                       json={'email': user_a,
                             'password': 'NuevaClave123'}).status_code == 200

# --- Aislamiento entre usuarios (IDOR) ----------------------------------

def _proyecto_de(email, nombre):
    """Crea un proyecto con dueno, cancion y composicion, sin pasar por la API."""
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.email == email).first()
        p = Project(name=nombre, owner_id=u.id)
        db.add(p)
        db.commit()
        db.refresh(p)
        s = Song(project_id=p.id, name=nombre + ' cancion', order_index=0)
        db.add(s)
        db.commit()
        db.refresh(s)
        c = Composition(project_id=p.id, song_id=s.id, name=nombre + ' comp',
                        width=1600, height=900, data={'elements': []})
        db.add(c)
        db.commit()
        db.refresh(c)
        return p.id, s.id, c.id
    finally:
        db.close()


def test_cada_usuario_solo_ve_sus_proyectos(client, user_a, user_b):
    pa, sa, ca = _proyecto_de(user_a, 'Proyecto de A')
    pb, sb, cb = _proyecto_de(user_b, 'Proyecto de B')
    logout(client)
    client.post('/api/auth/login', json={'email': user_a, 'password': TEST_PASSWORD})
    ids = [x['id'] for x in client.get('/api/projects').json()]
    assert pa in ids
    assert pb not in ids, 'A no debe ver el proyecto de B'
    logout(client)
    client.post('/api/auth/login', json={'email': user_b, 'password': TEST_PASSWORD})
    ids = [x['id'] for x in client.get('/api/projects').json()]
    assert pb in ids
    assert pa not in ids, 'B no debe ver el proyecto de A'


def test_no_se_puede_leer_un_proyecto_ajeno_sustituyendo_el_id(client, user_a, user_b):
    pb, sb, cb = _proyecto_de(user_b, 'Secreto de B')
    logout(client)
    client.post('/api/auth/login', json={'email': user_a, 'password': TEST_PASSWORD})
    # Conocer el id NO basta: se responde 404 para no revelar ni su existencia.
    assert client.get('/api/projects/%d' % pb).status_code == 404
    assert client.get('/api/projects/%d/songs' % pb).status_code == 404


def test_no_se_puede_modificar_ni_borrar_un_proyecto_ajeno(client, user_a, user_b):
    pb, sb, cb = _proyecto_de(user_b, 'Secreto de B')
    logout(client)
    client.post('/api/auth/login', json={'email': user_a, 'password': TEST_PASSWORD})
    assert client.patch('/api/projects/%d' % pb, json={'name': 'secuestrado'}).status_code == 404
    assert client.delete('/api/projects/%d' % pb).status_code == 404
    db = SessionLocal()
    try:
        assert db.get(Project, pb).name == 'Secreto de B'
    finally:
        db.close()


def test_no_se_puede_anadir_cancion_a_un_proyecto_ajeno(client, user_a, user_b):
    pb, sb, cb = _proyecto_de(user_b, 'Secreto de B')
    logout(client)
    client.post('/api/auth/login', json={'email': user_a, 'password': TEST_PASSWORD})
    assert client.post('/api/projects/%d/songs' % pb, json={'name': 'intrusa'}).status_code == 404
    db = SessionLocal()
    try:
        assert db.query(Song).filter(Song.project_id == pb).count() == 1
    finally:
        db.close()


def test_las_canciones_ajenas_tambien_estan_aisladas(client, user_a, user_b):
    _pa, sa, _ca = _proyecto_de(user_a, 'De A')
    _pb, sb, _cb = _proyecto_de(user_b, 'De B')
    logout(client)
    client.post('/api/auth/login', json={'email': user_a, 'password': TEST_PASSWORD})
    assert client.get('/api/songs/%d' % sa).status_code == 200
    assert client.get('/api/songs/%d' % sb).status_code == 404
    assert client.patch('/api/songs/%d' % sb, json={'name': 'x'}).status_code == 404
    assert client.delete('/api/songs/%d' % sb).status_code == 404
    # Tampoco las sugerencias ni el historial de una cancion ajena.
    assert client.get('/api/songs/%d/suggestions' % sb).status_code == 404
    assert client.get('/api/songs/%d/history' % sb).status_code == 404

def test_las_composiciones_ajenas_estan_aisladas(client, user_a, user_b):
    _pa, sa, ca = _proyecto_de(user_a, 'Comp de A')
    _pb, sb, cb = _proyecto_de(user_b, 'Comp de B')
    logout(client)
    client.post('/api/auth/login', json={'email': user_a, 'password': TEST_PASSWORD})
    assert client.get('/api/compositions/%d' % ca).status_code == 200
    assert client.get('/api/compositions/%d' % cb).status_code == 404
    assert client.patch('/api/compositions/%d' % cb, json={'name': 'x'}).status_code == 404
    assert client.delete('/api/compositions/%d' % cb).status_code == 404
    assert client.post('/api/compositions/%d/duplicate' % cb, json={}).status_code == 404


def test_no_se_puede_aplicar_propuesta_en_proyecto_ajeno(client, user_a, user_b):
    """El ataque mas directo: escribir dentro del proyecto de otro."""
    _pb, sb, _cb = _proyecto_de(user_b, 'B')
    logout(client)
    client.post('/api/auth/login', json={'email': user_a, 'password': TEST_PASSWORD})
    assert client.post('/api/songs/%d/suggestions/apply' % sb,
                       json={'proposals': [], 'name': 'invadida'}).status_code == 404
    assert client.post('/api/songs/%d/distribution/apply' % sb,
                       json={'proposals': [], 'name': 'invadida'}).status_code == 404
    db = SessionLocal()
    try:
        assert db.query(Composition).filter(
            Composition.project_id == _pb).count() == 1
    finally:
        db.close()


def test_no_se_puede_crear_composicion_en_proyecto_ajeno(client, user_a, user_b):
    pb, sb, cb = _proyecto_de(user_b, 'B')
    logout(client)
    client.post('/api/auth/login', json={'email': user_a, 'password': TEST_PASSWORD})
    r = client.post('/api/compositions', json={
        'project_id': pb, 'song_id': None, 'name': 'colada',
        'width': 1600, 'height': 900, 'data': {'elements': []}})
    assert r.status_code == 404


def test_una_persona_de_otro_proyecto_no_se_puede_tocar(client, user_a, user_b):
    from app.models import Person
    pb, sb, cb = _proyecto_de(user_b, 'B')
    db = SessionLocal()
    try:
        p = Person(name='Intrusa', project_id=pb)
        db.add(p)
        db.commit()
        db.refresh(p)
        pid = p.id
    finally:
        db.close()
    logout(client)
    client.post('/api/auth/login', json={'email': user_a, 'password': TEST_PASSWORD})
    assert client.delete('/api/people/%d' % pid,
                         params={'project_id': pb}).status_code == 404


def test_no_se_puede_importar_en_un_proyecto_ajeno(client, user_a, user_b):
    pb, sb, cb = _proyecto_de(user_b, 'B')
    logout(client)
    client.post('/api/auth/login', json={'email': user_a, 'password': TEST_PASSWORD})
    payload = {'project_id': pb, 'project_name': 'No debe',
               'sheets': [{'name': 'Hoja1', 'songs': [
                   {'name': 'Intrusa', 'assignments': [
                       {'person': 'Alguien', 'position': 'Primera', 'mark': 'X'}]}]}]}
    assert client.post('/api/imports/confirm', json=payload).status_code == 404


# --- CSRF ----------------------------------------------------------------

def test_una_mutacion_sin_token_csrf_se_rechaza(client, user_a):
    """Sin la cabecera anti-CSRF, aunque haya sesion, la operacion se rechaza."""
    logout(client)
    client.post('/api/auth/login', json={'email': user_a, 'password': TEST_PASSWORD})
    try:
        sin_csrf()
        r = client.post('/api/projects', json={'name': 'Sin CSRF'})
        assert r.status_code == 403
        db = SessionLocal()
        try:
            assert db.query(Project).filter(
                Project.name == 'Sin CSRF').count() == 0
        finally:
            db.close()
    finally:
        con_csrf()


def test_una_mutacion_con_token_csrf_valido_pasa(client, user_a):
    logout(client)
    client.post('/api/auth/login', json={'email': user_a, 'password': TEST_PASSWORD})
    assert client.post('/api/projects', json={'name': 'Con CSRF'}).status_code == 200
