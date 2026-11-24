"""
Fase 9C - historial PERSISTENTE de versiones de una composicion.

Es el unico mecanismo que sobrevive a recargar o cerrar la pestana, a diferencia
del `history`/`future` del store del navegador (que `setElements` vacia).

Se comprueban tres cosas que no deben mezclarse:
  1. persistencia y forma del snapshot;
  2. seguridad (reader, usuario sin acceso, version de otra composicion);
  3. restauracion sin perdida (las versiones NUNCA se borran).
"""
from app.db.session import SessionLocal
from app.models import (Project, Song, Composition, CompositionVersion,
                        ProjectCollaborator, User)
from conftest import logout, _crear_usuario, _login

OWNER = 'vers.owner@marimba.local'
EDITOR = 'vers.editor@marimba.local'
READER = 'vers.reader@marimba.local'
AJENO = 'vers.ajeno@marimba.local'


def _base(nombre, data=None, ancho=1600, alto=900, comp_name='C'):
    """Proyecto + cancion + composicion del dueno OWNER, directas en la base."""
    _crear_usuario(OWNER)
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.email == OWNER).first()
        p = Project(name=nombre, owner_id=u.id)
        db.add(p)
        db.commit()
        db.refresh(p)
        s = Song(project_id=p.id, name=nombre + ' S', order_index=0)
        db.add(s)
        db.commit()
        db.refresh(s)
        c = Composition(project_id=p.id, song_id=s.id, name=comp_name,
                        width=ancho, height=alto,
                        data=data if data is not None else {'elements': []})
        db.add(c)
        db.commit()
        db.refresh(c)
        return p.id, s.id, c.id
    finally:
        db.close()


def _colaborar(pid, email, rol):
    _crear_usuario(email)
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.email == email).first()
        db.add(ProjectCollaborator(project_id=pid, user_id=u.id, role=rol))
        db.commit()
    finally:
        db.close()


def _como(client, email):
    """Sesion como `email`. Crea la cuenta si hacia falta, para que la primera
    llamada a `_base` no tenga por que preceder siempre al inicio de sesion."""
    _crear_usuario(email)
    logout(client)
    _login(client, email)


def _guardar(client, pid, cid, nombre, data=None):
    """Equivale a lo que hace el boton Guardar del editor."""
    r = client.put(f'/api/compositions/{cid}', json={
        'project_id': pid, 'name': nombre, 'song_id': None,
        'width': 1600, 'height': 900,
        'data': data if data is not None else {'elements': []}})
    assert r.status_code == 200, r.text


# --- 1. Persistencia --------------------------------------------------------

def test_crear_una_version_guarda_numero_autor_y_fecha(client):
    pid, _, cid = _base('v9c basic')
    _como(client, OWNER)
    r = client.post(f'/api/compositions/{cid}/versions')
    assert r.status_code == 200, r.text
    v = r.json()
    assert v['version_number'] == 1
    assert v['composition_id'] == cid
    assert v['created_by']['name']
    assert v['created_at']
    assert v['snapshot']['data'] == {'elements': []}


def test_varias_versiones_numeros_monotonos(client):
    _como(client, OWNER)
    _, _, cid = _base('v9c varios')
    numeros = [client.post(f'/api/compositions/{cid}/versions').json()
               ['version_number'] for _ in range(4)]
    assert numeros == [1, 2, 3, 4], numeros


def test_el_snapshot_conserva_el_estado_actual_en_ese_momento(client):
    _como(client, OWNER)
    pid, _, cid = _base('v9c estado', data={'elements': [{'id': 'm1'}]})
    client.post(f'/api/compositions/{cid}/versions')
    _guardar(client, pid, cid, 'Despues', {'elements': [{'id': 'm2'}]})
    v = client.post(f'/api/compositions/{cid}/versions').json()
    assert v['version_number'] == 2
    # La version 2 guarda el estado YA CAMBIADO, no el original.
    assert v['snapshot']['data'] == {'elements': [{'id': 'm2'}]}
    assert v['snapshot']['name'] == 'Despues'


def test_listado_devuelve_todas_en_descendente_sin_snapshot(client):
    _como(client, OWNER)
    _, _, cid = _base('v9c listado')
    for _ in range(3):
        client.post(f'/api/compositions/{cid}/versions')
    vs = client.get(f'/api/compositions/{cid}/versions').json()['versions']
    assert [v['version_number'] for v in vs] == [3, 2, 1]
    # El listado no arrastra el snapshot: puede ser enorme.
    assert all('snapshot' not in v for v in vs)


