"""
Fase 7D - pruebas de colaboracion, permisos y auditoria.

Escenario: user_a es propietario de project_a; user_b sera editor; user_c sera
lector; user_d no tiene acceso. project_b pertenece a otro dueno, para IDOR.
"""
from app.db.session import SessionLocal
from app.models import (User, Project, Song, Composition, ProjectCollaborator, AuditLog)
from conftest import TEST_PASSWORD, logout

CORREO_A = 'colab.a@marimba.local'
CORREO_B = 'colab.b@marimba.local'
CORREO_C = 'colab.c@marimba.local'
CORREO_D = 'colab.d@marimba.local'


def _asegurar(email):
    """
    Crea el usuario de la prueba si no existe.

    Las fixtures de `conftest` crean `prueba.*`; aqui se necesitan cuentas
    con nombres propios para no mezclarlas con las de otras pruebas.
    """
    from app.core.security import hash_password
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.email == email).first()
        if not u:
            u = User(name=email.split('@')[0], email=email,
                     password_hash=hash_password(TEST_PASSWORD),
                     role='user', active=True, must_change_password=False)
            db.add(u)
            db.commit()
            db.refresh(u)
        return u
    finally:
        db.close()


def _usuario(email):
    db = SessionLocal()
    try:
        return db.query(User).filter(User.email == email).first()
    finally:
        db.close()


def _proyecto(email, nombre):
    _asegurar(email)
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.email == email).first()
        p = Project(name=nombre, owner_id=u.id)
        db.add(p)
        db.commit()
        db.refresh(p)
        s = Song(project_id=p.id, name=nombre + ' S', order_index=0)
        db.add(s)
        db.commit()
        db.refresh(s)
        c = Composition(project_id=p.id, song_id=s.id, name=nombre + ' C',
                        width=1600, height=900, data={'elements': []})
        db.add(c)
        db.commit()
        db.refresh(c)
        return p.id, s.id, c.id
    finally:
        db.close()


def _entrar(client, email):
    """Inicia sesion como `email`, creando la cuenta de prueba si hace falta."""
    _asegurar(email)
    logout(client)
    client._anon = False
    r = client.post('/api/auth/login',
                    json={'email': email, 'password': TEST_PASSWORD})
    assert r.status_code == 200, r.text
    return r


def test_owner_comparte_y_el_editor_gana_acceso(client, user_a, user_b):
    """Anadir un editor le da acceso real, no solo visual."""
    _asegurar(CORREO_A); _asegurar(CORREO_B); _asegurar(CORREO_C); _asegurar(CORREO_D)
    pa, sa, ca = _proyecto(CORREO_A, 'Proyecto A')
    _entrar(client, CORREO_A)
    r = client.post('/api/projects/%d/collaborators' % pa,
                    json={'email': CORREO_B, 'role': 'editor'})
    assert r.status_code == 200, r.text
    assert r.json()['role'] == 'editor'
    _entrar(client, CORREO_B)
    assert client.get('/api/projects/%d' % pa).status_code == 200
    assert client.get('/api/projects/%d/access' % pa).json()['access'] == 'editor'


def test_reader_consulta_pero_no_modifica(client, user_a, user_b):
    _asegurar(CORREO_A); _asegurar(CORREO_B); _asegurar(CORREO_C); _asegurar(CORREO_D)
    pa, sa, ca = _proyecto(CORREO_A, 'Proyecto A')
    _entrar(client, CORREO_A)
    assert client.post('/api/projects/%d/collaborators' % pa,
                       json={'email': CORREO_B, 'role': 'reader'}).status_code == 200
    _entrar(client, CORREO_B)
    # PUEDE leer.
    assert client.get('/api/projects/%d' % pa).status_code == 200
    assert client.get('/api/projects/%d/songs' % pa).status_code == 200
    assert client.get('/api/songs/%d' % sa).status_code == 200
    assert client.get('/api/compositions/%d' % ca).status_code == 200
    # NO PUEDE modificar nada.
    assert client.patch('/api/projects/%d' % pa, json={'name': 'x'}).status_code == 404
    assert client.post('/api/projects/%d/songs' % pa, json={'name': 'x'}).status_code == 404
    assert client.patch('/api/songs/%d' % sa, json={'name': 'x'}).status_code == 404
    assert client.delete('/api/compositions/%d' % ca).status_code == 404


