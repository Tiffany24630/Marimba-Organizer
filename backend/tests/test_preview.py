"""Fase 7A: propuesta sobre las marimbas EXISTENTES + aplicacion reversible.

El requisito central: la propuesta asigna PERSONAS a los puestos que el usuario
ya coloco. Nunca crea, elimina ni mueve marimbas, y cancelar no deja cambios.
"""
from app.db.session import SessionLocal
from app.models import (Project, Person, Position, Song, SongAssignment,
                        MarimbaTemplate, Composition, User)
from app.core.security import hash_password
from app.api.routes import propose_on_composition, apply_composition_assignments

# 7C: estas pruebas llaman a las funciones de ruta directamente. Al pasar a
# exigir usuario, hay que darles uno real: un objeto `Depends` no sirve.
# El usuario de pruebas NUNCA es administrador.
TEST_PW = 'PreviewPrueba9x'
_TEST_USER_EMAIL = 'preview.pruebas@marimba.local'


def _usuario_de_prueba(db):
    u = db.query(User).filter(User.email == _TEST_USER_EMAIL).first()
    if not u:
        u = User(name='Preview pruebas', email=_TEST_USER_EMAIL,
                 password_hash=hash_password(TEST_PW), role='user',
                 active=True, must_change_password=False)
        db.add(u)
        db.commit()
        db.refresh(u)
    return u


def _escenario(nombre, n_puestos=3, n_personas=3):
    """Proyecto con una cancion y una composicion de UNA marimba colocada a mano."""
    db = SessionLocal()
    db.query(MarimbaTemplate).delete(); db.commit()
    # 7C: el proyecto debe tener propietario para que las rutas lo acepten.
    user = _usuario_de_prueba(db)
    pr = Project(name=nombre, owner_id=user.id); db.add(pr); db.commit(); db.refresh(pr)
    pos = {}
    for t in ('Primera', 'Segunda'):
        o = db.query(Position).filter(Position.name == t).first() or Position(name=t)
        db.add(o); db.commit(); db.refresh(o)
        pos[t] = o.id
    personas = []
    for i in range(n_personas):
        p = Person(name='%s P%d' % (nombre, i))
        db.add(p); db.commit(); db.refresh(p)
        personas.append(p)
    s = Song(project_id=pr.id, name=nombre + ' S', order_index=0)
    db.add(s); db.commit(); db.refresh(s)
    for p in personas:
        db.add(SongAssignment(song_id=s.id, person_id=p.id,
                              position_id=pos['Primera']))
    db.commit()

    # Marimba colocada MANUALMENTE, con sus puestos ya definidos por el usuario.
    positions = [{'id': 'slot_%d' % i, 'type': 'Primera', 'personId': None}
                 for i in range(n_puestos)]
    data = {'elements': [
        {'id': 'mb_usuario', 'type': 'marimba', 'name': 'Marimba del usuario',
         'x': 100, 'y': 100, 'width': 400, 'height': 150, 'rotation': 0,
         'scaleX': 1, 'scaleY': 1, 'positions': positions}]}
    comp = Composition(project_id=pr.id, song_id=s.id, name='base',
                       width=1600, height=900, data=data)
    db.add(comp); db.commit(); db.refresh(comp)
    return db, pr, s, comp, personas, user


def _filas(res):
    """Convierte la propuesta en filas para aplicar."""
    return [{'slot_id': f['slot_id'], 'person_id': f['proposed_person_id']}
            for f in res['slots'] if f['proposed_person_id']]


def test_propuesta_no_crea_marimbas():
    """La propuesta solo asigna personas: las marimbas quedan intactas."""
    db, pr, s, comp, personas, user = _escenario('p7marimbas')
    try:
        antes = len(comp.data['elements'])
        propose_on_composition(s.id, db)
        despues = db.get(Composition, comp.id).data['elements']
        # Ni una marimba nueva, ni una eliminada.
        assert len(despues) == antes
        mb = [e for e in despues if e.get('type') == 'marimba']
        assert len(mb) == 1
        assert mb[0]['id'] == 'mb_usuario'
        # Y los puestos son los que el usuario puso, no otros.
        assert {p['id'] for p in mb[0]['positions']} == {
            'slot_0', 'slot_1', 'slot_2'}
    finally:
        db.close()


