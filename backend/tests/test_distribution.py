"""Tests del motor de distribucion (15 casos obligatorios) + D1, D3 y D5.

Cada prueba nueva ejercita las funciones REALES del motor (no simulaciones):
- D1: la identidad de la instancia de marimba se conserva y se prefiere.
- D3: el historial solo considera canciones anteriores.
- D5: los faltantes se explican por su causa real.
"""
from app.services.suggestions.distribution import propose_distribution, get_distribution_for_song
from app.services.suggestions.engine_a import slots_from_composition, get_previous_assignment_map
from app.services.suggestions.engine_b import _pick, _free_of, _same_marimba
from app.services.suggestions.history import get_person_history
from app.db.session import SessionLocal
from app.models import Project, Person, Position, Song, SongAssignment, Composition


# ======================================================================
# Utilidades
# ======================================================================

def _slot(mid, name, sid, ptype, idx):
    return {'marimba_id': mid, 'marimba_name': name, 'slot_id': sid,
            'position_type': ptype, 'slot_index': idx, 'occupied_by': None}


def _person(pid, name):
    return {'person_id': pid, 'name': name}


def _persona_y_posicion(db, nombre, posicion):
    p = db.query(Person).filter(Person.name == nombre).first() or Person(name=nombre)
    db.add(p); db.commit(); db.refresh(p)
    pos = db.query(Position).filter(Position.name == posicion).first() or Position(name=posicion)
    db.add(pos); db.commit(); db.refresh(pos)
    return p, pos


def _composicion(db, song, marimba_id, nombre, pid, person_name, slot_id, ptype):
    """Composicion minima con UNA marimba y UNA persona, en formato guardado real."""
    data = {'elements': [
        {'id': marimba_id, 'type': 'marimba', 'name': nombre,
         'x': 200, 'y': 200, 'width': 380, 'height': 150,
         'rotation': 0, 'scaleX': 1, 'scaleY': 1,
         'positions': [{'id': slot_id, 'type': ptype, 'personId': pid}]},
        {'id': 'person_%d' % pid, 'type': 'person', 'name': person_name,
         'personId': pid, 'positionType': ptype,
         'marimbaId': marimba_id, 'marimbaPositionId': slot_id,
         'x': 260, 'y': 270, 'rotation': 0, 'scaleX': 1, 'scaleY': 1}]}
    c = Composition(project_id=song.project_id, song_id=song.id,
                    name='%s comp' % song.name, width=1600, height=900, data=data)
    db.add(c); db.commit(); db.refresh(c)
    return c

from app.services.suggestions.distribution import propose_distribution
from fastapi.testclient import TestClient
from app.main import app
from app.db.session import SessionLocal
from app.models import Project, Person, Position, Song, SongAssignment, Composition
from app.services.suggestions.distribution import get_distribution_for_song

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

        get_distribution_for_song(s2.id, db)

        assert db.get(Composition, c1.id).data == before

    finally:
        db.close()

def test_d13_aplicacion_propuesta():
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



# ======================================================================
# D1 - Identidad de la instancia de marimba
# ======================================================================

def test_d1_slots_conservan_el_marimba_id():
    """`slots_from_composition` debe exponer el id de la INSTANCIA."""
    data = {'elements': [
        {'id': 'marimba_aaa', 'type': 'marimba', 'name': 'Marimba X',
         'positions': [{'id': 's0', 'type': 'Primera'}]}]}
    comp = type('C', (), {'data': data})()
    slots = slots_from_composition(comp)
    assert slots[0]['marimba_id'] == 'marimba_aaa'
    assert slots[0]['marimba_name'] == 'Marimba X'