def test_editor_modifica_pero_no_administra_permisos(client, user_a, user_b):
    _asegurar(CORREO_A); _asegurar(CORREO_B); _asegurar(CORREO_C); _asegurar(CORREO_D)
    pa, sa, ca = _proyecto(CORREO_A, 'Proyecto A')
    _entrar(client, CORREO_A)
    client.post('/api/projects/%d/collaborators' % pa,
                json={'email': CORREO_B, 'role': 'editor'})
    _entrar(client, CORREO_B)
    # SI puede trabajar sobre el contenido.
    assert client.post('/api/projects/%d/songs' % pa,
                       json={'name': 'cancion nueva'}).status_code == 200
    assert client.patch('/api/projects/%d' % pa, json={'name': 'renombrado'}).status_code == 200
    # NO puede compartir ni cambiar permisos: eso es del propietario.
    assert client.post('/api/projects/%d/collaborators' % pa,
                       json={'email': CORREO_C, 'role': 'reader'}).status_code == 404
    assert client.patch('/api/projects/%d/collaborators/1' % pa,
                        json={'role': 'editor'}).status_code == 404
    assert client.delete('/api/projects/%d/collaborators/1' % pa).status_code == 404
    # Ni la auditoria, que es del propietario.
    assert client.get('/api/projects/%d/audit-log' % pa).status_code == 404

def test_sin_acceso_no_puede_entrar(client, user_a):
    _asegurar(CORREO_A); _asegurar(CORREO_B); _asegurar(CORREO_C); _asegurar(CORREO_D)
    pa, sa, ca = _proyecto(CORREO_A, 'Proyecto A')
    _entrar(client, CORREO_D)
    assert client.get('/api/projects/%d' % pa).status_code == 404
    assert client.get('/api/projects/%d/songs' % pa).status_code == 404
    assert client.get('/api/songs/%d' % sa).status_code == 404
    assert client.get('/api/compositions/%d' % ca).status_code == 404
    assert client.get('/api/projects/%d/collaborators' % pa).status_code == 404
    assert client.get('/api/projects/%d/audit-log' % pa).status_code == 404
    assert client.patch('/api/projects/%d' % pa, json={'name': 'x'}).status_code == 404


def test_el_propietario_no_puede_ser_colaborador_suyo(client, user_a):
    """Regla 7D: owner != collaborator."""
    _asegurar(CORREO_A); _asegurar(CORREO_B); _asegurar(CORREO_C); _asegurar(CORREO_D)
    pa, sa, ca = _proyecto(CORREO_A, 'Proyecto A')
    _entrar(client, CORREO_A)
    r = client.post('/api/projects/%d/collaborators' % pa,
                    json={'email': CORREO_A, 'role': 'editor'})
    assert r.status_code == 400
    assert 'propietario' in r.json()['detail']


def test_no_se_puede_anadir_dos_veces(client, user_a, user_b):
    _asegurar(CORREO_A); _asegurar(CORREO_B); _asegurar(CORREO_C); _asegurar(CORREO_D)
    pa, sa, ca = _proyecto(CORREO_A, 'Proyecto A')
    _entrar(client, CORREO_A)
    assert client.post('/api/projects/%d/collaborators' % pa,
                       json={'email': CORREO_B, 'role': 'editor'}).status_code == 200
    # El segundo intento se rechaza, no se duplica.
    assert client.post('/api/projects/%d/collaborators' % pa,
                       json={'email': CORREO_B, 'role': 'reader'}).status_code == 409
    db = SessionLocal()
    try:
        assert db.query(ProjectCollaborator).filter(
            ProjectCollaborator.project_id == pa).count() == 1
    finally:
        db.close()


