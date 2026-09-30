"""Unificacion de motores (Fase 3 / D4): ambos endpoints deben coincidir.

Antes, `/suggestions` (Motor A) y `/distribution-suggestion` (Motor B) tomaban
decisiones distintas con los mismos datos. Estas pruebas comprueban que ahora
comparten un unico nucleo de decision.
"""
from app.db.session import SessionLocal
from app.models import (Project, Person, Position, Song, SongAssignment,
                        MarimbaTemplate, Composition)
from app.services.suggestions.core import (build_distribution_core,
                                           plan_from_slots,
                                           to_suggestions_response,
                                           to_distribution_response)
from app.services.suggestions import get_suggestions_for_song
from app.services.suggestions.distribution import get_distribution_for_song


def _piso(nombre):
    """Proyecto, posiciones, personas y dos canciones ordenadas."""
    db = SessionLocal()
    pr = Project(name=nombre); db.add(pr); db.commit(); db.refresh(pr)
    pos = {}
    for n in ('Primera', 'Segunda'):
        o = Position(name=n + ' ' + nombre)
        db.add(o); db.commit(); db.refresh(o)
        pos[n] = o.id
    pers = {}
    for n in ('Ana', 'Beto'):
        x = Person(name=n + ' ' + nombre)
        db.add(x); db.commit(); db.refresh(x)
        pers[n] = x.id
    s1 = Song(project_id=pr.id, name='Prev ' + nombre, order_index=0)
    s2 = Song(project_id=pr.id, name='Actual ' + nombre, order_index=1)
    db.add_all([s1, s2]); db.commit(); db.refresh(s1); db.refresh(s2)
    return db, pr, pos, pers, s1, s2


def _composicion_previa(db, song, pers):
    """Composicion previa: Beto en 'Grande'(Primera), Ana en 'Chica'(Segunda)."""
    data = {'elements': [
        {'id': 'G', 'type': 'marimba', 'name': 'Grande', 'x': 0, 'y': 0,
         'width': 380, 'height': 150, 'rotation': 0, 'scaleX': 1, 'scaleY': 1,
         'positions': [{'id': 'g0', 'type': 'Primera', 'personId': pers['Beto']}]},
        {'id': 'C', 'type': 'marimba', 'name': 'Chica', 'x': 0, 'y': 300,
         'width': 380, 'height': 150, 'rotation': 0, 'scaleX': 1, 'scaleY': 1,
         'positions': [{'id': 'c0', 'type': 'Segunda', 'personId': pers['Ana']}]},
        {'id': 'person_%d' % pers['Beto'], 'type': 'person', 'name': 'Beto',
         'personId': pers['Beto'], 'positionType': 'Primera', 'marimbaId': 'G',
         'marimbaPositionId': 'g0', 'x': 1, 'y': 1, 'rotation': 0,
         'scaleX': 1, 'scaleY': 1},
        {'id': 'person_%d' % pers['Ana'], 'type': 'person', 'name': 'Ana',
         'personId': pers['Ana'], 'positionType': 'Segunda', 'marimbaId': 'C',
         'marimbaPositionId': 'c0', 'x': 1, 'y': 301, 'rotation': 0,
         'scaleX': 1, 'scaleY': 1}]}
    db.add(Composition(project_id=song.project_id, song_id=song.id,
                       name='prev ' + song.name, width=1600, height=900,
                       data=data))
    db.commit()


def test_d4_ambos_endpoints_coinciden_en_las_asignaciones():
    """El caso en que antes divergian: misma cancion, distinta decision."""
    db, pr, pos, pers, s1, s2 = _piso('d4coincide')
    try:
        _composicion_previa(db, s1, pers)
        db.add_all([
            SongAssignment(song_id=s1.id, person_id=pers['Ana'],
                           position_id=pos['Segunda']),
            SongAssignment(song_id=s1.id, person_id=pers['Beto'],
                           position_id=pos['Primera'])])
        db.commit()
        # La cancion actual pide 2 Primera (Ana flexible, Beto solo Primera).
        db.add_all([
            SongAssignment(song_id=s2.id, person_id=pers['Ana'],
                           position_id=pos['Primera']),
            SongAssignment(song_id=s2.id, person_id=pers['Beto'],
                           position_id=pos['Primera'])])
        db.commit()

        a = get_suggestions_for_song(s2.id, db)
        b = get_distribution_for_song(s2.id, db)
        ma = {p['person_id']: p['marimba_name'] for p in a['proposals']}
        mb = {x['person_id']: x['marimba_name'] for x in b['assignments']}
        assert set(ma) == set(mb), 'los dos endpoints asignan a distinta gente'
        for pid in ma:
            assert ma[pid] == mb[pid], 'misma persona, marimba distinta'
    finally:
        db.close()


