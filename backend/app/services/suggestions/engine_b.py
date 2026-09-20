"""Motor parte 2a: seleccion determinista (slots + candidatos)."""
from app.services.suggestions.engine_a import _explain

def _free_of(slots, used_s, pos):
    return [s for s in slots if s['position_type'] == pos and s['slot_id'] not in used_s]

def _pick(prev_map, pid, pos, free):
    pv = prev_map.get(pid, {})
    ps, pm = pv.get('slot_id'), pv.get('marimba_name')
    sp = (pv.get('position') == pos)

    def rk(s):
        if sp and ps and s['slot_id'] == ps:
            return (0, 0, '')
        if sp and pm and s['marimba_name'] == pm:
            return (1, s['slot_index'], s['slot_id'])
        if sp:
            return (2, 0, s['marimba_name'] + s['slot_id'])
        if pm and s['marimba_name'] == pm:
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