def test_validaciones_de_entrada(client, user_a):
    """Datos invalidos devuelven 4xx, nunca 500."""
    _asegurar(CORREO_A); _asegurar(CORREO_B); _asegurar(CORREO_C); _asegurar(CORREO_D)
    pa, sa, ca = _proyecto(CORREO_A, 'Proyecto A')
    _entrar(client, CORREO_A)
    assert client.post('/api/projects/%d/collaborators' % pa,
                       json={'email': CORREO_B, 'role': 'admin'}).status_code == 400
    assert client.post('/api/projects/%d/collaborators' % pa,
                       json={'email': 'nadie@ejemplo.com',
                             'role': 'reader'}).status_code == 404
    assert client.post('/api/projects/999999/collaborators',
                       json={'email': CORREO_B, 'role': 'reader'}).status_code == 404
    # Un collaborator que no existe, al cambiar o revocar.
    assert client.patch('/api/projects/%d/collaborators/999999' % pa,
                        json={'role': 'editor'}).status_code == 404
    assert client.delete('/api/projects/%d/collaborators/999999' % pa).status_code == 404
    # El propietario no se puede " degradar" a lector.
    uid = _usuario(CORREO_A).id
    assert client.patch('/api/projects/%d/collaborators/%d' % (pa, uid),
                        json={'role': 'reader'}).status_code == 400


def test_cambio_de_rol_es_inmediato(client, user_a, user_b):
    """reader -> editor y editor -> reader surten efecto sin cerrar sesion."""
    _asegurar(CORREO_A); _asegurar(CORREO_B); _asegurar(CORREO_C); _asegurar(CORREO_D)
    pa, sa, ca = _proyecto(CORREO_A, 'Proyecto A')
    _entrar(client, CORREO_A)
    client.post('/api/projects/%d/collaborators' % pa,
                json={'email': CORREO_B, 'role': 'reader'})
    _entrar(client, CORREO_B)
    assert client.post('/api/projects/%d/songs' % pa,
                       json={'name': 'no'}).status_code == 404
    # El propietario le sube a editor.
    _entrar(client, CORREO_A)
    uid = _usuario(CORREO_B).id
    assert client.patch('/api/projects/%d/collaborators/%d' % (pa, uid),
                        json={'role': 'editor'}).status_code == 200
    _entrar(client, CORREO_B)
    assert client.post('/api/projects/%d/songs' % pa,
                       json={'name': 'si'}).status_code == 200
    # Y al bajar a reader, vuelve a perderlo.
    _entrar(client, CORREO_A)
    client.patch('/api/projects/%d/collaborators/%d' % (pa, uid),
                 json={'role': 'reader'})
    _entrar(client, CORREO_B)
    assert client.post('/api/projects/%d/songs' % pa,
                       json={'name': 'tampoco'}).status_code == 404


def test_revocacion_inmediata(client, user_a, user_b):
    """Tras revocar, el acceso se pierde en la peticion siguiente."""
    _asegurar(CORREO_A); _asegurar(CORREO_B); _asegurar(CORREO_C); _asegurar(CORREO_D)
    pa, sa, ca = _proyecto(CORREO_A, 'Proyecto A')
    _entrar(client, CORREO_A)
    client.post('/api/projects/%d/collaborators' % pa,
                json={'email': CORREO_B, 'role': 'editor'})
    _entrar(client, CORREO_B)
    assert client.get('/api/projects/%d' % pa).status_code == 200
    _entrar(client, CORREO_A)
    uid = _usuario(CORREO_B).id
    assert client.delete('/api/projects/%d/collaborators/%d' % (pa, uid)).status_code == 200
    _entrar(client, CORREO_B)
    assert client.get('/api/projects/%d' % pa).status_code == 404