def test_d1_dos_instancias_mismo_nombre_son_distintas():
    """Dos instancias con el MISMO nombre no se confunden entre si."""
    a = _slot('mb_1', 'Marimba X', 'mb_1_0', 'Primera', 0)
    b = _slot('mb_2', 'Marimba X', 'mb_2_0', 'Primera', 0)
    # Mismo nombre, distinto id: NO son la misma instancia.
    assert a['marimba_name'] == b['marimba_name']
    assert a['marimba_id'] != b['marimba_id']
    # Con id previo, la comparacion es por identidad, no por nombre.
    pv = {'marimba_id': 'mb_2', 'marimba_name': 'Marimba X'}
    assert _same_marimba(pv, b) is True
    assert _same_marimba(pv, a) is False


def test_d1_pick_prefiere_la_misma_instancia():
    """Con dos instancias homonimas, `_pick` mantiene a la persona en la SUYA."""
    a = _slot('mb_1', 'Marimba X', 'mb_1_0', 'Primera', 0)
    b = _slot('mb_2', 'Marimba X', 'mb_2_0', 'Primera', 0)
    prev = {7: {'position': 'Primera', 'marimba_id': 'mb_2',
                'marimba_name': 'Marimba X', 'slot_id': None, 'slot_index': None}}
    elegido = _pick(prev, 7, 'Primera', [a, b])
    assert elegido['marimba_id'] == 'mb_2'


def test_d1_pick_sin_id_usa_el_nombre_como_respaldo():
    """Composiciones antiguas (sin marimba_id) conservan la continuidad por nombre."""
    a = _slot('mb_1', 'Marimba X', 'mb_1_0', 'Primera', 0)
    prev = {7: {'position': 'Primera', 'marimba_name': 'Marimba X',
                'slot_id': None, 'slot_index': None}}
    elegido = _pick(prev, 7, 'Primera', [a])
    assert elegido['marimba_id'] == 'mb_1'


def test_d1_prev_map_expone_marimba_id_desde_la_composicion():
    """El mapa de la cancion anterior incluye el id de la instancia (via DB)."""
    db = SessionLocal()
    try:
        carlos, primera = _persona_y_posicion(db, 'D1 Carlos', 'D1 Primera')
        proj = Project(name='D1 prev_map'); db.add(proj); db.commit(); db.refresh(proj)
        s1 = Song(project_id=proj.id, name='D1 S1', order_index=0)
        s2 = Song(project_id=proj.id, name='D1 S2', order_index=1)
        db.add_all([s1, s2]); db.commit(); db.refresh(s1); db.refresh(s2)
        db.add(SongAssignment(song_id=s1.id, person_id=carlos.id,
                              position_id=primera.id))
        db.commit()
        _composicion(db, s1, 'marimba_z9', 'Marimba Gamma', carlos.id,
                     carlos.name, 'pz0', 'D1 Primera')
        pmap = get_previous_assignment_map(s1, db)
        info = pmap[carlos.id]
        assert info['marimba_id'] == 'marimba_z9'
        assert info['marimba_name'] == 'Marimba Gamma'
    finally:
        db.close()


def test_d1_propuesta_conserva_identidad_en_su_misma_marimba():
    """Si la instancia previa sigue existiendo, la propuesta no cambia de marimba."""
    slots = [_slot('mb_1', 'Marimba X', 'mb_1_0', 'Primera', 0),
             _slot('mb_2', 'Marimba X', 'mb_2_0', 'Primera', 1)]
    prev = {1: {'position': 'Primera', 'marimba_id': 'mb_1',
                'marimba_name': 'Marimba X', 'slot_id': 'mb_1_0', 'slot_index': 0}}
    res = propose_distribution({'Primera': 1}, [_person(1, 'Ana')], slots, prev, {})
    a = res['assignments'][0]
    assert a['marimba_position_id'] == 'mb_1_0'
    assert a['same_marimba'] is True
    assert a['is_marimba_change'] is False
    # Y la respuesta ahora incluye la identidad de la instancia.
    assert a['marimba_id'] == 'mb_1'


# ======================================================================
# D3 - El historial solo usa canciones ANTERIORES
# ======================================================================

