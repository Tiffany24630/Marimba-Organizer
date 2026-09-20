def analyze_changes(proposals, history):
    """
    Analizar cambios entre las propuestas y el historial.
    Cada cambio indica si hay continuidad o cambio de marimba/posición.
    """
    history_by_person = {h['person_id']: h for h in history}

    changes = []
    for p in proposals:
        pid = p.get('person_id')
        h = history_by_person.get(pid, {})
        last_marimba = h.get('last_marimba')
        last_position = h.get('last_position')
        proposed_marimba = p.get('marimba_name', '')
        proposed_position = p.get('position_type', '')

        entry = {
            'person_id': pid,
            'name': p.get('name', ''),
            'position_type': proposed_position,
            'from_marimba': last_marimba,
            'to_marimba': proposed_marimba,
            'from_position': last_position,
            'to_position': proposed_position,
        }

        if last_marimba and proposed_marimba:
            if last_marimba == proposed_marimba:
                entry['is_change'] = False
                entry['reason'] = f'Continuidad: {p.get("name", "")} permanece en {proposed_marimba}'
                entry['reason_code'] = 'continuity_marimba'
            else:
                entry['is_change'] = True
                entry['reason'] = f'Cambio de marimba: {p.get("name", "")} pasa de {last_marimba} a {proposed_marimba}'
                entry['reason_code'] = 'marimba_change'

        elif last_marimba and not proposed_marimba:
            entry['is_change'] = False
            entry['reason'] = f'Sin marimba previa para {p.get("name", "")}'
            entry['reason_code'] = 'no_previous_marimba'

        else:
            entry['is_change'] = False
            entry['reason'] = f'Sin historial previo de marimba para {p.get("name", "")}'
            entry['reason_code'] = 'no_history'

        if last_position and proposed_position != last_position:
            entry['position_changed'] = True
            entry['position_change_reason'] = (
                f'Cambio de posición: {p.get("name", "")} pasa de {last_position} a {proposed_position}'
            )

        changes.append(entry)

    return changes

def summarize_continuity(history, assignments):
    """
    Resumir qué personas tienen continuidad (historial) y cuáles no.
    """
    assignment_person_ids = {a['person_id'] for a in assignments}
    history_by_person = {h['person_id']: h for h in history}

    people_with_history = []
    people_without_history = []

    for a in assignments:
        pid = a['person_id']
        h = history_by_person.get(pid)

        if h:
            people_with_history.append({
                'person_id': pid,
                'name': a['person_name'],
                'last_position': h.get('last_position'),
                'last_marimba': h.get('last_marimba'),
                'last_song_name': h.get('last_song_name'),
                'position_frequency': h.get('position_frequency', {}),
                'marimba_frequency': h.get('marimba_frequency', {}),
            })

        else:
            people_without_history.append({
                'person_id': pid,
                'name': a['person_name'],
            })

    return people_with_history, people_without_history