def test_un_lector_puede_consultar_todo_sin_tocar_nada(client, user_a, user_b):
    """7E: un reader consulta el proyecto entero y no modifica nada."""
    pa, sa, ca = _proyecto(CORREO_A, 'Proyecto A')
    _entrar(client, CORREO_A)
    client.post('/api/projects/%d/collaborators' % pa,
                json={'email': CORREO_B, 'role': 'reader'})
    _entrar(client, CORREO_B)
    # CONSULTA: todo lo de leer es permitido al lector.
    assert client.get('/api/projects/%d' % pa).status_code == 200
    assert client.get('/api/projects/%d/songs' % pa).status_code == 200
    assert client.get('/api/songs/%d' % sa).status_code == 200
    assert client.get('/api/compositions/%d' % ca).status_code == 200
    assert client.get('/api/songs/%d/suggestions' % sa).status_code == 200
    assert client.get('/api/songs/%d/history' % sa).status_code == 200
    assert client.get('/api/songs/%d/requirements' % sa).status_code == 200
    assert client.get('/api/songs/%d/distribution-suggestion' % sa).status_code == 200
    # Y no queda nada escrito: ni una composicion mas.
    db = SessionLocal()
    try:
        assert db.query(Composition).filter(
            Composition.project_id == pa).count() == 1
    finally:
        db.close()


def test_un_lector_no_puede_sugerir_ni_aplicar_ni_exportar_ajeno(client, user_a, user_b):
    """7E: proponer y aplicar ES escritura; exportar, solo lo autorizado."""
    pa, sa, ca = _proyecto(CORREO_A, 'Proyecto A')
    _pb, sb, cb = _proyecto(CORREO_D, 'Proyecto B')
    _entrar(client, CORREO_A)
    client.post('/api/projects/%d/collaborators' % pa,
                json={'email': CORREO_B, 'role': 'reader'})
    _entrar(client, CORREO_B)
    assert client.post('/api/songs/%d/propose-on-composition' % sa,
                       json={}).status_code == 404
    assert client.post('/api/songs/%d/suggestions/apply' % sa,
                       json={'proposals': [], 'name': 'x'}).status_code == 404
    assert client.post('/api/songs/%d/distribution/apply' % sa,
                       json={'proposals': [], 'name': 'x'}).status_code == 404
    # Una composicion de OTRO proyecto no se puede leer ni exportar por su id.
    assert client.get('/api/compositions/%d' % cb).status_code == 404
    assert client.get('/api/songs/%d' % sb).status_code == 404


def test_borrar_el_proyecto_es_solo_del_propietario(client, user_a, user_b):
    """
    7E - regresion de permisos.

    `owned_project` significa "escribible", asi que un editor lo cumple. Si el
    borrado del proyecto se hubiera dejado en esa dependencia, un editor
    podria destruir el trabajo de su propietario. Aqui se comprueba el resultado
    real: el proyecto sigue existiendo.
    """
    pa, sa, ca = _proyecto(CORREO_A, 'Proyecto A')
    _entrar(client, CORREO_A)
    client.post('/api/projects/%d/collaborators' % pa,
                json={'email': CORREO_B, 'role': 'editor'})
    _entrar(client, CORREO_B)
    assert client.delete('/api/projects/%d' % pa).status_code == 404
    # Sigue ahi y con su contenido intacto.
    assert client.get('/api/projects/%d/songs' % pa).status_code == 200
    db = SessionLocal()
    try:
        assert db.query(Project).filter(Project.id == pa).count() == 1
        assert db.query(Song).filter(Song.project_id == pa).count() == 1
        assert db.query(Composition).filter(
            Composition.project_id == pa).count() == 1
    finally:
        db.close()
    # El propietario si puede borrarlo.
    _entrar(client, CORREO_A)
    assert client.delete('/api/projects/%d' % pa).status_code == 200