def test_d4_el_formato_no_altera_la_distribucion():
    """Cambiar solo el adaptador no debe cambiar a quien se asigna."""
    db, pr, pos, pers, s1, s2 = _piso('d4formato')
    try:
        db.add(MarimbaTemplate(name='Grande ' + pr.name,
                               positions=['Primera', 'Primera']))
        db.add(MarimbaTemplate(name='Chica ' + pr.name, positions=['Segunda']))
        db.commit()
        db.add_all([
            SongAssignment(song_id=s2.id, person_id=pers['Ana'],
                           position_id=pos['Primera']),
            SongAssignment(song_id=s2.id, person_id=pers['Beto'],
                           position_id=pos['Primera'])])
        db.commit()

        song = db.get(Song, s2.id)
        core = build_distribution_core(song, db)
        r1 = to_suggestions_response(core)
        r2 = to_distribution_response(core)
        p1 = {p['person_id']: p['position_type'] for p in r1['proposals']}
        p2 = {x['person_id']: x['musical_position'] for x in r2['assignments']}
        assert p1 == p2
    finally:
        db.close()


def test_d4_marimba_plan_conservado_y_coherente():
    """`marimba_plan` sigue existiendo y no contradice a las asignaciones."""
    db, pr, pos, pers, s1, s2 = _piso('d4plan')
    try:
        db.add(MarimbaTemplate(name='Grande ' + pr.name,
                               positions=['Primera', 'Primera']))
        db.commit()
        db.add_all([
            SongAssignment(song_id=s2.id, person_id=pers['Ana'],
                           position_id=pos['Primera']),
            SongAssignment(song_id=s2.id, person_id=pers['Beto'],
                           position_id=pos['Primera'])])
        db.commit()

        a = get_suggestions_for_song(s2.id, db)
        assert 'marimba_plan' in a
        plan_names = {m['name'] for m in a['marimba_plan']}
        for p in a['proposals']:
            assert p['marimba_name'] in plan_names
        flat = {(m['name'], pn) for m in a['marimba_plan']
                for pn in m['positions']}
        for p in a['proposals']:
            assert (p['marimba_name'], p['position_type']) in flat
    finally:
        db.close()


def test_d4_el_plan_se_deriva_de_los_puestos_usados():
    """`plan_from_slots` agrupa por instancia, no por nombre."""
    slots = [
        {'marimba_id': 'mb_1', 'marimba_name': 'Igual', 'slot_id': 'a0',
         'position_type': 'Primera', 'slot_index': 0, 'occupied_by': None},
        {'marimba_id': 'mb_2', 'marimba_name': 'Igual', 'slot_id': 'b0',
         'position_type': 'Primera', 'slot_index': 0, 'occupied_by': None},
    ]
    plan = plan_from_slots(slots)
    # Dos instancias homonimas siguen siendo dos entradas distintas.
    assert len(plan) == 2
    assert {m['id'] for m in plan} == {'mb_1', 'mb_2'}


def test_d4_contratos_conservados():
    """Cada endpoint mantiene SUS claves, aunque el nucleo sea el mismo."""
    db, pr, pos, pers, s1, s2 = _piso('d4contrato')
    try:
        db.add(MarimbaTemplate(name='G ' + pr.name,
                               positions=['Primera', 'Segunda']))
        db.commit()
        db.add_all([
            SongAssignment(song_id=s2.id, person_id=pers['Ana'],
                           position_id=pos['Primera']),
            SongAssignment(song_id=s2.id, person_id=pers['Beto'],
                           position_id=pos['Segunda'])])
        db.commit()

        a = get_suggestions_for_song(s2.id, db)
        b = get_distribution_for_song(s2.id, db)
        for k in ('song_name', 'position_counts', 'proposals', 'marimba_plan',
                  'duplicates_dropped', 'unplaced', 'people_with_history',
                  'people_without_history', 'changes'):
            assert k in a, 'falta %s en /suggestions' % k
        for k in ('song_id', 'song_name', 'previous_song', 'slot_source',
                  'position_aliases', 'marimbas_available', 'capacity',
                  'assignments', 'unfulfilled_requirements', 'warnings',
                  'total_cost'):
            assert k in b, 'falta %s en /distribution-suggestion' % k
        for x in b['assignments']:
            assert 'cost' in x
    finally:
        db.close()


