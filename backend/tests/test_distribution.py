"""Tests del motor de distribucion (15 casos obligatorios)."""
from app.services.suggestions.distribution import propose_distribution
from fastapi.testclient import TestClient
from app.main import app
from app.db.session import SessionLocal
from app.models import Project, Person, Position, Song, SongAssignment, Composition

def _slots(specs):
    return [{'marimba_name': m, 'slot_id': s, 'position_type': t,
             'slot_index': i, 'occupied_by': None}
            for (i, (m, s, t)) in enumerate(specs)]

def _people(specs):
    return [{'person_id': pid, 'name': n} for (pid, n) in specs]

def test_d01_exacta_posible():
    slots = _slots([('Marimba A', 'p0', 'Primera'), ('Marimba A', 'p2', 'Segunda')])
    res = propose_distribution({'Primera': 1, 'Segunda': 1},
                               _people([(1, 'Carlos'), (2, 'Ana')]),
                               slots, {}, {})
    
    assert len(res['assignments']) == 2
    assert res['unfulfilled_requirements'] == []

def test_d02_continuidad_completa():
    slots = _slots([('Marimba A', 'p0', 'Primera')])
    prev = {1: {'position': 'Primera', 'marimba_name': 'Marimba A', 'slot_id': 'p0'}}
    hist = {1: {'positions': ['Primera'], 'position_frequency': {'Primera': 2}}}
    res = propose_distribution({'Primera': 1}, _people([(1, 'Carlos')]),
                               slots, prev, hist)
    a = res['assignments'][0]

    assert a['same_position'] and a['same_marimba'] and a['same_physical_slot']
    assert not a['is_marimba_change'] and not a['is_position_change']

def test_d03_cambio_marimba():
    slots = _slots([('Marimba B', 'q0', 'Primera')])
    prev = {1: {'position': 'Primera', 'marimba_name': 'Marimba A', 'slot_id': 'p0'}}
    hist = {1: {'positions': ['Primera'], 'position_frequency': {'Primera': 1}}}
    res = propose_distribution({'Primera': 1}, _people([(1, 'Carlos')]),
                               slots, prev, hist)
    a = res['assignments'][0]

    assert a['is_marimba_change'] is True
    assert 'cambio de marimba' in a['reason']

def test_d04_cambio_posicion():
    slots = _slots([('Marimba A', 'p2', 'Segunda')])
    prev = {1: {'position': 'Primera', 'marimba_name': 'Marimba A', 'slot_id': 'p0'}}
    hist = {1: {'positions': ['Primera', 'Segunda'],
                'position_frequency': {'Primera': 3, 'Segunda': 1}}}
    res = propose_distribution({'Segunda': 1}, _people([(1, 'Carlos')]),
                               slots, prev, hist)
    a = res['assignments'][0]

    assert a['is_position_change'] is True
    assert a['same_marimba'] is True
    assert a['is_marimba_change'] is False

def test_d05_cambio_slot_fisico():
    slots = _slots([('Marimba A', 'p0', 'Primera'), ('Marimba A', 'p1', 'Primera')])
    prev = {1: {'position': 'Primera', 'marimba_name': 'Marimba A', 'slot_id': 'p0'}}
    hist = {1: {'positions': ['Primera'], 'position_frequency': {'Primera': 1}}}
    taken = propose_distribution({'Primera': 2},
                                 _people([(9, 'Otro'), (1, 'Carlos')]),
                                 slots, prev, hist)
    carlos = next(a for a in taken['assignments'] if a['person_id'] == 1)

    assert carlos['same_marimba'] is True
    assert carlos['is_marimba_change'] is False

def test_d06_persona_sin_historial():
    slots = _slots([('Marimba A', 'p0', 'Primera')])
    res = propose_distribution({'Primera': 1}, _people([(5, 'Nueva')]),
                               slots, {}, {})
    
    assert len(res['assignments']) == 1
    assert 'sin historial' in res['assignments'][0]['reason']

def test_d07_persona_insuficiente():
    slots = _slots([('Marimba A', 'p0', 'Primera'), ('Marimba A', 'p1', 'Primera')])
    res = propose_distribution({'Primera': 2}, _people([(1, 'Carlos')]),
                               slots, {}, {})
    
    assert res['unfulfilled_requirements'][0]['missing'] == 1
    assert any('musico' in w for w in res['warnings'])

def test_d08_slots_insuficientes():
    slots = _slots([('Marimba A', 'p0', 'Primera')])
    res = propose_distribution({'Primera': 2},
                               _people([(1, 'Carlos'), (2, 'Ana')]),
                               slots, {}, {})
    u = res['unfulfilled_requirements'][0]

    assert (u['required'], u['available'], u['missing']) == (2, 1, 1)

