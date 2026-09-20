import urllib.request
import json

with open('examples/Puestos conciertos Marimba.xlsx', 'rb') as f:
    content = f.read()

boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'
body = (
    f'--{boundary}\r\n'
    'Content-Disposition: form-data; name="file"; filename="Puestos conciertos Marimba.xlsx"\r\n'
    'Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n'
).encode('utf-8') + content + f'\r\n--{boundary}--\r\n'.encode('utf-8')

req = urllib.request.Request('http://localhost:8000/api/imports/preview', data=body, method='POST')
req.add_header('Content-Type', f'multipart/form-data; boundary={boundary}')

try:
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode('utf-8'))

        print('Excel preview OK:')
        print(f'Hojas: {len(res["sheets"])}')
        print(f'Personas ({len(res["people"])}): {res["people"][:8]}...')
        print(f'Posiciones: {res["positions"]}')

        for i, sh in enumerate(res["sheets"]):
            song_names = [s["name"] for s in sh["songs"]]

            print(f'Hoja {i+1} ({sh["name"]}): {len(song_names)} canciones -> {song_names[:4]}...')
            
        print('Stats:', res.get('stats'))
        print('Duplicates:', res.get('duplicates'))

except Exception as e:
    print('Error:', e)