def test_obtener_una_version_si_devuelve_el_snapshot(client):
    _como(client, OWNER)
    _, _, cid = _base('v9c obtener', data={'elements': [{'id': 'm1'}]})
    vid = client.post(f'/api/compositions/{cid}/versions').json()['id']
    v = client.get(f'/api/compositions/{cid}/versions/{vid}').json()
    assert v['id'] == vid
    assert v['snapshot']['data'] == {'elements': [{'id': 'm1'}]}


# --- 2. Seguridad -----------------------------------------------------------

def test_el_dueno_crea_lista_y_restaura(client):
    _como(client, OWNER)
    _, _, cid = _base('v9c dueno')
    vid = client.post(f'/api/compositions/{cid}/versions').json()['id']
    assert client.get(f'/api/compositions/{cid}/versions').status_code == 200
    assert client.get(f'/api/compositions/{cid}/versions/{vid}').status_code == 200
    assert client.post(
        f'/api/compositions/{cid}/versions/{vid}/restore').status_code == 200


def test_el_editor_puede_crear_y_restaurar(client):
    _como(client, OWNER)
    pid, _, cid = _base('v9c editor')
    _colaborar(pid, EDITOR, 'editor')
    _como(client, EDITOR)
    vid = client.post(f'/api/compositions/{cid}/versions').json()['id']
    assert client.post(
        f'/api/compositions/{cid}/versions/{vid}/restore').status_code == 200


def test_el_reader_consulta_pero_NO_crea_ni_restaura(client):
    """Un lector puede ver el historial, pero nunca alterarlo."""
    _como(client, OWNER)
    pid, _, cid = _base('v9c reader')
    _colaborar(pid, READER, 'reader')
    vid = client.post(f'/api/compositions/{cid}/versions').json()['id']

    _como(client, READER)
    assert client.get(f'/api/compositions/{cid}/versions').status_code == 200
    assert client.get(f'/api/compositions/{cid}/versions/{vid}').status_code == 200
    # Escribir da 404: el proyecto existe pero el lector no puede escribirlo.
    assert client.post(f'/api/compositions/{cid}/versions').status_code == 404
    assert client.post(
        f'/api/compositions/{cid}/versions/{vid}/restore').status_code == 404


def test_un_usuario_sin_acceso_no_ve_nada(client):
    _como(client, OWNER)
    _, _, cid = _base('v9c ajeno')
    vid = client.post(f'/api/compositions/{cid}/versions').json()['id']
    _como(client, AJENO)
    # 404 y no 403: no se revela siquiera que el recurso existe.
    assert client.get(f'/api/compositions/{cid}/versions').status_code == 404
    assert client.get(f'/api/compositions/{cid}/versions/{vid}').status_code == 404
    assert client.post(f'/api/compositions/{cid}/versions').status_code == 404
    assert client.post(
        f'/api/compositions/{cid}/versions/{vid}/restore').status_code == 404


def test_una_version_no_se_usa_sobre_otra_composicion(client):
    """El id de una version de A no vale para la composicion B."""
    _como(client, OWNER)
    _, _, cid_a = _base('v9c A')
    _, _, cid_b = _base('v9c B')
    vid_a = client.post(f'/api/compositions/{cid_a}/versions').json()['id']
    # Con acceso legitimo a B, pero la version es de A: 404, no datos ajenos.
    assert client.get(
        f'/api/compositions/{cid_b}/versions/{vid_a}').status_code == 404
    assert client.post(
        f'/api/compositions/{cid_b}/versions/{vid_a}/restore').status_code == 404


def test_restaurar_una_version_inexistente(client):
    _como(client, OWNER)
    _, _, cid = _base('v9c inexistente')
    assert client.post(
        f'/api/compositions/{cid}/versions/999999/restore').status_code == 404


def test_las_versiones_son_inmutables_no_admiten_patch_ni_borrado(client):
    _como(client, OWNER)
    _, _, cid = _base('v9c inmutable')
    vid = client.post(f'/api/compositions/{cid}/versions').json()['id']
    assert client.patch(f'/api/compositions/{cid}/versions/{vid}',
                        json={'version_number': 99}).status_code == 405
    assert client.delete(f'/api/compositions/{cid}/versions/{vid}').status_code == 405


# --- 3. Restauracion sin perdida -------------------------------------------

