"""Fase 2: asignacion optima de musicos a puestos fisicos.

Resuelve el mismo problema que el bucle greedy de `engine_d`, pero buscando la
distribucion de COSTE MINIMO en lugar de la primera que encaja. El greedy toma
decisiones en orden alfabetico de puesto musical y no puede deshacerlas, por lo
que produce resultados validos pero suboptimos (D7).

Modelado como flujo de coste minimo sobre un grafo disperso:

    fuente -> persona -> puesto -> destino

- De `fuente` a cada persona: capacidad 1, coste 0. Una persona, un puesto.
- De cada persona a cada puesto COMPATIBLE: capacidad 1 y el coste de la
  preferencia. La compatibilidad es estructural: si `position_type` no coincide
  con el puesto musical, la arista NO existe, de modo que el requisito
  obligatorio no se puede violar ni por accidente.
- De cada puesto a `destino`: capacidad 1, coste 0. Un puesto, una persona.

El coste de una arista persona->puesto es la suma de penalizaciones:

    COSTOS = {
        'cambio_marimba':        100,   # el musicians cambia de instancia
        'cambio_puesto_fisico':   10,   # cambia de puesto dentro de la marimba
        'sin_historial_marimba':  25,   # no hay marimba previa (D2)
        'nueva_marimba':           5,   # ocupaba una marimba y ahora otra
        'desajuste_historico':     8,   # toca un puesto que rara vez ha tocado
    }

Los pesos viven en este diccionario, NO en la logica: ajustarlos no obliga a
tocar las restricciones obligatorias. `COSTOS` se puede sustituir por
`configure_costs()` sin tocar el resto del modulo.

El algoritmo es un flujo de coste minimo por caminos de aumento (SPFA con
distancia coste-transformada), no Bellman-Ford negativo. Con nodos de decenas a
cientos, es mas que suficiente y no anade dependencias externas.

La resolucion es DETERMINISTA: en empates se desempata por identificador, nunca
por el orden de inserccion de los diccionarios.
"""

from collections import deque

from app.services.suggestions.engine_b import _same_marimba
from app.services.suggestions.positions import same_position

# --- Pesos de las preferencias (ajustables sin tocar las restricciones) -----
COSTOS = {
    'cambio_marimba': 100,
    'cambio_puesto_fisico': 10,
    'sin_historial_marimba': 25,
    'nueva_marimba': 5,
    'desajuste_historico': 8,
}

# Coste por defecto de una asignacion sin historial de ningun tipo.
COSTO_BASE = 1


def configure_costs(**overrides):
    """Ajusta los pesos de las preferencias.

    `configure_costs(cambio_marimba=50)` reduce el peso de cambiar de marimba.
    Las restricciones obligatorias NO son pesos y no se tocan aqui.
    """
    unknown = set(overrides) - set(COSTOS)

    if unknown:
        raise ValueError('Pesos desconocidos: %s' % ', '.join(sorted(unknown)))

    COSTOS.update(overrides)

    return dict(COSTOS)


def _arista_cost(pv, s, hist):
    """Coste de asignar a `pv` (puesto previo) / persona con historial `hist`
    en el puesto fisico `s`. Devuelve (coste, desglose)."""
    w = COSTOS
    cost = COSTO_BASE
    why = {}

    # D2: por fin se consulta el historial acumulado de marimbas, que antes se
    # calculaba en `history.py` y nunca se leia. Si la persona tiene una marimba
    # claramente dominante y la propuesta la pone en otra, se penaliza.
    fav = hist.get('favorita_marimba') if hist else None

    if pv and (pv.get('marimba_id') or pv.get('marimba_name')):
        pv_mid = pv.get('marimba_id')
        pv_name = pv.get('marimba_name')
        same = (pv_mid and s.get('marimba_id') == pv_mid) or \
               (not pv_mid and s.get('marimba_name') == pv_name)

        if same:
            # Continua en la misma instancia.
            if pv.get('slot_id') and pv['slot_id'] != s['slot_id']:
                cost += w['cambio_puesto_fisico']
                why['cambio_puesto_fisico'] = True
        else:
            cost += w['cambio_marimba']
            why['cambio_marimba'] = True
    else:
        # Sin marimba previa, pero con historial: se penaliza cambiar.
        if fav:
            cost += w['sin_historial_marimba']
            why['sin_historial_marimba'] = True

    # Coherencia con la marimba que mas ha usado (D2).
    if fav and s.get('marimba_name') and s['marimba_name'] != fav:
        cost += w['nueva_marimba']
        why['nueva_marimba'] = True

    # Coherencia con el puesto musical que mas ha tocado.
    if hist:
        freq = hist.get('position_frequency') or {}
        ptype = s.get('position_type')

        if freq and ptype in freq and max(freq.values()) > freq[ptype]:
            cost += w['desajuste_historico']
            why['desajuste_historico'] = True

    return cost, why


