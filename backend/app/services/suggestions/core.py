"""Nucleo unico de decision de distribucion (Fase 3 / D4).

Este modulo es el UNICO punto donde se decide a quien se asigna cada puesto.
Tanto `/suggestions` (Motor A) como `/distribution-suggestion` (Motor B)
consumen `build_distribution_core`; de ahi que ambos endpoints sean coherentes
ante las mismas entradas.

Antes cada endpoint tenia su propio motor y sus propios puestos:

  * Motor A (`distributor.generate_proposals`) armaba el plan de marimbas desde
    las PLANTILLAS y recorria personas en orden.
  * Motor B (`engine_c` + optimizador) tomaba los puestos REALES de la
    composicion previa y resolvia un emparejamiento de coste minimo.

Con los mismos datos ambos detenian a personas distintas: uno se apoyaba en la
continuidad con la cancion anterior, el otro en el plan de plantillas. Eso es D4.

Aqui se resuelve en un solo paso:

  1. `collect_song_input` lee la cancion UNA vez y normaliza (personas, puesto
     musical canonico, requisitos).
  2. `resolve_slots` decide los puestos disponibles, con la politica que ya
     usaba el motor mas avanzado: primero los reales de la composicion previa y,
     si no hay, los construidos con plantillas.
  3. `optimizer.optimize_proposals` elige las asignaciones de coste minimo.
  4. `marimba_plan` se DERIVA de los puestos realmente usados, de modo que el
     plan jamas contradice lo que decidio el optimizador.

La planificacion por plantillas no desaparece: `build_template_slots` sigue
alimentando el paso 2 cuando no hay composicion previa. Lo que desaparece es la
SEGUNDA decision de asignaciones.
"""

from app.services.suggestions.engine_a import (get_previous_song, resolve_slots,
                                               get_previous_assignment_map)
from app.services.suggestions.history import get_person_history
from app.services.suggestions.requirements import get_song_requirements
from app.services.suggestions.positions import canonical, position_aliases
from app.services.suggestions.optimizer import optimize_proposals
from app.services.suggestions.engine_d import _explain_shortage


def _make_explainer(slots):
    """Adaptador del diagnostico de faltantes (D5) para el optimizador."""
    def explain(pos, need, done, used_s, free_people):
        return _explain_shortage(pos, need, done, slots, used_s, free_people)

    return explain


def collect_song_input(song, db):
    """Lee la cancion UNA vez: personas, puesto musical canonico y requisitos.

    Una persona puede tener VARIAS filas de `SongAssignment` en la misma
    cancion (alguien marcado en Bajo, Centro y Primera a la vez). Como solo puede
    ocupar un puesto, se conserva la de menor id de asignacion, lo que hace el
    resultado determinista. Se usa `person_id`, nunca el nombre: dos homonimos
    son personas distintas.
    """
    raw = get_song_requirements(song.id, db)
    seen = set()
    avail = []
    reqs = {}
    total_rows = 0

    for a in sorted(song.assignments, key=lambda x: x.id):
        total_rows += 1

        if a.person_id in seen:
            continue

        seen.add(a.person_id)
        can = canonical(a.position.name)
        avail.append({'person_id': a.person_id, 'name': a.person.name,
                      '_wanted_type': can})
        reqs[can] = reqs.get(can, 0) + 1

    avail.sort(key=lambda p: (p['name'], p['person_id']))
    return {'avail': avail, 'reqs': dict(sorted(reqs.items())), 'raw': raw,
            'duplicates_dropped': total_rows - len(avail)}