def test_restaurar_devuelve_el_estado_de_esa_version(client):
    _como(client, OWNER)
    pid, _, cid = _base('v9c restaura', data={'elements': [{'id': 'ORIGEN'}]})
    vid = client.post(f'/api/compositions/{cid}/versions').json()['id']
    _guardar(client, pid, cid, 'Cambiada', {'elements': [{'id': 'OTRA'}]})
    r = client.post(f'/api/compositions/{cid}/versions/{vid}/restore')
    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert cuerpo['restored_version'] == 1
    assert cuerpo['composition']['name'] == 'C'
    assert cuerpo['composition']['data'] == {'elements': [{'id': 'ORIGEN'}]}


def test_restaurar_no_borra_las_versiones_anteriores(client):
    _como(client, OWNER)
    pid, _, cid = _base('v9c no borra', data={'elements': [{'id': 'V1'}]})
    v1 = client.post(f'/api/compositions/{cid}/versions').json()
    _guardar(client, pid, cid, 'V2', {'elements': [{'id': 'V2'}]})
    client.post(f'/api/compositions/{cid}/versions')
    _guardar(client, pid, cid, 'V3', {'elements': [{'id': 'V3'}]})

    client.post(f'/api/compositions/{cid}/versions/{v1["id"]}/restore')
    numeros = [v['version_number']
               for v in client.get(
                   f'/api/compositions/{cid}/versions').json()['versions']]
    # 1 y 2 siguen existiendo, y el estado previo quedo a salvo.
    assert set([1, 2]).issubset(set(numeros)), numeros


def test_restaurar_guarda_el_estado_previo_como_nueva_version(client):
    """Nada de lo que habia se pierde: se conserva como version siguiente."""
    _como(client, OWNER)
    pid, _, cid = _base('v9c previo', data={'elements': [{'id': 'ANTES'}]})
    v1 = client.post(f'/api/compositions/{cid}/versions').json()['id']
    _guardar(client, pid, cid, 'PERDIDA', {'elements': [{'id': 'PERDIDA'}]})
    r = client.post(f'/api/compositions/{cid}/versions/{v1}/restore').json()
    guardada = r['previous_state_saved_as']
    assert guardada > 1
    # Y esa version guardada contiene exactamente lo que se iba a perder.
    # `previous_state_saved_as` es un NUMERO, no un id: se localiza en la lista.
    vs = client.get(f'/api/compositions/{cid}/versions').json()['versions']
    fila = next(v for v in vs if v['version_number'] == guardada)
    v = client.get(f'/api/compositions/{cid}/versions/{fila["id"]}').json()
    assert v['snapshot']['name'] == 'PERDIDA'
    assert v['snapshot']['data'] == {'elements': [{'id': 'PERDIDA'}]}


def test_despues_de_restaurar_se_puede_seguir_editando(client):
    """Restaurar no deja la composicion bloqueada ni solo lectura."""
    _como(client, OWNER)
    pid, _, cid = _base('v9c sigue', data={'elements': [{'id': 'm1'}]})
    vid = client.post(f'/api/compositions/{cid}/versions').json()['id']
    _guardar(client, pid, cid, 'Cambiada', {'elements': [{'id': 'm2'}]})
    client.post(f'/api/compositions/{cid}/versions/{vid}/restore')
    _guardar(client, pid, cid, 'Editada despues')
    assert client.get(f'/api/compositions/{cid}').json()['name'] == 'Editada despues'
    # Y se puede seguir creando versiones.
    assert client.post(f'/api/compositions/{cid}/versions').json()[
        'version_number'] >= 3


def test_una_composicion_vieja_sin_versiones_no_rompe_nada(client):
    """Composiciones creadas antes de 9C empiezan con historial vacio."""
    _como(client, OWNER)
    _, _, cid = _base('v9c legacy')
    assert client.get(f'/api/compositions/{cid}/versions').json()['versions'] == []
    # Y se puede empezar a versionar sin problema.
    assert client.post(f'/api/compositions/{cid}/versions').json()[
        'version_number'] == 1


def test_borrar_la_composicion_arrastra_sus_versiones(client):
    """Sin filas huerfanas: el borrado en cascada es de la base, no del codigo."""
    _como(client, OWNER)
    _, _, cid = _base('v9c cascada')
    client.post(f'/api/compositions/{cid}/versions')
    assert client.delete(f'/api/compositions/{cid}').status_code == 200
    db = SessionLocal()
    try:
        assert db.query(CompositionVersion).filter(
            CompositionVersion.composition_id == cid).count() == 0
    finally:
        db.close()