def test_actualizar_proyecto_y_composicion_deja_evento(client, user_a, user_b):
    """
    7F - la auditoria cubria la creacion pero no las modificaciones.

    Sin esto, un cambio de nombre o una edicion de composicion no dejaba
    ninguna traza, y el historial parecia completo cuando no lo era.
    """
    pa, sa, ca = _proyecto(CORREO_A, 'Proyecto A')
    _entrar(client, CORREO_A)
    assert client.patch('/api/projects/%d' % pa,
                        json={'name': 'Proyecto renombrado'}).status_code == 200
    nuevo = client.put('/api/compositions/%d' % ca, json={
        'project_id': pa, 'song_id': sa, 'name': 'Composicion editada',
        'width': 1600, 'height': 900,
        'data': {'elements': [{'id': 'p1', 'type': 'person', 'name': 'Ana'}]}})
    assert nuevo.status_code == 200

    r = client.get('/api/projects/%d/audit-log' % pa)
    assert r.status_code == 200
    entradas = r.json()['entries']
    acciones = [e['action'] for e in entradas]
    assert 'PROJECT_UPDATED' in acciones
    assert 'COMPOSITION_UPDATED' in acciones

    # El evento de actualizacion guarda el nombre anterior: sin el, el
    # historial solo diria "algo cambio", que no sirve para auditar.
    upd = next(e for e in entradas if e['action'] == 'PROJECT_UPDATED')
    assert upd['details']['previous_name'] == 'Proyecto A'
    assert upd['details']['name'] == 'Proyecto renombrado'
    # Y el contenido de la composicion NO se copia al detalle: puede ser enorme.
    comp = next(e for e in entradas if e['action'] == 'COMPOSITION_UPDATED')
    assert 'data' not in (comp['details'] or {})
    assert comp['entity_type'] == 'composition'


def test_borrar_deja_evento_y_sobrevive_al_proyecto(client, user_a, user_b):
    """
    7F - `audit_log.project_id` tiene ON DELETE CASCADE: si el evento colgara del
    proyecto, `PROJECT_DELETED` se borraria justo al borrar el proyecto y el
    rastro se perderia. Se comprueba que el evento sobrevive.
    """
    pa, sa, ca = _proyecto(CORREO_A, 'Proyecto A')
    _entrar(client, CORREO_A)
    assert client.delete('/api/projects/%d' % pa).status_code == 200

    db = SessionLocal()
    try:
        ev = (db.query(AuditLog)
              .filter(AuditLog.action == 'PROJECT_DELETED').order_by(
                  AuditLog.id.desc()).first())
        assert ev is not None, 'no se registro PROJECT_DELETED'
        # Sin project_id a proposito (ver la nota del codigo).
        assert ev.project_id is None
        assert ev.entity_id == str(pa)
        assert ev.details['name'] == 'Proyecto A'
        # Actor real, no un id nulo.
        assert ev.actor_user_id is not None
    finally:
        db.close()


def test_borrar_cancion_y_composicion_deja_evento(client, user_a, user_b):
    """7F: SONG_DELETED y COMPOSITION_DELETED tambien quedan registrados."""
    pa, sa, ca = _proyecto(CORREO_A, 'Proyecto A')
    _entrar(client, CORREO_A)
    assert client.delete('/api/compositions/%d' % ca).status_code == 200
    assert client.delete('/api/songs/%d' % sa).status_code == 200

    r = client.get('/api/projects/%d/audit-log' % pa)
    assert r.status_code == 200
    acciones = [e['action'] for e in r.json()['entries']]
    assert 'COMPOSITION_DELETED' in acciones
    assert 'SONG_DELETED' in acciones


def test_un_error_de_autorizacion_no_registra_exito(client, user_a, user_b):
    """
    7F - un rechazo NO puede aparecer como una operacion realizada.

    Los eventos se escriben DESPUES del commit precisamente para que esto sea
    asi: si la operacion no llega a confirmarse, no hay evento.
    """
    pa, sa, ca = _proyecto(CORREO_A, 'Proyecto A')
    _entrar(client, CORREO_B)
    assert client.delete('/api/projects/%d' % pa).status_code == 404
    assert client.patch('/api/projects/%d' % pa,
                        json={'name': 'Intruso'}).status_code == 404
    assert client.put('/api/compositions/%d' % ca, json={
        'project_id': pa, 'song_id': sa, 'name': 'Intrusa',
        'width': 1600, 'height': 900, 'data': {}}).status_code == 404

    # El propietario no ve ningun evento de esos intentos.
    _entrar(client, CORREO_A)
    entradas = client.get('/api/projects/%d/audit-log' % pa).json()['entries']
    assert all(e['actor_email'] != CORREO_B for e in entradas)
    assert all(e['action'] != 'PROJECT_UPDATED' for e in entradas)
    assert all(e['action'] != 'COMPOSITION_UPDATED' for e in entradas)
    # El proyecto ni se toco. Se consulta la base de datos y no la respuesta de
    # la API: /projects/{id} devuelve una vista compuesta y no expone `name` en
    # la raiz, asi que un assert sobre ella probaria el formato, no el dato.
    db = SessionLocal()
    try:
        assert db.query(Project).filter(Project.id == pa).one().name == 'Proyecto A'
        assert db.query(Composition).filter(Composition.id == ca).one().name \
            == 'Proyecto A C'
    finally:
        db.close()


