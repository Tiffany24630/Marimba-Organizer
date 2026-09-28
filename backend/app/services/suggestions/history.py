from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models import Song, Person, Composition

def parse_composition_marimba_info(data):
    """Parse composition.data -> {person_id: {marimba_name, position_type, physical_index}}"""
    if not data or not isinstance(data, dict):
        return {}

    elements = data.get('elements', [])

    if not isinstance(elements, list):
        return {}

    marimba_names = {}
    position_info = {}

    for e in elements:
        if isinstance(e, dict) and e.get('type') == 'marimba':
            mid = e.get('id', '')
            marimba_names[mid] = e.get('name', '')
            positions = e.get('positions', [])

            if isinstance(positions, list):
                for idx, p in enumerate(positions):
                    if isinstance(p, dict):
                        position_info[p.get('id', '')] = (mid, idx, p.get('type', ''))

    person_marimba = {}
    for e in elements:
        if isinstance(e, dict) and e.get('type') == 'person' and e.get('personId') is not None:
            pid = e['personId']
            mname = marimba_names.get(e.get('marimbaId', ''), '')
            pinfo = position_info.get(e.get('marimbaPositionId', ''))
            physical_index = pinfo[1] if pinfo else None
            position_type = pinfo[2] if pinfo else e.get('positionType', '')
            person_marimba[pid] = {
                'marimba_name': mname,
                'position_type': position_type,
                'physical_index': physical_index,
            }

    return person_marimba

def get_person_history(project_id, db, exclude_song_id=None, before_song=None):
    """
    Derivar historial de cada persona desde las canciones y composiciones del proyecto.

    `exclude_song_id` excluye una cancion concreta (la que se esta organizando).
    `before_song` acota el historial a las canciones ANTERIORES a esa, segun
    `order_index`. Sin ese dato, el historial incluiria tambien las canciones
    posteriores y la propuesta de la primera cancion se decidiria con informacion
    del futuro (D3).

    El desempate es estable: al compartir `order_index` se ordena por `id`, de modo
    que "anterior" significa un par (order_index, id) estrictamente menor. El
    resultado es determinista ante empates.
    """
    songs = db.scalars(select(Song).where(
        Song.project_id == project_id
    ).order_by(Song.order_index, Song.id)).all()

    if exclude_song_id is not None:
        songs = [s for s in songs if s.id != exclude_song_id]

    if before_song is not None:
        limit = (before_song.order_index, before_song.id)
        songs = [s for s in songs
                 if (s.order_index or 0, s.id) < (limit[0] or 0, limit[1])]

    song_ids = [s.id for s in songs]

    if song_ids:
        comps = db.scalars(select(Composition).where(
            Composition.song_id.in_(song_ids)
        )).all()
    else:
        comps = []

    song_to_comp_data = {c.song_id: c.data for c in comps if c.song_id is not None and c.data}

    history = {}

    for song in songs:
        comp_data = song_to_comp_data.get(song.id, {})
        marimba_info = parse_composition_marimba_info(comp_data)

        for assignment in song.assignments:
            pid = assignment.person_id

            if pid not in history:
                person = db.get(Person, pid)
                history[pid] = {
                    'person_id': pid,
                    'name': person.name if person else 'Desconocida',
                    'positions': [],
                    'marimbas': [],
                    'position_frequency': {},
                    'marimba_frequency': {},
                    'assignments': [],
                    'last_song_name': None,
                    'last_position': None,
                    'last_marimba': None,
                    'last_physical_position': None,
                }

            pos_name = assignment.position.name
            h = history[pid]

            if pos_name not in h['position_frequency']:
                h['position_frequency'][pos_name] = 0
                h['positions'].append(pos_name)

            h['position_frequency'][pos_name] += 1

            info = marimba_info.get(pid, {})
            marimba_name = info.get('marimba_name', '')
            physical_index = info.get('physical_index')
            position_type = info.get('position_type', pos_name)

            if marimba_name:
                if marimba_name not in h['marimba_frequency']:
                    h['marimba_frequency'][marimba_name] = 0
                    h['marimbas'].append(marimba_name)

                h['marimba_frequency'][marimba_name] += 1

            h['assignments'].append({
                'song_name': song.name,
                'song_order_index': song.order_index,
                'position': pos_name,
                'marimba': marimba_name if marimba_name else None,
                'physical_index': physical_index,
                'position_type': position_type,
            })

            h['last_song_name'] = song.name
            h['last_position'] = pos_name
            h['last_marimba'] = marimba_name if marimba_name else None
            h['last_physical_position'] = physical_index

    return list(history.values())