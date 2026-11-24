"""Normalizacion de puestos musicales.

El Excel real y las plantillas de marimbas nombran los mismos puestos de forma
distinta: el Excel trae "Primeras"/"Segundas" y las plantillas dicen
"Primera"/"Segunda". Como el motor comparaba por igualdad exacta, 274 puestos
"Primeras" no encontraba ningun puesto fisico y se reportaban como
`reason: no_slots`, aunque la capacidad de "Primera" si existia.

Este modulo define la EQUIVALENCIA entre nombres, sin alterar los datos
guardados: la base conserva "Primeras" tal cual, y la normalizacion solo se usa
al COMPARAR. Asi los puestos personalizados (los que el usuario crea) siguen
funcionando exactamente igual: si no hay un equivalente conocido, se conserva
intacto y se compara consigo mismo.

Casos cubiertos, a partir de los datos reales y de errores tipograficos
documentados:

    Primera   == Primeras   (plural)
    Segunda   == Segundas
    Segunta   == Segunda / Segundas   (errata: falte la 'd')
    Primer    == Primera / Primeras   (errata: falta la 'a')
    Segundera == Segunda / Segundas   (errata: sobra la 'r')
    Under     == 1         (puesto numerico habitual en las marimbas)
"""

import re
import unicodedata

# Equivalencias explicitas: variante (ya normalizada) -> nombre canonico.
# El canonico se escribe con MAYUSCULA INICIAL para que siga siendo un nombre
# presentable y comparable con el que usan las plantillas y las composiciones.
EQUIVALENCIAS = {
    'primera': 'Primera',
    'primeras': 'Primera',
    'primero': 'Primera',
    'primer': 'Primera',
    'primers': 'Primera',
    'primera parte': 'Primera',
    # Erratas documentadas: "Primer" ya esta; "Primreas" y "Pramera".
    'primreas': 'Primera',
    'pramera': 'Primera',
    'primria': 'Primera',

    'segunda': 'Segunda',
    'segundas': 'Segunda',
    'segundo': 'Segunda',
    # Erratas documentadas: "Segunta" (falta la d) y "Segundera" (sobra la r).
    'segunta': 'Segunda',
    'segundara': 'Segunda',
    'segundaria': 'Segunda',
    'segundera': 'Segunda',

    'bajo': 'Bajo',
    'bajos': 'Bajo',
    'centro': 'Centro',
    'centros': 'Centro',
    'reposicion': 'Centro',

    'tercera': 'Tercera',
    'terceras': 'Tercera',
    'cuarta': 'Cuarta',
    'cuartas': 'Cuarta',

    # Puestos numericos: en una marimba se nombran por el numero.
    '1': 'Primera',
    '2': 'Segunda',
    '3': 'Tercera',
    '4': 'Cuarta',
    'p1': 'Primera',
    'p2': 'Segunda',
    'p3': 'Tercera',
    'p4': 'Cuarta',
}


def norm(v):
    """Forma de comparacion: sin acentos, minusculas y sin puntuacion.

    No altera el valor original, solo produce la clave con la que se compara.
    """
    s = unicodedata.normalize('NFKD', str(v or ''))
    s = s.encode('ascii', 'ignore').decode().lower()
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def canonical(v):
    """Nombre canonico de un puesto musical.

    Si el nombre no tiene equivalente conocido, devuelve el nombre original sin
    tocar: los puestos personalizados siguen siendo validos y se comparan
    consigo mismos.
    """
    original = str(v or '').strip()
    key = norm(original)
    if not key:
        return original
    return EQUIVALENCIAS.get(key, original)


def same_position(a, b):
    """¿`a` y `b` son el mismo puesto musical?

    Se comparan las CLAVES normalizadas: asi "Segunta" y "Segunda" coinciden
    aunque una sea una errata de la otra. Si alguno no tiene equivalente
    conocido, solo coincide consigo mismo.
    """
    na, nb = norm(a), norm(b)

    if not na or not nb:
        return False

    return EQUIVALENCIAS.get(na, na) == EQUIVALENCIAS.get(nb, nb)


def normalize_mapping(d):
    """Normaliza las claves de un {puesto: cantidad} conservando el nombre que
    ya se usa, para no romper los contratos existentes.

    Las claves que ya son canonicas se dejan igual. Las que son variantes se
    ofrecen bajo su canonico; si la canonica ya existe, se suman las cantidades
    y se descarta la variante (deja de ser una posicion imposible).
    """
    out = {}
    variants = {}

    for name, count in (d or {}).items():
        can = canonical(name)

        if norm(can) == norm(name):
            out[can] = out.get(can, 0) + int(count)
        else:
            variants.setdefault(can, []).append((name, int(count)))

    for can, items in variants.items():
        # Si la canonica ya existe, las variantes se agregan a ella; si no, se
        # crea con la suma de todas sus variantes.
        total = sum(c for _, c in items)
        out[can] = out.get(can, 0) + total

    return out


def position_aliases(raw, canon):
    """Que nombre original del Excel corresponde a cada puesto canonico.

    `raw` es el {puesto: cantidad} original y `canon` el ya normalizado. Se usa
    para que la interfaz siga mostrando el nombre que el usuario escribio
    ("Primeras") aunque el motor razone con el canonico ("Primera").
    """
    out = {}

    for name in (raw or {}):
        k = canonical(name)

        if k not in out:
            out[k] = name

    # Los canonicos que no vienen de una variante se mapean a si mismos.
    for k in (canon or {}):
        out.setdefault(k, k)

    return out