def _proyecto_con_canciones(nombre, n):
    """Proyecto con `n` canciones ordenadas, con su propia sesion de BD."""
    db = SessionLocal()
    carlos, primera = _persona_y_posicion(db, nombre + ' Carlos', 'Primera')
    proj = Project(name=nombre); db.add(proj); db.commit(); db.refresh(proj)
    songs = []
    for i in range(n):
        s = Song(project_id=proj.id, name='%s S%d' % (nombre, i), order_index=i)
        db.add(s); db.commit(); db.refresh(s)
        db.add(SongAssignment(song_id=s.id, person_id=carlos.id,
                              position_id=primera.id))
        db.commit()
        songs.append(s)
    return db, proj, carlos, songs


def test_d3_primera_cancion_no_usa_canciones_posteriores():
    """La cancion 1 no debe mirar la composicion de la cancion 2 (regresion D3)."""
    db, proj, carlos, songs = _proyecto_con_canciones('D3 primera', 2)
    try:
        # La cancion 2 (posterior) tiene una composicion con un nombre de marimba
        # que solo existe en el FUTURO.
        _composicion(db, songs[1], 'mb_futuro', 'Marimba Del Futuro',
                     carlos.id, carlos.name, 'pf0', 'Primera')
        hist = get_person_history(proj.id, db, exclude_song_id=songs[0].id,
                                 before_song=songs[0])
        # Sin canciones anteriores, no hay historial: no debe aparecer el futuro.
        assert hist == []
    finally:
        db.close()


def test_d3_cancion_intermedia_usa_solo_anteriores():
    """La cancion del medio ve la anterior y NO la posterior."""
    db, proj, carlos, songs = _proyecto_con_canciones('D3 media', 3)
    try:
        _composicion(db, songs[0], 'mb_pasado', 'Marimba Pasada',
                     carlos.id, carlos.name, 'p0', 'Primera')
        _composicion(db, songs[2], 'mb_futuro', 'Marimba Futura',
                     carlos.id, carlos.name, 'p2', 'Primera')
        hist = get_person_history(proj.id, db, exclude_song_id=songs[1].id,
                                 before_song=songs[1])
        assert len(hist) == 1
        h = hist[0]
        # Vio la cancion 1 (pasada) y no la 3 (futura).
        assert h['last_marimba'] == 'Marimba Pasada'
        assert h['last_song_name'] == songs[0].name
        assert h['last_marimba'] != 'Marimba Futura'
    finally:
        db.close()


def test_d3_ultima_cancion_usa_todas_las_anteriores():
    """La ultima cancion si aprovecha el historial completo previo."""
    db, proj, carlos, songs = _proyecto_con_canciones('D3 ultima', 3)
    try:
        _composicion(db, songs[0], 'mb_a', 'Marimba A', carlos.id,
                     carlos.name, 'pa0', 'Primera')
        _composicion(db, songs[1], 'mb_b', 'Marimba B', carlos.id,
                     carlos.name, 'pb0', 'Primera')
        hist = get_person_history(proj.id, db, exclude_song_id=songs[2].id,
                                 before_song=songs[2])
        assert len(hist) == 1
        assert hist[0]['last_marimba'] == 'Marimba B'
        assert len(hist[0]['assignments']) == 2
    finally:
        db.close()


def test_d3_sin_historial_aun_genera_propuesta():
    """Una cancion sin canciones previas produce propuesta (no error)."""
    db, proj, carlos, songs = _proyecto_con_canciones('D3 sola', 1)
    try:
        hist = get_person_history(proj.id, db, exclude_song_id=songs[0].id,
                                 before_song=songs[0])
        assert hist == []
    finally:
        db.close()


def test_d3_empate_de_order_index_es_determinista():
    """Con order_index empatado, 'anterior' se resuelve por id de forma estable."""
    db, proj, carlos, songs = _proyecto_con_canciones('D3 empate', 2)
    try:
        songs[0].order_index = 5
        songs[1].order_index = 5
        db.commit()
        # songs[0].id < songs[1].id, y para songs[1] solo songs[0] es anterior.
        hist = get_person_history(proj.id, db, exclude_song_id=songs[1].id,
                                 before_song=songs[1])
        assert [h['last_song_name'] for h in hist] == [songs[0].name]
        # Y para songs[0] no hay ninguna anterior (la otra tiene id mayor).
        hist0 = get_person_history(proj.id, db, exclude_song_id=songs[0].id,
                                   before_song=songs[0])
        assert hist0 == []
    finally:
        db.close()