def plan_from_slots(slots):
    """Deriva el `marimba_plan` de los puestos REALMENTE usados.

    Se agrupa por `marimba_id` (la instancia) y no por nombre, para que dos
    instancias de la misma plantilla sigan siendo distintas. El orden es
    estable, de modo que la composicion sea reproducible.
    """
    by_id = {}

    for s in slots:
        by_id.setdefault(s.get('marimba_id') or s['marimba_name'], []).append(s)

    plan = []

    for key in sorted(by_id, key=lambda k: (by_id[k][0]['marimba_name'], k)):
        group = sorted(by_id[key], key=lambda s: (s['slot_index'], s['slot_id']))
        plan.append({'id': key,
                     'name': group[0]['marimba_name'],
                     'positions': [s['position_type'] for s in group]})

    return plan


def slot_index_map(plan, slots):
    """{slot_id: indice del puesto dentro de su marimba}.

    Se deriva del `marimba_plan`, que ya viene ordenado de forma estable, asi que
    el indice coincide con la posicion que ocupa el puesto en la composicion.
    """
    indices = {}
    # Los ids de slot siguen el prefijo de la instancia (`tpl1_2` -> `tpl1_2_3`),
    # pero se empareja por posicion para no depender de ese formato.
    for m in plan:
        ordenados = sorted(
            [s for s in slots
             if (s.get('marimba_id') or s['marimba_name']) == m['id']],
            key=lambda s: (s['slot_index'], s['slot_id']))
        for i, s in enumerate(ordenados):
            indices[s['slot_id']] = i

    return indices


def build_distribution_core(song, db):
    """Nucleo de decision. Devuelve la propuesta interna, comun a ambos endpoints.

    Llama al optimizador UNA sola vez; los adaptadores de salida se apoyan en este
    mismo resultado, de modo que no puede haber dos decisiones divergentes.
    """
    data = collect_song_input(song, db)
    reqs = data['reqs']
    prev = get_previous_song(song, db)
    # Primero los puestos reales de la composicion previa; si no hay ninguno, se
    # arman con las plantillas globales.
    slots, slot_source = resolve_slots(song, db, reqs)
    pmap = get_previous_assignment_map(prev, db)
    # D3: solo las canciones ANTERIORES a esta influyen en la propuesta.
    hist = get_person_history(song.project.id, db, exclude_song_id=song.id,
                              before_song=song)
    hmap = {h['person_id']: h for h in hist}
    result = optimize_proposals(reqs, data['avail'], slots, pmap, hmap,
                                explain_shortage=_make_explainer(slots))
    # El plan se deriva de los puestos usados, no de las plantillas por su cuenta:
    # asi no puede contradecir lo que decidio el optimizador.
    plan = plan_from_slots(slots)
    cap = {}

    for s in slots:
        cap[s['position_type']] = cap.get(s['position_type'], 0) + 1

    return {
        'song': song,
        'previous_song': prev,
        'slot_source': slot_source,
        'slots': slots,
        'prev_map': pmap,
        'history': hist,
        'history_by_person': hmap,
        'reqs': reqs,
        'reqs_raw': data['raw'],
        'avail': data['avail'],
        'duplicates_dropped': data['duplicates_dropped'],
        'assignments': result['assignments'],
        'unfulfilled': result['unfulfilled_requirements'],
        'warnings': result['warnings'],
        'total_cost': result['total_cost'],
        'marimba_plan': plan,
        'capacity': dict(sorted(cap.items())),
        'position_aliases': position_aliases(data['raw'], reqs),
        # Indice del puesto DENTRO de su marimba. Se calcula una sola vez aqui
        # para que los adaptadores no repitan el calculo ni puedan divergir.
        'slot_index': slot_index_map(plan, slots),
    }


# ======================================================================
# Adaptadores de salida
# ======================================================================
# Cada endpoint conserva SU contrato, pero las asignaciones vienen del mismo
# nucleo. Un adaptador NUNCA recalcula una asignacion: solo reformatea.

