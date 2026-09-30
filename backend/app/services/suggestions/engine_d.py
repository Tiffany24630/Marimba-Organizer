"""Motor parte 2b: bucle principal propose_distribution."""
from app.services.suggestions.engine_a import _explain
from app.services.suggestions.engine_b import _free_of, _pick, _cands, _same_marimba
from app.services.suggestions.positions import (canonical, normalize_mapping,
                                               same_position)

def _capacity_by_canonical(slots):
    """{nombre canonico: cantidad de puestos} de una lista de slots.

    Cuenta por el canonico del puesto: "Primera" y "Primeras" son el mismo
    puesto musical y su capacidad se suma.
    """
    cap_canon = {}

    for s in slots:
        k = canonical(s['position_type'])
        cap_canon[k] = cap_canon.get(k, 0) + 1

    return cap_canon


def _explain_shortage(pos, need, done, slots, used_s, free_people):
    """D5: explica POR QUE no se pudo completar una posicion musical.

    Antes se reportaba "Falta N musico(s)" comparando solo la cantidad total de
    personas, lo que producia el aviso equivocado: cuando lo que faltaba era el
    puesto fisico compatible, igualmente se culpaba a los musicos.

    Aqui se separan las causas reales:
      - `no_slots`          : no existe ningun puesto fisico de ese tipo.
      - `insufficient_slots`: hay menos puestos de ese tipo de los que se piden.
      - `no_people`         : hay puesto compatible libre, pero no queda musica.
      - `combined`          : faltan ambas cosas a la vez.

    Se conservan las claves previas (`position`, `required`, `available`,
    `missing`) para no romper a los clientes; las nuevas son aditivas.

    La firma es `(pos, need, done, slots, used_s, free_people)` y la comparte el
    motor greedy y el optimizador, de modo que el diagnostico es el mismo en
    ambos caminos.
    """
    # La capacidad se cuenta por el CANONICO del puesto: si el Excel pide
    # "Primeras" y la marimba tiene "Primera", ambos son el mismo puesto y debe
    # contar como disponible. Antes se contaban por igualdad exacta y se
    # reportaba falsamente que no existia ningun puesto compatible.
    cap_canon = _capacity_by_canonical(slots)
    available = cap_canon.get(canonical(pos), 0)
    free_slots = _free_of(slots, used_s, pos)
    missing = need - done

    # Puestos de OTRO tipo que existen en las marimbas: sirven para explicar que
    # hay capacidad, pero no del tipo que esta cancion necesita.
    other_types = sorted({s['position_type'] for s in slots
                          if not same_position(s['position_type'], pos)})

    # Dos causas independientes, no excluyentes:
    #   * falta de Puestos: no hay suficientes puestos fisicos del tipo pedido;
    #   * falta de MUSICA: no queda gente sin asignar.
    # Se indica la causa dominante y se marca 'combined' cuando concurren.
    falta_puestos = available < need
    falta_musica = free_people <= 0

    if available == 0:
        reason = 'no_slots'
        # `available` ya suma por canonico, asi que llegar aqui significa que
        # ningun puesto de las marimbas es de este puesto musical (ni siquiera
        # una variante). No hace falta buscar alias: no existen.
        detail = ('No existe ningun puesto fisico de tipo "%s" en las '
                  'marimbas.' % pos)

        if other_types:
            detail += (' Las marimbas solo tienen puestos de: %s.'
                       % ', '.join(other_types))
    elif falta_puestos and falta_musica:
        reason = 'combined'
        detail = ('Faltan puestos de tipo "%s" (hay %d para %d requeridos) y '
                  'ademas no queda musica disponible.' % (pos, available, need))
    elif falta_puestos:
        reason = 'insufficient_slots'
        detail = ('Hay %d puesto(s) de tipo "%s" para %d requeridos: los que hay '
                  'ya estan ocupados.' % (available, pos, need))
    elif falta_musica:
        reason = 'no_people'
        detail = ('Hay %d puesto(s) libre(s) de tipo "%s" pero no queda musica '
                  'disponible.' % (len(free_slots), pos))
    else:
        reason = 'combined'
        detail = ('Faltan %d puesto(s) de tipo "%s" y %d musico(s) disponible(s).'
                  % (max(len(free_slots) - missing, 0), pos, free_people))

    return {'position': pos,
            'required': need,
            'available': available,
            'missing': missing,
            'free_slots': len(free_slots),
            'free_people': free_people,
            'other_position_types': other_types,
            'reason': reason,
            'detail': detail,
            # Campos booleanos para que el cliente decida sin parsear texto.
            'lacks_slots': bool(falta_puestos or available == 0),
            'lacks_people': bool(falta_musica)}


