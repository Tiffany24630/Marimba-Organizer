"""Motor parte 2a: seleccion determinista (slots + candidatos)."""
from app.services.suggestions.engine_a import _explain
from app.services.suggestions.positions import same_position

def _free_of(slots, used_s, pos):
    """Puestos libres compatibles con el puesto musical `pos`.

    La comparacion usa el canonico del puesto ("Primeras" y "Primera" son el
    mismo puesto musical), no la igualdad exacta de cadenas. Sin esto, ningun
    puesto fisico era compatible con los puestos que trae el Excel.
    """
    return [s for s in slots if same_position(s['position_type'], pos)
            and s['slot_id'] not in used_s]

def _same_marimba(pv, s):
    """D1: ¿el puesto `s` pertenece a la MISMA instancia que la previa?

    La identidad real es `marimba_id`. El nombre se usa solo como respaldo cuando
    no hay id disponible (composiciones antiguas), para no perder continuidad en
    datos que aun no lo traen.
    """
    pid_ = pv.get('marimba_id')

    if pid_:
        return s.get('marimba_id') == pid_

    pname = pv.get('marimba_name')

    return bool(pname) and s.get('marimba_name') == pname

def _pick(prev_map, pid, pos, free):
    pv = prev_map.get(pid, {})
    ps = pv.get('slot_id')
    pm = pv.get('marimba_name')
    sp = (pv.get('position') == pos)

    def rk(s):
        if sp and ps and s['slot_id'] == ps:
            return (0, 0, '')

        if sp and _same_marimba(pv, s):
            return (1, s['slot_index'], s['slot_id'])

        if sp:
            return (2, 0, s['marimba_name'] + s['slot_id'])

        if pm and _same_marimba(pv, s):
            return (3, s['slot_index'], s['slot_id'])

        return (4, 0, s['marimba_name'] + s['slot_id'])

    return sorted(free, key=rk)[0]

def _cands(people, used_p, history_by_person, prev_map, pos):
    wh, nh, ot = [], [], []

    for p in people:
        if p['person_id'] in used_p:
            continue

        h = history_by_person.get(p['person_id'])

        if h and pos in (h.get('positions') or []):
            wh.append(p)
        elif not h:
            nh.append(p)
        else:
            ot.append(p)

    def fq(p):
        hh = history_by_person.get(p['person_id'], {})

        return -(hh.get('position_frequency', {}).get(pos, 0))
    
    wh.sort(key=lambda p: (fq(p), p['name'], p['person_id']))
    kp = [p for p in wh if prev_map.get(p['person_id'], {}).get('position') == pos]
    rt = [p for p in wh if p not in kp]

    return kp + rt + nh + ot