import urllib.request
import urllib.parse
import json

BASE = 'http://localhost:8000/api'

def req(path, method='GET', data=None):
    url = f"{BASE}{path}"
    headers = {'Content-Type': 'application/json'} if data is not None else {}
    body = json.dumps(data).encode('utf-8') if data is not None else None
    r = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            text = resp.read().decode('utf-8')
            return json.loads(text) if text else {}
    except urllib.error.HTTPError as e:
        err = e.read().decode('utf-8')
        raise RuntimeError(f"HTTP {e.code} on {method} {path}: {err}")

def main():
    print("=== STARTING E2E TEST CONTRA DOCKER ===")
    
    # 1. Health check
    h = req("/health")
    assert h == {'status': 'ok'}, f"Health failed: {h}"
    print("[1] Health OK: status=ok")

    # 2 & 3. Crear Proyecto: Concierto Visual E2E con Canción Luna de Xelajú y Personas
    proj_resp = req("/imports/confirm", method='POST', data={
        'project_name': 'Concierto Visual E2E',
        'sheets': [{
            'name': 'Hoja1',
            'songs': [{
                'name': 'Luna de Xelajú',
                'assignments': [
                    {'person': 'Carlos Méndez', 'position': 'Primera', 'mark': 'X'},
                    {'person': 'María Morales', 'position': 'Segunda', 'mark': 'X'},
                ]
            }]
        }]
    })
    pid = proj_resp['id']
    print(f"[2] Proyecto creado: id={pid}, name='{proj_resp['name']}'")

    proj_full = req(f"/projects/{pid}")
    song_data = proj_full['songs'][0]
    sid = song_data['id']
    print(f"[3] Canción obtenida: id={sid}, name='{song_data['name']}', asignaciones={len(song_data['assignments'])}")
    assert song_data['name'] == 'Luna de Xelajú'
    assert len(song_data['assignments']) == 2

    # 4. Personas verificadas
    people = req("/people")
    carlos = next(p for p in people if p['name'] == 'Carlos Méndez')
    print(f"[4] Persona verificada: id={carlos['id']}, name='{carlos['name']}'")

    # 5. Configurar Marimba A: Primera, Primera, Segunda, Bajo
    marimba_a = {
        'id': 'm_a_1',
        'type': 'marimba',
        'name': 'Marimba A',
        'x': 200,
        'y': 150,
        'width': 450,
        'height': 150,
        'rotation': 0,
        'scaleX': 1.0,
        'scaleY': 1.0,
        'locked': False,
        'positions': [
            {'id': 'p0', 'type': 'Primera', 'personId': None},
            {'id': 'p1', 'type': 'Primera', 'personId': None},
            {'id': 'p2', 'type': 'Segunda', 'personId': None},
            {'id': 'p3', 'type': 'Bajo', 'personId': None},
        ]
    }
    
    person_node = {
        'id': 'per_carlos',
        'type': 'person',
        'name': 'Carlos Méndez',
        'personId': carlos['id'],
        'positionType': 'Primera',
        'x': 50,
        'y': 50,
        'width': 150,
        'height': 44,
        'rotation': 0,
        'scaleX': 1.0,
        'scaleY': 1.0,
        'locked': False,
        'marimbaId': None,
        'marimbaPositionId': None
    }

    initial_elements = [marimba_a, person_node]

    # Crear Composición: "Distribución Final"
    comp_resp = req("/compositions", method='POST', data={
        'project_id': pid,
        'song_id': sid,
        'name': 'Distribución Final',
        'width': 1600,
        'height': 900,
        'data': {'elements': initial_elements}
    })
    cid = comp_resp['id']
    print(f"[5] Composición creada: id={cid}, name='{comp_resp['name']}'")

    # 6. Mover Marimba A, rotarla, cambiar escala
    marimba_a['x'] = 350
    marimba_a['y'] = 220
    marimba_a['rotation'] = 15
    marimba_a['scaleX'] = 1.15
    marimba_a['scaleY'] = 1.15
    print("[6] Marimba A movida (350, 220), rotada (15°), escalada (1.15)")

    # 7. Agregar posición Centro
    marimba_a['positions'].append({'id': 'p4', 'type': 'Centro', 'personId': None})
    marimba_a['width'] = 520
    print("[7] Posición 'Centro' agregada (p4)")

    # 8. Asignar persona Carlos a p0
    marimba_a['positions'][0]['personId'] = carlos['id']
    person_node['marimbaId'] = marimba_a['id']
    person_node['marimbaPositionId'] = 'p0'
    person_node['x'] = 390
    person_node['y'] = 260
    person_node['rotation'] = 15
    print("[8] Persona Carlos Méndez asignada al puesto p0 (Primera)")

    # 9. Bloquear marimba (locked = True)
    marimba_a['locked'] = True
    print("[9] Marimba A bloqueada: locked=True")

    put_resp = req(f"/compositions/{cid}", method='PUT', data={
        'project_id': pid,
        'song_id': sid,
        'name': 'Distribución Final',
        'width': 1600,
        'height': 900,
        'data': {'elements': [marimba_a, person_node]}
    })
    assert put_resp['data']['elements'][0]['locked'] is True
    print("    Comprobado: Marimba A permanece con locked=True")

    # 10. Desbloquear marimba y moverla
    marimba_a['locked'] = False
    marimba_a['x'] = 400
    marimba_a['y'] = 250
    print("[10] Marimba A desbloqueada y movida a (400, 250)")

    # 11. Guardar y recargar
    put_resp = req(f"/compositions/{cid}", method='PUT', data={
        'project_id': pid,
        'song_id': sid,
        'name': 'Distribución Final',
        'width': 1600,
        'height': 900,
        'data': {'elements': [marimba_a, person_node]}
    })
    print("[11] Composición guardada")

    # Recargar desde la BD
    reloaded = req(f"/compositions/{cid}")
    m_reloaded = reloaded['data']['elements'][0]
    p_reloaded = reloaded['data']['elements'][1]

    assert m_reloaded['x'] == 400 and m_reloaded['y'] == 250, f"Posición incorrecta: {m_reloaded}"
    assert m_reloaded['rotation'] == 15, f"Rotación incorrecta: {m_reloaded['rotation']}"
    assert m_reloaded['scaleX'] == 1.15, f"Escala incorrecta: {m_reloaded['scaleX']}"
    assert len(m_reloaded['positions']) == 5, f"Debe tener 5 posiciones: {len(m_reloaded['positions'])}"
    assert m_reloaded['positions'][4]['type'] == 'Centro'
    assert m_reloaded['positions'][0]['personId'] == carlos['id'], "Asignación no guardada"
    assert m_reloaded['locked'] is False, "Lock status incorrecto"
    print("[12] Verificación de persistencia superada:")
    print(f"     - Posición: ({m_reloaded['x']}, {m_reloaded['y']})")
    print(f"     - Rotación: {m_reloaded['rotation']}°")
    print(f"     - Escala: {m_reloaded['scaleX']}")
    print(f"     - Posiciones: {[p['type'] for p in m_reloaded['positions']]}")
    print(f"     - Asignación p0: {m_reloaded['positions'][0]['personId']} (Carlos)")
    print(f"     - Lock: {m_reloaded['locked']}")

    # 12. Guardar como: "Distribución Final 2"
    copy_elements = json.loads(json.dumps(reloaded['data']['elements']))
    copy_resp = req("/compositions", method='POST', data={
        'project_id': pid,
        'song_id': sid,
        'name': 'Distribución Final 2',
        'width': 1600,
        'height': 900,
        'data': {'elements': copy_elements}
    })
    c2_id = copy_resp['id']
    assert c2_id != cid
    print(f"[13] 'Guardar como...' completado: id={c2_id}, name='{copy_resp['name']}'")

    # Modificar la copia (cambiar nombre de la marimba y posición)
    copy_elements[0]['name'] = 'Marimba A (COPIA MODIFICADA)'
    copy_elements[0]['x'] = 999
    req(f"/compositions/{c2_id}", method='PUT', data={
        'project_id': pid,
        'song_id': sid,
        'name': 'Distribución Final 2',
        'width': 1600,
        'height': 900,
        'data': {'elements': copy_elements}
    })

    # Verificar que la original permanece intacta
    orig_check = req(f"/compositions/{cid}")
    copy_check = req(f"/compositions/{c2_id}")

    assert orig_check['data']['elements'][0]['name'] == 'Marimba A', "Original fue modificada!"
    assert orig_check['data']['elements'][0]['x'] == 400, "Original movida!"
    assert copy_check['data']['elements'][0]['name'] == 'Marimba A (COPIA MODIFICADA)'
    assert copy_check['data']['elements'][0]['x'] == 999
    print("[14] Independencia confirmada: La original permanece 100% intacta tras editar la copia")

    # 13. Verificar lista de composiciones de la canción en /songs/{sid}
    song_info = req(f"/songs/{sid}")
    comp_names = [c['name'] for c in song_info['compositions']]
    print(f"[15] Composiciones de '{song_info['name']}': {comp_names}")
    assert 'Distribución Final' in comp_names
    assert 'Distribución Final 2' in comp_names

    # 14. Probar eliminación de una composición sin afectar canciones o personas
    del_res = req(f"/compositions/{c2_id}", method='DELETE')
    assert del_res['deleted'] is True
    print(f"[16] Composición {c2_id} eliminada exitosamente")

    # Comprobar que canción, personas y asignaciones siguen existiendo
    song_after = req(f"/songs/{sid}")
    assert song_after['name'] == 'Luna de Xelajú'
    assert len(song_after['assignments']) == 2
    people_after = req("/people")
    assert any(p['name'] == 'Carlos Méndez' for p in people_after)
    print("[17] Integridad validada: Canción, personas y asignaciones permanecen intactas tras eliminar la composición")

    print("\n=======================================================")
    print("¡E2E COMPLETO Y EXITOSO! TODAS LAS REGLAS VALIDADAS.")
    print("=======================================================")

if __name__ == '__main__':
    main()