def test_propuesta_no_persiste_cambios():
    """Pedir una propuesta NO modifica la composicion guardada."""
    db, pr, s, comp, personas, user = _escenario('p7nopersiste')
    try:
        res = propose_on_composition(s.id, db)
        assert res['assigned'], 'deberia proponer al menos una persona'
        actual = db.get(Composition, comp.id).data
        for p in actual['elements'][0]['positions']:
            assert p['personId'] is None
    finally:
        db.close()


def test_propuesta_marca_cambios_y_conservados():
    """Distingue lo que cambia de lo que ya estaba bien."""
    db, pr, s, comp, personas, user = _escenario('p7cambios', n_puestos=3, n_personas=3)
    try:
        res = propose_on_composition(s.id, db)
        assert len(res['slots']) == 3
        assert res['changed'] + res['unchanged'] == 3
        for f in res['slots']:
            assert f['occupied_by'] is None
            assert f['proposed_person_id'] is not None
    finally:
        db.close()


def test_aceptar_solo_cambia_asignaciones():
    """Al aceptar cambian los puestos, pero las marimbas son las mismas."""
    db, pr, s, comp, personas, user = _escenario('p7aceptar')
    try:
        res = propose_on_composition(s.id, db)
        rows = _filas(res)
        assert rows
        nueva = apply_composition_assignments(comp.id, {'assignments': rows}, db, user=user)
        comps = db.query(Composition).filter(Composition.song_id == s.id).all()
        assert len(comps) == 2, 'debe crearse una composicion nueva'
        mb = [e for e in nueva['data']['elements'] if e.get('type') == 'marimba']
        assert len(mb) == 1 and mb[0]['id'] == 'mb_usuario'
        # La composicion ORIGINAL sigue intacta: se puede volver atras.
        base = db.get(Composition, comp.id)
        for p in base.data['elements'][0]['positions']:
            assert p['personId'] is None
    finally:
        db.close()


def test_cancelar_no_deja_rastro():
    """Cancelar es no hacer nada: no se crean composiciones ni cambios."""
    db, pr, s, comp, personas, user = _escenario('p7cancelar')
    try:
        propose_on_composition(s.id, db)
        comps = db.query(Composition).filter(Composition.song_id == s.id).all()
        assert len(comps) == 1, 'la previsualizacion no debe persistir'
        for p in db.get(Composition, comp.id).data['elements'][0]['positions']:
            assert p['personId'] is None
    finally:
        db.close()
def test_aplicar_rechaza_puesto_inexistente():
    """Un slot que no existe invalida toda la operacion (sin cambios parciales)."""
    db, pr, s, comp, personas, user = _escenario('p7invalido')
    try:
        res = propose_on_composition(s.id, db)
        rows = _filas(res)
        rows.append({'slot_id': 'slot_inexistente', 'person_id': personas[0].id})
        try:
            apply_composition_assignments(comp.id, {'assignments': rows}, db, user=user)
            assert False, 'deberia rechazar'
        except Exception as e:
            assert 'no existe' in str(e).lower() or '400' in str(e)
        comps = db.query(Composition).filter(Composition.song_id == s.id).all()
        assert len(comps) == 1
    finally:
        db.close()


def test_aplicar_rechaza_persona_duplicada():
    """La misma persona no puede ocupar dos puestos."""
    db, pr, s, comp, personas, user = _escenario('p7dup', n_puestos=2, n_personas=1)
    try:
        rows = [{'slot_id': 'slot_0', 'person_id': personas[0].id},
                {'slot_id': 'slot_1', 'person_id': personas[0].id}]
        try:
            apply_composition_assignments(comp.id, {'assignments': rows}, db, user=user)
            assert False, 'deberia rechazar duplicados'
        except Exception as e:
            assert 'dos veces' in str(e).lower() or '400' in str(e)
        comps = db.query(Composition).filter(Composition.song_id == s.id).all()
        assert len(comps) == 1
    finally:
        db.close()