def to_suggestions_response(core):
    """Formato de `/suggestions` (Motor A), alimentado por el nucleo comun.

    Se conservan todas las claves que el frontend y las pruebas ya consumen:
    `proposals`, `marimba_plan`, `position_counts`, `duplicates_dropped`,
    `unplaced`, `people_with_history`, `people_without_history` y `changes`.

    La diferencia con el motor viejo es de PRESENTACION, no de decision: cada
    propuesta traduce la asignacion del optimizador al formato del Motor A
    (`marimba_position_index` en vez de `marimba_position_id`).
    """
    from app.services.suggestions.movement import analyze_changes

    history = core['history']
    hmap = core['history_by_person']
    # El indice de puesto dentro de su marimba ya lo calculo el nucleo.
    index_por_slot = core['slot_index']
    proposals = []
    unplaced = []

    for a in core['assignments']:
        h = hmap.get(a['person_id'])
        reasons = []

        if a.get('same_position'):
            reasons.append('Continuidad de posicion')

        if a.get('same_marimba'):
            reasons.append('Continuidad de marimba (%s)' % a['marimba_name'])
        elif a['marimba_name']:
            reasons.append('Plantilla: %s' % a['marimba_name'])
        else:
            reasons.append('Sin historial suficiente')

        if h is None:
            reasons.append('Primera vez en el proyecto')

        proposals.append({
            'person_id': a['person_id'],
            'name': a['name'],
            'position_type': a['musical_position'],
            'marimba_name': a['marimba_name'],
            'marimba_id': a.get('marimba_id'),
            'marimba_position_index': index_por_slot.get(
                a['marimba_position_id'], -1),
            'reasons': reasons,
            'history': {
                'last_position': h.get('last_position') if h else None,
                'last_marimba': h.get('last_marimba') if h else None,
                'last_song_name': h.get('last_song_name') if h else None,
            } if h else None,
        })

    # Personas que el nucleo no pudo asignar: son las que no aparecen en
    # `assignments`. Se comparan por `person_id`.
    asignados = {a['person_id'] for a in core['assignments']}

    for p in core['avail']:
        if p['person_id'] not in asignados:
            unplaced.append({'person_id': p['person_id'], 'name': p['name'],
                             'position_type': p['_wanted_type']})

    people_with = [
        {'person_id': h['person_id'], 'name': h['name'],
         'last_position': h.get('last_position'),
         'last_marimba': h.get('last_marimba'),
         'last_song_name': h.get('last_song_name')}
        for h in history if h['person_id'] in asignados]
    people_without = [
        {'person_id': p['person_id'], 'name': p['name']}
        for p in core['avail'] if p['person_id'] not in hmap]

    return {
        'song_name': core['song'].name,
        'position_counts': core['reqs_raw'],
        'proposals': proposals,
        'marimba_plan': core['marimba_plan'],
        # Filas de `SongAssignment` que la deduplicacion del nucleo descarto
        # (una persona solo puede ocupar un puesto). Es informacion real, no 0.
        'duplicates_dropped': core['duplicates_dropped'],
        'unplaced': unplaced,
        'people_with_history': people_with,
        'people_without_history': people_without,
        'changes': analyze_changes(proposals, history),
    }


def to_distribution_response(core):
    """Formato de `/distribution-suggestion` (Motor B), mismo nucleo.

    Conserva asignaciones con su coste, `total_cost`, `position_aliases`,
    informacion de continuidad y los mensajes de escasez.
    """
    song = core['song']
    prev = core['previous_song']
    return {'song_id': song.id, 'song_name': song.name,
            'previous_song': prev.name if prev else None,
            'slot_source': core['slot_source'],
            'position_aliases': core['position_aliases'],
            'marimbas_available': sorted(
                {s.get('marimba_id') or s['marimba_name'] for s in core['slots']}),
            'capacity': core['capacity'],
            'assignments': core['assignments'],
            'unfulfilled_requirements': core['unfulfilled'],
            'warnings': core['warnings'],
            'total_cost': core['total_cost']}



    avail.sort(key=lambda p: (p['name'], p['person_id']))
    return {'avail': avail, 'reqs': dict(sorted(reqs.items())), 'raw': raw}