class _Edge:
    __slots__ = ('to', 'cap', 'cost', 'tag')

    def __init__(self, to, cap, cost, tag):
        self.to = to
        self.cap = cap
        self.cost = cost
        self.tag = tag


def _min_cost_matching(people, slots, cost_fn):
    """Emparejamiento de coste minimo persona<->puesto.

    `cost_fn(person, slot) -> (coste, desglose)` o `None` si NO son compatibles
    (esa arista no se crea, y por tanto la asignacion es imposible).

    Devuelve `dict person_id -> (slot, coste, desglose)`.
    """
    n = len(people)
    m = len(slots)

    if not n or not m:
        return {}

    # Nodos: 0 = fuente, 1..n = personas, n+1..n+m = puestos, n+m+1 = destino.
    src = 0
    dst = n + m + 1
    size = dst + 1
    graph = [[] for _ in range(size)]

    def add(u, v, cap, cost, tag):
        graph[u].append(_Edge(v, cap, cost, tag))
        # Arista inversa: permite deshacer una asignacion previa.
        graph[v].append(_Edge(u, 0, -cost, None))

    for i, p in enumerate(people):
        add(src, 1 + i, 1, 0, ('person', p))

    for j, s in enumerate(slots):
        add(1 + n + j, dst, 1, 0, ('slot', s))

    # Aristas persona -> puesto SOLO si son compatibles.
    for i, p in enumerate(people):
        for j, s in enumerate(slots):
            res = cost_fn(p, s)

            if res is None:
                continue

            cost, why = res
            add(1 + i, 1 + n + j, 1, cost, ('pair', p, s, why))

    # Caminos de aumento (SPFA). En este dominio, de decenas de nodos,
    # converge en pocas iteraciones y evita dependencias externas.
    for _ in range(n):
        dist = [float('inf')] * size
        prev = [None] * size
        in_queue = [False] * size
        dist[src] = 0
        dq = deque([src])
        in_queue[src] = True

        while dq:
            u = dq.popleft()
            in_queue[u] = False
            du = dist[u]

            if du == float('inf'):
                continue

            for e in graph[u]:
                if e.cap <= 0:
                    continue
                nd = du + e.cost

                if nd < dist[e.to] - 1e-9:
                    dist[e.to] = nd
                    prev[e.to] = (u, e)

                    if not in_queue[e.to]:
                        in_queue[e.to] = True
                        dq.append(e.to)

        if dist[dst] == float('inf'):
            break

        # Reconstruccion del camino de aumento.
        v = dst

        while v != src:
            u, e = prev[v]
            e.cap -= 1

            for back in graph[v]:
                if back.to == u and back.tag is None and back.cap < 1:
                    back.cap += 1
                    break

            v = u

    # Emparejamiento asignado: aristas persona->puesto que quedaron saturadas.
    assigned = {}

    for u in range(1, 1 + n):
        for e in graph[u]:
            if e.tag and e.tag[0] == 'pair' and e.cap == 0:
                _, p, s, why = e.tag
                assigned[p['person_id']] = (s, e.cost, why)

    return assigned