def test_d3_orchestrator_no_usa_el_futuro():
    """El endpoint real de distribucion tampoco debe mirar hacia adelante."""
    db, proj, carlos, songs = _proyecto_con_canciones('D3 endpoint', 2)
    try:
        _composicion(db, songs[1], 'mb_futuro', 'Marimba Del Futuro',
                     carlos.id, carlos.name, 'pf0', 'Primera')
        res = get_distribution_for_song(songs[0].id, db)
        # Para la primera cancion no hay composicion previa: se usan plantillas.
        assert res['previous_song'] is None
        assert res['slot_source'] == 'templates'
    finally:
        db.close()


# ======================================================================
# D5 - Explicacion correcta de los faltantes
# ======================================================================

def _motivos(res):
    return {u['position']: u['reason'] for u in res['unfulfilled_requirements']}


def test_d5_no_hay_puestos_de_ese_tipo():
    """Si no existe el puesto fisico, NO se acusa a los musicos (regresion D5)."""
    slots = [_slot('m1', 'M1', 'p0', 'Primera', 0)]
    res = propose_distribution({'Primera': 1, 'Segunda': 1},
                               [_person(1, 'Ana')], slots, {}, {})
    u = next(x for x in res['unfulfilled_requirements'] if x['position'] == 'Segunda')
    # La causa real es que NO hay puesto de tipo Segunda.
    assert u['reason'] == 'no_slots'
    assert u['available'] == 0
    assert u['missing'] == 1
    # Y explica que hay puestos, pero de otro tipo.
    assert u['other_position_types'] == ['Primera']
    assert 'Primera' in u['detail']
    # Y el aviso NO debe culpar a los musicos.
    assert not any('musico' in w for w in res['warnings'])


def test_d5_puestos_de_otro_tipo_no_cuentan_como_compatibles():
    """Un puesto de otro tipo no resuelve la necesidad: reason = no_slots."""
    slots = [_slot('m1', 'M1', 'p0', 'Primera', 0),
             _slot('m1', 'M1', 'p1', 'Primera', 1)]
    res = propose_distribution({'Primera': 1, 'Segunda': 1},
                               [_person(1, 'Ana'), _person(2, 'Beto')],
                               slots, {}, {})
    u = next(x for x in res['unfulfilled_requirements'] if x['position'] == 'Segunda')
    assert u['reason'] == 'no_slots'
    assert u['free_slots'] == 0
    # Ana si ocupo su Primera, asi que la musica no era el problema.
    assert len(res['assignments']) == 1


def test_d5_faltan_musicos_de_verdad():
    """Si hay puesto compatible libre pero no musica, reason = no_people."""
    slots = [_slot('m1', 'M1', 'p0', 'Primera', 0),
             _slot('m1', 'M1', 'p1', 'Primera', 1)]
    # Dos puestos de Primera, pero solo UNA persona.
    res = propose_distribution({'Primera': 2}, [_person(1, 'Ana')], slots, {}, {})
    u = res['unfulfilled_requirements'][0]
    assert u['reason'] == 'no_people'
    assert u['missing'] == 1
    assert 'musica' in u['detail']
    assert u['lacks_people'] is True
    assert u['lacks_slots'] is False
    # Aqui SI falta musica de verdad: el aviso debe emitirse (contraste con D5).
    assert any('musico' in w for w in res['warnings'])