def propose_distribution(requirements, available_people, slots, prev_map, history_by_person):
    people = sorted(available_people, key=lambda p: (p['name'], p['person_id']))
    used_p, used_s = set(), set()
    assigns, unf, warns = [], [], []

    # Capacidad por el CANONICO del puesto musical. Se recorren las posiciones
    # pedidas con su nombre original ("Primeras") pero la capacidad se mide
    # contra cualquier puesto equivalente ("Primera").
    cap_canon = _capacity_by_canonical(slots)

    for pos in sorted(requirements.keys()):
        need = requirements[pos]
        fr = _free_of(slots, used_s, pos)
        available_here = cap_canon.get(canonical(pos), 0)

        if len(fr) < need:
            warns.append('Falta %d posicion %s: requeridas %d, disponibles %d.' % (
                need - len(fr), pos, need, len(fr)))

        if available_here == 0:
            warns.append('La posicion %s no existe en las marimbas.' % pos)

        for _ in range(need):
            fr = _free_of(slots, used_s, pos)
            done = len([a for a in assigns if a['musical_position'] == pos])
            rest = [p for p in people if p['person_id'] not in used_p]

            if not fr or not rest:
                info = _explain_shortage(pos, need, done, slots, used_s,
                                         len(people) - len(used_p))
                unf.append(info)
                # D5: el aviso de "falta musica" solo se emite cuando la musica es
                # la causa real. Antes se generaba siempre y acababa acusando a los
                # musicos cuando lo que faltaba era el puesto fisico compatible.
                if info['lacks_people'] and not info['lacks_slots']:
                    warns.append('Falta %d musico(s) para %s.' % (info['missing'], pos))

                break

            per = _cands(people, used_p, history_by_person, prev_map, pos)[0]
            s = _pick(prev_map, per['person_id'], pos, fr)
            pv = prev_map.get(per['person_id'], {})
            nh = history_by_person.get(per['person_id']) is None
            sm_p = (pv.get('position') == pos) if pv.get('position') else False
            # D1: la continuidad de marimba se decide por INSTANCIA, no por nombre.
            sm_m = bool(pv.get('marimba_id') or pv.get('marimba_name')) \
                and _same_marimba(pv, s)
            sm_s = (pv.get('slot_id') == s['slot_id']) if pv.get('slot_id') else False
            pc = bool(pv.get('position')) and not sm_p
            mc = bool(pv.get('marimba_id') or pv.get('marimba_name')) and not sm_m
            sc = sm_m and bool(pv.get('slot_id')) and not sm_s
            assigns.append({
                'person_id': per['person_id'], 'name': per['name'],
                'musical_position': pos, 'marimba_name': s['marimba_name'],
                'marimba_id': s.get('marimba_id'),
                'marimba_position_id': s['slot_id'],
                'same_position': sm_p, 'same_marimba': sm_m,
                'same_physical_slot': sm_s, 'is_position_change': pc,
                'is_marimba_change': mc, 'is_physical_slot_change': sc,
                'reason': _explain(sm_p, sm_m, sm_s, pc, mc, sc, nh)})
            used_p.add(per['person_id'])
            used_s.add(s['slot_id'])

    seen = {}

    for u in unf:
        seen[u['position']] = u

    return {'assignments': assigns,
            'unfulfilled_requirements': [seen[k] for k in sorted(seen)],
            'warnings': warns}