def optimize_proposals(requirements, available_people, slots, prev_map,
                       history_by_person, explain_shortage=None):
    """Distribucion optima con la MISMA forma de salida que `propose_distribution`.

    `available_people` acepta el campo opcional `_wanted_type` (el puesto musical
    que la cancion exige a esa persona). Si no viene, se deduce de `requirements`
    asignando por orden estable, que es lo que hacia el greedy.

    Devuelve un dict con `assignments`, `unfulfilled_requirements`, `warnings` y
    `total_cost`, de modo que el endpoint no cambia de contrato.
    """
    people = sorted(available_people, key=lambda p: (p['name'], p['person_id']))

    # Puesto musical exigido a cada persona. Es una RESTRICCION, no una
    # preferencia: define si existe la arista persona->puesto.
    wanted = {}
    pending = list(people)

    for pos in sorted(requirements):
        for _ in range(int(requirements[pos])):

            if not pending:
                break

            q = pending.pop(0)
            wanted[q['person_id']] = pos

    for q in pending:
        wanted.setdefault(q['person_id'], None)

    work = []

    for p in people:
        q = dict(p)
        q['_wanted_type'] = p.get('_wanted_type') or wanted.get(p['person_id'])
        work.append(q)

    def cost_fn(p, s):
        # D5-compat: la comparacion usa el canonico del puesto, no igualdad
        # exacta. Sin esto, un puesto fisico llamado "Primeras" (plural) no
        # casaba con una persona que pide "Primera" (singular) y la arista no
        # se creaba, pese a ser el mismo puesto musical.
        if not same_position(s['position_type'], p.get('_wanted_type')):
            return None
        pv = prev_map.get(p['person_id'], {})
        hist = history_by_person.get(p['person_id'])
        return _arista_cost(pv, s, hist)

    # Orden estable del reporte: por puesto musical y luego por nombre.
    matched = _min_cost_matching(work, slots, cost_fn)
    assigns = []
    used_slots = set()
    total_cost = 0

    for p in sorted(people, key=lambda x: (x.get('_wanted_type') or '',
                                           x['name'], x['person_id'])):
        res = matched.get(p['person_id'])

        if res is None:
            continue

        s, cost, why = res
        used_slots.add(s['slot_id'])
        total_cost += cost
        pv = prev_map.get(p['person_id'], {})
        nh = history_by_person.get(p['person_id']) is None
        wtype = p.get('_wanted_type') or wanted.get(p['person_id'])
        sm_p = bool(pv.get('position')) and pv.get('position') == wtype
        same_m = bool(pv.get('marimba_id') or pv.get('marimba_name')) and \
            _same_marimba(pv, s)
        sm_s = bool(pv.get('slot_id')) and pv['slot_id'] == s['slot_id']
        pc = bool(pv.get('position')) and not sm_p
        mc = bool(pv.get('marimba_id') or pv.get('marimba_name')) and not same_m
        sc = same_m and bool(pv.get('slot_id')) and not sm_s
        assigns.append({
            'person_id': p['person_id'], 'name': p['name'],
            'musical_position': wtype, 'marimba_name': s['marimba_name'],
            'marimba_id': s.get('marimba_id'),
            'marimba_position_id': s['slot_id'],
            'same_position': sm_p, 'same_marimba': same_m,
            'same_physical_slot': sm_s, 'is_position_change': pc,
            'is_marimba_change': mc, 'is_physical_slot_change': sc,
            'reason': _explain_reason(sm_p, same_m, sm_s, pc, mc, sc, nh, why),
            'cost': cost})

    unf = []
    warns = []

    if explain_shortage is not None:
        used_s = {a['marimba_position_id'] for a in assigns}
        free_people = len(people) - len(assigns)

        for pos in sorted(requirements):
            need = int(requirements[pos])
            done = len([a for a in assigns if a['musical_position'] == pos])

            if done >= need:
                continue
            info = explain_shortage(pos, need, done, used_s, free_people)
            unf.append(info)
            if info['lacks_people'] and not info['lacks_slots']:
                warns.append('Falta %d musico(s) para %s.' % (info['missing'], pos))

    return {'assignments': assigns,
            'unfulfilled_requirements': unf,
            'warnings': warns,
            'total_cost': total_cost}


def _explain_reason(same_pos, same_mar, same_slot, pos_chg, mar_chg, slot_chg,
                    no_hist, why):
    """Explicacion legible de la decision, a partir del desglose de coste."""
    from app.services.suggestions.engine_a import _explain
    base = _explain(same_pos, same_mar, same_slot, pos_chg, mar_chg, slot_chg,
                    no_hist)

    if not why:
        return base

    extras = []

    if why.get('nueva_marimba'):
        extras.append('respeta la marimba que mas ha usado')

    if why.get('desajuste_historico'):
        extras.append('prioriza el puesto que suele ocupar')

    if not extras:
        return base

    return base + ' (' + ', '.join(extras) + ')'
