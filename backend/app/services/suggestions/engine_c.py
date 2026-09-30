"""Orquestador del motor para una cancion (parte 3)."""
from app.services.suggestions.engine_a import get_previous_song, resolve_slots, get_previous_assignment_map
from app.services.suggestions.engine_d import _explain_shortage
from app.models import Song
from fastapi import HTTPException
from app.services.suggestions.history import get_person_history
from app.services.suggestions.requirements import get_song_requirements
from app.services.suggestions.positions import canonical, position_aliases
from app.services.suggestions.optimizer import optimize_proposals
from app.services.suggestions.engine_d import _explain_shortage


def _make_explainer(slots):
    """Adaptador del diagnostico de faltantes (D5) para el optimizador.

    El optimizador no sabe de marimbas, solo de puestos. Este cierre le pasa los
    slots de esta canción para que el mensaje sea EXACTAMENTE el mismo que
    producía el greedy, sin duplicar la lógica ni cambiar el contrato.
    """
    def explain(pos, need, done, used_s, free_people):
        return _explain_shortage(pos, need, done, slots, used_s, free_people)

    return explain

def get_distribution_for_song(song_id, db):
    song = db.get(Song, song_id)

    if not song:
        raise HTTPException(404, 'La cancion %d no existe.' % song_id)
    
    if song.project is None:
        raise HTTPException(404, 'El proyecto no existe.')
    
    # Nombres de puesto tal como vienen del Excel ("Primeras", "Segundas").
    reqs_raw = get_song_requirements(song_id, db)
    # Una persona SOLO puede ocupar un puesto, pero en los datos puede tener
    # varias filas de `SongAssignment` en la misma cancion (por ejemplo, alguien
    # marcado en Bajo, Centro y Primera a la vez). Si se pasan tal cual, el
    # optimizador los trata como entradas distintas y la misma persona aparece
    # varias veces en la propuesta, incluso en el MISMO puesto fisico.
    #
    # Se conserva la primera asignacion de cada persona (la de menor id de
    # asignacion, por determinismo) y se descartan las demas. Antes esta
    # deduplicacion la hacia `generate_proposals`, que fue sustituido por el
    # optimizador.
    seen_person = set()
    avail = []
    reqs = {}

    for a in sorted(song.assignments, key=lambda x: x.id):
        if a.person_id in seen_person:
            continue

        seen_person.add(a.person_id)
        # Version canonica para el motor: "Primeras" -> "Primera". Las
        # comparaciones de puesto se hacen siempre sobre esta, que es la que
        # coincide con las plantillas y las composiciones ya guardadas.
        can = canonical(a.position.name)
        avail.append({'person_id': a.person_id, 'name': a.person.name,
                      '_wanted_type': can})
        reqs[can] = reqs.get(can, 0) + 1

    avail.sort(key=lambda p: (p['name'], p['person_id']))
    reqs = dict(sorted(reqs.items()))
    prev = get_previous_song(song, db)
    # Puestos reales de la composicion previa; si no hay ninguno, se arman con las
    # plantillas globales para que la propuesta nunca quede sin marimbas.
    slots, slot_source = resolve_slots(song, db, reqs)
    pmap = get_previous_assignment_map(prev, db)
    # D3: el historial se limita a las canciones ANTERIORES a esta. Sin esto, la
    # propuesta de la primera canción usaba compositions de canciones posteriores.
    hist = get_person_history(song.project.id, db, exclude_song_id=song_id,
                              before_song=song)
    hmap = {h['person_id']: h for h in hist}
    # Fase 2: se usa el optimizador de coste minimo en lugar del greedy. Se
    # construye un adaptador para `_explain_shortage` de modo que el
    # diagnostico de faltantes (D5) siga siendo EXACTAMENTE el mismo, y la
    # respuesta del endpoint no cambia de contrato.
    res = optimize_proposals(reqs, avail, slots, pmap, hmap,
                             explain_shortage=_make_explainer(slots))
    cap = {}

    for s in slots:
        cap[s['position_type']] = cap.get(s['position_type'], 0) + 1

    return {'song_id': song_id, 'song_name': song.name,
            'previous_song': prev.name if prev else None,
            'slot_source': slot_source,
            # Campo nuevo y aditivo: que nombre del Excel corresponde a cada
            # puesto canonico, para que la interfaz pueda mostrar "Primeras" y
            # no "Primera" si el usuario escribio el plural.
            'position_aliases': position_aliases(reqs_raw, reqs),
            'marimbas_available': sorted({s.get('marimba_id') or s['marimba_name'] for s in slots}),
            'capacity': dict(sorted(cap.items())), **res}