def test_d12_composicion_anterior_intacta():
    db = SessionLocal()

    try:
        proj = Project(name='Dist intacta')
        db.add(proj)
        db.commit()
        db.refresh(proj)
        car = Person(name='DI Carlos')
        db.add(car)
        db.commit()
        db.refresh(car)
        pp = db.query(Position).filter(Position.name == 'Primera').first() or Position(name='Primera')
        db.add(pp)
        db.commit()
        db.refresh(pp)
        s1 = Song(project_id=proj.id, name='S1', order_index=0)
        s2 = Song(project_id=proj.id, name='S2', order_index=1)
        db.add_all([s1, s2])
        db.commit()
        db.refresh(s1)
        db.refresh(s2)
        db.add_all([SongAssignment(song_id=s1.id, person_id=car.id, position_id=pp.id),
                    SongAssignment(song_id=s2.id, person_id=car.id, position_id=pp.id)])
        db.commit()
        data = {'elements': [
            {'id': 'mb1', 'type': 'marimba', 'name': 'Marimba A', 'x': 1, 'y': 1,
             'width': 10, 'height': 10, 'rotation': 0, 'scaleX': 1, 'scaleY': 1,
             'positions': [{'id': 'p0', 'type': 'Primera', 'personId': car.id}]},
            {'id': 'person_%d' % car.id, 'type': 'person', 'name': 'DI Carlos',
             'personId': car.id, 'positionType': 'Primera', 'marimbaId': 'mb1',
             'marimbaPositionId': 'p0', 'x': 1, 'y': 1,
             'rotation': 0, 'scaleX': 1, 'scaleY': 1}]}
        c1 = Composition(project_id=proj.id, song_id=s1.id, name='S1 dist',
                         width=1600, height=900, data=data)
        db.add(c1)
        db.commit()
        db.refresh(c1)
        before = dict(db.get(Composition, c1.id).data)
        from app.services.suggestions.distribution import get_distribution_for_song
        get_distribution_for_song(s2.id, db)
        assert db.get(Composition, c1.id).data == before
    finally:
        db.close()

def test_d13_aplicacion_propuesta():
    from fastapi.testclient import TestClient
    from app.main import app
    from app.db.session import SessionLocal
    from app.models import Project, Person, Position, Song, SongAssignment, Composition
    client = TestClient(app)
    db = SessionLocal()

    try:
        proj = Project(name='Dist apply')

        db.add(proj)
        db.commit()
        db.refresh(proj)

        car = Person(name='DA Carlos')

        db.add(car)
        db.commit()
        db.refresh(car)

        pp = db.query(Position).filter(Position.name == 'Primera').first() or Position(name='Primera')

        db.add(pp)
        db.commit()
        db.refresh(pp)

        s1 = Song(project_id=proj.id, name='S1', order_index=0)
        s2 = Song(project_id=proj.id, name='S2', order_index=1)

        db.add_all([s1, s2])
        db.commit()
        db.refresh(s1)
        db.refresh(s2)
        db.add_all([SongAssignment(song_id=s1.id, person_id=car.id, position_id=pp.id),
                    SongAssignment(song_id=s2.id, person_id=car.id, position_id=pp.id)])
        db.commit()

        data = {'elements': [
            {'id': 'mb1', 'type': 'marimba', 'name': 'Marimba A', 'x': 1, 'y': 1,
             'width': 10, 'height': 10, 'rotation': 0, 'scaleX': 1, 'scaleY': 1,
             'positions': [{'id': 'p0', 'type': 'Primera', 'personId': car.id}]},
            {'id': 'person_%d' % car.id, 'type': 'person', 'name': 'DA Carlos',
             'personId': car.id, 'positionType': 'Primera', 'marimbaId': 'mb1',
             'marimbaPositionId': 'p0', 'x': 1, 'y': 1,
             'rotation': 0, 'scaleX': 1, 'scaleY': 1}]}
        
        db.add(Composition(project_id=proj.id, song_id=s1.id, name='S1 dist',
                           width=1600, height=900, data=data))
        db.commit()

        r = client.get('/api/songs/%d/distribution-suggestion' % s2.id)

        assert r.status_code == 200

        body = r.json()

        assert body['song_id'] == s2.id

        r2 = client.post('/api/songs/%d/distribution/apply' % s2.id,
                         json={'proposals': body['assignments'], 'name': 'S2 dist'})
        
        assert r2.status_code == 200
        assert r2.json()['name'] == 'S2 dist'

    finally:
        db.close()

def test_d14_proyecto_inexistente():
    client = TestClient(app)

    assert client.get('/api/projects/99999999').status_code == 404

def test_d15_cancion_inexistente():
    client = TestClient(app)

    assert client.get('/api/songs/99999999/distribution-suggestion').status_code == 404

def test_d09_posicion_inexistente():
    slots = _slots([('Marimba A', 'p0', 'Primera')])
    res = propose_distribution({'Tenor': 1}, _people([(1, 'Carlos')]),
                               slots, {}, {})
    
    assert res['unfulfilled_requirements'][0]['position'] == 'Tenor'
    assert any('Tenor' in w for w in res['warnings'])

def test_d10_persona_no_duplicada():
    slots = _slots([('Marimba A', 'p0', 'Primera'), ('Marimba A', 'p2', 'Segunda')])
    res = propose_distribution({'Primera': 1, 'Segunda': 1},
                               _people([(1, 'Carlos')]),
                               slots, {}, {})
    pids = [a['person_id'] for a in res['assignments']]

    assert len(pids) == len(set(pids))
    assert len(res['assignments']) == 1

def test_d11_slot_no_duplicado():
    slots = _slots([('Marimba A', 'p0', 'Primera')])
    res = propose_distribution({'Primera': 2},
                               _people([(1, 'Carlos'), (2, 'Ana')]),
                               slots, {}, {})
    sids = [a['marimba_position_id'] for a in res['assignments']]

    assert len(sids) == len(set(sids))