def test_aplicar_rechaza_persona_inexistente():
    """Una persona que no existe invalida la operacion completa."""
    db, pr, s, comp, personas, user = _escenario('p7noper', n_puestos=1, n_personas=1)
    try:
        rows = [{'slot_id': 'slot_0', 'person_id': 999999}]
        try:
            apply_composition_assignments(comp.id, {'assignments': rows}, db, user=user)
            assert False, 'deberia rechazar'
        except Exception as e:
            assert 'no existe' in str(e).lower() or '404' in str(e)
        assert len(db.query(Composition).filter(
            Composition.song_id == s.id).all()) == 1
    finally:
        db.close()


def test_mas_personas_que_puestos_deja_el_resto_vacio():
    """Si sobran personas, los puestos sobrantes quedan vacios, no inventados."""
    db, pr, s, comp, personas, user = _escenario('p7sobran', n_puestos=2, n_personas=3)
    try:
        res = propose_on_composition(s.id, db)
        assert len(res['slots']) == 2
        assert len(res['assigned']) == 2
        assert len(res['unassigned']) == 1
    finally:
        db.close()


def test_sin_composicion_no_hay_propuesta():
    """Sin composicion previa el motor avisa en vez de inventar marimbas."""
    db = SessionLocal()
    try:
        pr = Project(name='p7sincomp'); db.add(pr); db.commit(); db.refresh(pr)
        s = Song(project_id=pr.id, name='S', order_index=0)
        db.add(s); db.commit(); db.refresh(s)
        try:
            propose_on_composition(s.id, db)
            assert False, 'deberia fallar sin composicion'
        except Exception as e:
            assert 'composicion' in str(e).lower()
    finally:
        db.close()


def test_composicion_sin_marimbas_no_hay_propuesta():
    db = SessionLocal()
    try:
        pr = Project(name='p7sinmarimbas'); db.add(pr); db.commit(); db.refresh(pr)
        s = Song(project_id=pr.id, name='S', order_index=0)
        db.add(s); db.commit(); db.refresh(s)
        db.add(Composition(project_id=pr.id, song_id=s.id, name='vacia',
                           width=1600, height=900, data={'elements': []}))
        db.commit()
        try:
            propose_on_composition(s.id, db)
            assert False, 'deberia fallar sin marimbas'
        except Exception as e:
            assert 'marimba' in str(e).lower()
    finally:
        db.close()


def test_modificar_marimbas_durante_previsualizacion():
    """Si el usuario cambia la composicion, la propuesta previa queda obsoleta.

    Aplicar una propuesta generada antes de modificar la composicion NO se
    aplica en silencio: los slots que ya no existen se rechazan.
    """
    db, pr, s, comp, personas, user = _escenario('p7obsoleta')
    try:
        res = propose_on_composition(s.id, db)
        rows = _filas(res)
        # El usuario reorganiza: otra marimba con otros slots.
        comp.data = {'elements': [
            {'id': 'mb_nueva', 'type': 'marimba', 'name': 'Reorganizada',
             'x': 0, 'y': 0, 'width': 300, 'height': 150, 'rotation': 0,
             'scaleX': 1, 'scaleY': 1,
             'positions': [{'id': 'slot_x', 'type': 'Primera', 'personId': None}]}]}
        db.commit()
        try:
            apply_composition_assignments(comp.id, {'assignments': rows}, db, user=user)
            assert False, 'una propuesta obsoleta no debe aplicarse'
        except Exception as e:
            assert 'no existe' in str(e).lower() or '400' in str(e)
    finally:
        db.close()
