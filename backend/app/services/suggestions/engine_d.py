"""Motor parte 2b: bucle principal propose_distribution."""
from app.services.suggestions.engine_a import _explain
from app.services.suggestions.engine_b import _free_of, _pick, _cands

def propose_distribution(requirements, available_people, slots, prev_map, history_by_person):
    people = sorted(available_people, key=lambda p: (p['name'], p['person_id']))
    used_p, used_s = set(), set()
    assigns, unf, warns = [], [], []
    cap = {}

    for s in slots:
        cap[s['position_type']] = cap.get(s['position_type'], 0) + 1

    for pos in sorted(requirements.keys()):
        need = requirements[pos]
        fr = _free_of(slots, used_s, pos)

        if len(fr) < need:
            warns.append('Falta %d posicion %s: requeridas %d, disponibles %d.' % (
                need - len(fr), pos, need, len(fr)))
            
        if pos not in cap:
            warns.append('La posicion %s no existe en las marimbas.' % pos)

        if len(people) - len(used_p) < need:
            warns.append('Falta %d musico(s) para %s.' % (
                need - (len(people) - len(used_p)), pos))
            
        for _ in range(need):
            fr = _free_of(slots, used_s, pos)
            done = len([a for a in assigns if a['musical_position'] == pos])
            rest = [p for p in people if p['person_id'] not in used_p]

            if not fr or not rest:
                unf.append({'position': pos, 'required': need,
                            'available': cap.get(pos, 0), 'missing': need - done})
                
                break

            per = _cands(people, used_p, history_by_person, prev_map, pos)[0]
            s = _pick(prev_map, per['person_id'], pos, fr)
            pv = prev_map.get(per['person_id'], {})
            nh = history_by_person.get(per['person_id']) is None
            sm_p = (pv.get('position') == pos) if pv.get('position') else False
            sm_m = (pv.get('marimba_name') == s['marimba_name']) if pv.get('marimba_name') else False
            sm_s = (pv.get('slot_id') == s['slot_id']) if pv.get('slot_id') else False
            pc = bool(pv.get('position')) and not sm_p
            mc = bool(pv.get('marimba_name')) and not sm_m
            sc = sm_m and bool(pv.get('slot_id')) and not sm_s
            assigns.append({
                'person_id': per['person_id'], 'name': per['name'],
                'musical_position': pos, 'marimba_name': s['marimba_name'],
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