def test_idor_un_editor_de_a_no_entra_en_b(client, user_a, user_b):
    """Ser editor de A no da acceso a B, ni por IDs indirectos."""
    _asegurar(CORREO_A); _asegurar(CORREO_B); _asegurar(CORREO_C); _asegurar(CORREO_D)
    pa, sa, ca = _proyecto(CORREO_A, 'Proyecto A')
    pb, sb, cb = _proyecto(CORREO_D, 'Proyecto B')
    _entrar(client, CORREO_A)
    client.post('/api/projects/%d/collaborators' % pa,
                json={'email': CORREO_B, 'role': 'editor'})
    _entrar(client, CORREO_B)
    # Acceso a A: si.
    assert client.get('/api/projects/%d' % pa).status_code == 200
    # Acceso a B, probando ids directos e indirectos: no.
    assert client.get('/api/projects/%d' % pb).status_code == 404
    assert client.get('/api/projects/%d/songs' % pb).status_code == 404
    assert client.get('/api/songs/%d' % sb).status_code == 404
    assert client.get('/api/compositions/%d' % cb).status_code == 404
    assert client.patch('/api/projects/%d' % pb, json={'name': 'x'}).status_code == 404
    assert client.patch('/api/compositions/%d' % cb, json={'name': 'x'}).status_code == 404
    assert client.post('/api/projects/%d/songs' % pb, json={'name': 'x'}).status_code == 404
    assert client.get('/api/songs/%d/suggestions' % sb).status_code == 404
    assert client.post('/api/projects/%d/songs' % pb, json={'name': 'x'}).status_code == 404
    assert client.get('/api/songs/%d/suggestions' % sb).status_code == 404


# --- Auditoria -----------------------------------------------------------

def _eventos(proyecto_id, accion=None):
    db = SessionLocal()
    try:
        q = db.query(AuditLog).filter(AuditLog.project_id == proyecto_id)
        if accion:
            q = q.filter(AuditLog.action == accion)
        return q.order_by(AuditLog.id).all()
    finally:
        db.close()


def test_la_auditoria_registra_actor_y_accion(client, user_a, user_b):
    """Cada evento dice QUIEN lo hizo, no solo que paso."""
    pa, sa, ca = _proyecto(CORREO_A, 'Proyecto A')
    _entrar(client, CORREO_A)
    client.post('/api/projects/%d/collaborators' % pa,
                json={'email': CORREO_B, 'role': 'editor'})
    eventos = _eventos(pa, 'COLLABORATOR_ADDED')
    assert len(eventos) == 1
    e = eventos[0]
    # El actor es el PROPIETARIO que ejecuto la operacion.
    assert e.actor_user_id == _usuario(CORREO_A).id
    assert e.entity_type == 'user'
    assert e.entity_id == str(_usuario(CORREO_B).id)