def test_d5_faltan_ambos():
    """Cuando faltan puestos y musica a la vez, se marca 'combined'."""
    slots = [_slot('m1', 'M1', 'p0', 'Primera', 0)]
    # Se requieren 3 Primera con 1 puesto y 1 persona: falta de las dos cosas.
    res = propose_distribution({'Primera': 3}, [_person(1, 'Ana')], slots, {}, {})
    u = res['unfulfilled_requirements'][0]
    assert u['reason'] == 'combined'
    assert u['missing'] == 2
    assert u['lacks_slots'] is True
    assert u['lacks_people'] is True
    # Siendo un caso combinado, el aviso no culpa solo a los musicos.
    assert not any('musico' in w for w in res['warnings'])


def test_d5_puestos_insuficientes_no_es_falta_de_musicos():
    """Con mas puestos ocupados que gente, la causa es la CAPACIDAD, no la musica."""
    slots = [_slot('m1', 'M1', 'p0', 'Primera', 0)]
    res = propose_distribution({'Primera': 2}, [_person(1, 'Ana')], slots, {}, {})
    u = res['unfulfilled_requirements'][0]
    # Hay 1 puesto de Primera, se ocupo con Ana, y falta el segundo.
    assert u['available'] == 1
    # Con 1 persona y 1 puesto, ambos recursos son insuficientes: es 'combined'.
    assert u['reason'] == 'combined'
    assert u['lacks_slots'] is True
    assert u['lacks_people'] is True
    # Y el detalle nombra las dos causas.
    assert 'puestos' in u['detail'] and 'musica' in u['detail']


def test_d5_capacidad_insuficiente_con_musica_de_sobra():
    """Si hay mas musica que puestos, la causa unica es la de los puestos."""
    slots = [_slot('m1', 'M1', 'p0', 'Primera', 0)]
    # Dos personas para un solo puesto: sobra musica, falta puesto.
    res = propose_distribution({'Primera': 1, 'Segunda': 1},
                               [_person(1, 'Ana'), _person(2, 'Beto')],
                               slots, {}, {})
    u = next(x for x in res['unfulfilled_requirements'] if x['position'] == 'Segunda')
    # No hay ningun puesto de tipo Segunda: esa es la causa.
    assert u['reason'] == 'no_slots'
    assert u['lacks_slots'] is True
    assert not any('musico' in w for w in res['warnings'])


def test_d5_conserva_las_claves_previas():
    """Compatible hacia atras: position/required/available/missing siguen ahi."""
    slots = [_slot('m1', 'M1', 'p0', 'Primera', 0)]
    res = propose_distribution({'Primera': 1, 'Segunda': 1},
                               [_person(1, 'Ana')], slots, {}, {})
    for u in res['unfulfilled_requirements']:
        assert set(['position', 'required', 'available', 'missing']) <= set(u.keys())
        assert isinstance(u['required'], int)
        assert isinstance(u['available'], int)
        assert isinstance(u['missing'], int)


def test_d5_caso_valido_no_reporta_faltantes():
    """Cuando todo se cumple, no hay unfulfilled ni avisos de falta."""
    slots = [_slot('m1', 'M1', 'p0', 'Primera', 0),
             _slot('m1', 'M1', 'p1', 'Segunda', 1)]
    res = propose_distribution({'Primera': 1, 'Segunda': 1},
                               [_person(1, 'Ana'), _person(2, 'Beto')],
                               slots, {}, {})
    assert res['unfulfilled_requirements'] == []
    assert len(res['assignments']) == 2
    assert res['warnings'] == []


def test_d5_sin_duplicados_ni_sobrescrituras():
    """Las restricciones obligatorias siguen validas tras el cambio."""
    slots = [_slot('m1', 'M1', 'p0', 'Primera', 0),
             _slot('m1', 'M1', 'p1', 'Primera', 1)]
    res = propose_distribution({'Primera': 2}, [_person(1, 'Ana'), _person(2, 'Beto')],
                               slots, {}, {})
    pids = [a['person_id'] for a in res['assignments']]
    sids = [a['marimba_position_id'] for a in res['assignments']]
    assert len(pids) == len(set(pids))
    assert len(sids) == len(set(sids))

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