def test_d4_duplicates_dropped_informa_real():
    """`duplicates_dropped` cuenta las filas descartadas de verdad."""
    db, pr, pos, pers, s1, s2 = _piso('d4dup')
    try:
        db.add(MarimbaTemplate(name='G ' + pr.name,
                               positions=['Primera', 'Primera']))
        db.commit()
        # Ana con 2 filas (Primera y Segunda): solo puede ocupar un puesto.
        for n in ('Primera', 'Segunda'):
            db.add(SongAssignment(song_id=s2.id, person_id=pers['Ana'],
                                  position_id=pos[n]))
        db.add(SongAssignment(song_id=s2.id, person_id=pers['Beto'],
                              position_id=pos['Primera']))
        db.commit()
        a = get_suggestions_for_song(s2.id, db)
        # 3 filas, 2 personas distintas -> se descarta 1.
        assert a['duplicates_dropped'] == 1
        ids = [p['person_id'] for p in a['proposals']]
        assert len(ids) == len(set(ids))
    finally:
        db.close()


def test_d4_normalizacion_se_mantiene_en_ambos():
    """Singular/plural y erratas siguen funcionando via el nucleo comun."""
    db = SessionLocal()
    try:
        pr = Project(name='d4norm'); db.add(pr); db.commit(); db.refresh(pr)
        pp = Position(name='Primeras')   # en plural, como el Excel
        db.add(pp); db.commit(); db.refresh(pp)
        x = Person(name='Ana ' + pr.name); db.add(x); db.commit(); db.refresh(x)
        s = Song(project_id=pr.id, name='S', order_index=0)
        db.add(s); db.commit(); db.refresh(s)
        db.add(SongAssignment(song_id=s.id, person_id=x.id, position_id=pp.id))
        db.commit()
        # Plantilla en singular: debe cubrir "Primeras".
        db.add(MarimbaTemplate(name='G ' + pr.name, positions=['Primera']))
        db.commit()
        b = get_distribution_for_song(s.id, db)
        assert len(b['assignments']) == 1
        assert b['assignments'][0]['musical_position'] == 'Primera'
        a = get_suggestions_for_song(s.id, db)
        assert len(a['proposals']) == 1
    finally:
        db.close()


def test_d4_sin_duplicados_en_ningun_endpoint():
    db, pr, pos, pers, s1, s2 = _piso('d4nodup')
    try:
        db.add(MarimbaTemplate(name='G ' + pr.name,
                               positions=['Primera', 'Primera']))
        db.commit()
        for n in ('Primera', 'Segunda'):
            db.add(SongAssignment(song_id=s2.id, person_id=pers['Ana'],
                                  position_id=pos[n]))
        db.add(SongAssignment(song_id=s2.id, person_id=pers['Beto'],
                              position_id=pos['Primera']))
        db.commit()
        a = get_suggestions_for_song(s2.id, db)
        b = get_distribution_for_song(s2.id, db)
        for lista in (a['proposals'], b['assignments']):
            ids = [x['person_id'] for x in lista]
            assert len(ids) == len(set(ids))
    finally:
        db.close()


def test_d4_determinista():
    """El mismo nucleo produce el mismo resultado."""
    db, pr, pos, pers, s1, s2 = _piso('d4det')
    try:
        db.add(MarimbaTemplate(name='G ' + pr.name,
                               positions=['Primera', 'Primera']))
        db.commit()
        db.add_all([
            SongAssignment(song_id=s2.id, person_id=pers['Ana'],
                           position_id=pos['Primera']),
            SongAssignment(song_id=s2.id, person_id=pers['Beto'],
                           position_id=pos['Primera'])])
        db.commit()
        v1 = get_distribution_for_song(s2.id, db)
        v2 = get_distribution_for_song(s2.id, db)
        assert v1['assignments'] == v2['assignments']
        assert v1['total_cost'] == v2['total_cost']
    finally:
        db.close()