def test_cambio_de_rol_y_revocacion_dejan_rastro(client, user_a, user_b):
    pa, sa, ca = _proyecto(CORREO_A, 'Proyecto A')
    _entrar(client, CORREO_A)
    client.post('/api/projects/%d/collaborators' % pa,
                json={'email': CORREO_B, 'role': 'editor'})
    uid = _usuario(CORREO_B).id
    client.patch('/api/projects/%d/collaborators/%d' % (pa, uid),
                 json={'role': 'reader'})
    client.delete('/api/projects/%d/collaborators/%d' % (pa, uid))
    cambio = _eventos(pa, 'COLLABORATOR_ROLE_CHANGED')
    assert len(cambio) == 1
    assert cambio[0].details == {'from': 'editor', 'to': 'reader'}
    assert len(_eventos(pa, 'COLLABORATOR_REMOVED')) == 1
    # El propietario es siempre el actor de estas tres acciones.
    dueno = _usuario(CORREO_A).id
    for accion in ('COLLABORATOR_ADDED', 'COLLABORATOR_ROLE_CHANGED',
                   'COLLABORATOR_REMOVED'):
        assert all(e.actor_user_id == dueno for e in _eventos(pa, accion))


def test_la_auditoria_registra_las_acciones_de_contenido(client, user_a, user_b):
    pa, sa, ca = _proyecto(CORREO_A, 'Proyecto A')
    _entrar(client, CORREO_A)
    client.post('/api/projects/%d/collaborators' % pa,
                json={'email': CORREO_B, 'role': 'editor'})
    _entrar(client, CORREO_B)
    # Un EDITOR tambien queda registrado: la autoria no se infiere del dueno.
    client.post('/api/projects/%d/songs' % pa, json={'name': 'del editor'})
    eventos = _eventos(pa, 'SONG_CREATED')
    assert len(eventos) == 1
    assert eventos[0].actor_user_id == _usuario(CORREO_B).id


def test_el_historial_lo_ve_solo_el_propietario(client, user_a, user_b):
    pa, sa, ca = _proyecto(CORREO_A, 'Proyecto A')
    _entrar(client, CORREO_A)
    client.post('/api/projects/%d/collaborators' % pa,
                json={'email': CORREO_B, 'role': 'editor'})
    r = client.get('/api/projects/%d/audit-log' % pa)
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo['total'] >= 1
    # Orden cronologico y con autor visible.
    assert cuerpo['entries'][0]['actor_email'] == CORREO_A
    # El editor no lo ve.
    _entrar(client, CORREO_B)
    assert client.get('/api/projects/%d/audit-log' % pa).status_code == 404


def test_la_auditoria_nunca_guarda_secretos(client, user_a):
    """Ni contrasenas, ni tokens, ni cookies en `details`."""
    pa, sa, ca = _proyecto(CORREO_A, 'Proyecto A')
    _entrar(client, CORREO_A)
    from app.api.deps import record_audit
    db = SessionLocal()
    try:
        record_audit(db, _usuario(CORREO_A), pa, 'PRUEBA', 'test', '1',
                     {'password': 'secreto', 'new_password': 'otro',
                      'token': 'abc', 'cookie': 'x', 'csrf': 'y',
                      'campo_normal': 'visible'})
        db.close()
        e = _eventos(pa, 'PRUEBA')[-1]
        assert e.details['password'] == '***'
        assert e.details['token'] == '***'
        assert e.details['csrf'] == '***'
        assert e.details['campo_normal'] == 'visible'
        # Y el secreto no aparece en ningun sitio del registro.
        assert 'secreto' not in str(e.details)
    finally:
        db.close()


def test_el_propietario_no_desaparece_del_dashboard(client, user_a, user_b):
    """Los proyectos compartidos se ven, los propios mandan sobre un rol."""
    pa, sa, ca = _proyecto(CORREO_A, 'Proyecto A')
    pb, sb, cb = _proyecto(CORREO_D, 'Proyecto B')
    _entrar(client, CORREO_A)
    client.post('/api/projects/%d/collaborators' % pa,
                json={'email': CORREO_B, 'role': 'editor'})
    _entrar(client, CORREO_B)
    lista = client.get('/api/projects').json()
    ids = [x['id'] for x in lista]
    assert pa in ids
    assert pb not in ids, 'un proyecto ajeno no puede aparecer'
    compartido = [x for x in lista if x['id'] == pa][0]
    assert compartido['access'] == 'editor'
    assert compartido['shared_with_me'] is True
