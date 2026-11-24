"""Normalizacion de puestos musicales: "Primeras" y "Primera" son el mismo puesto.

Los casos salen del Excel real, que trae "Primeras" y "Segundas", y de las
plantillas registradas, que usan "Primera" y "Segunda".
"""
from app.services.suggestions.positions import (canonical, norm, same_position,
                                               normalize_mapping, position_aliases)
from app.services.suggestions.distribution import propose_distribution
from app.services.suggestions.engine_a import build_template_slots
from app.services.suggestions.engine_b import _free_of


def _slot(mid, name, sid, ptype, idx=0):
    return {'marimba_id': mid, 'marimba_name': name, 'slot_id': sid,
            'position_type': ptype, 'slot_index': idx, 'occupied_by': None}


class _Tpl:
    def __init__(self, tid, name, positions):
        self.id = tid
        self.name = name
        self.positions = positions


# ======================================================================
# Equivalencias basicas
# ======================================================================

def test_norm_quita_acentos_y_mayusculas():
    assert norm('  PRIMERA ') == 'primera'


def test_primera_y_primeras_son_el_mismo_puesto():
    assert same_position('Primera', 'Primeras') is True
    assert canonical('Primeras') == 'Primera'
    assert canonical('Primera') == 'Primera'


def test_segunda_y_segundas_son_el_mismo_puesto():
    assert same_position('Segunda', 'Segundas') is True
    assert canonical('Segundas') == 'Segunda'


def test_errata_segunta_se_reconoce():
    """Errata documentada: falta la 'd'."""
    assert same_position('Segunta', 'Segunda') is True
    assert same_position('Segunta', 'Segundas') is True
    assert canonical('Segunta') == 'Segunda'


def test_acentos_y_espacios_no_rompen_la_comparacion():
    assert same_position('  Segunda ', 'segundas') is True
    assert same_position('PRIMERAS', 'primera') is True


def test_puestos_distintos_siguen_distintos():
    assert same_position('Primera', 'Segunda') is False
    assert same_position('Bajo', 'Centro') is False


# ======================================================================
# Se conservan los nombres personalizados
# ======================================================================

def test_puesto_personalizado_se_conserva():
    """Un puesto creado por el usuario no tiene equivalente: se respeta tal cual."""
    assert canonical('Marimbolero') == 'Marimbolero'
    assert same_position('Marimbolero', 'Marimbolero') is True
    assert same_position('Marimbolero', 'Primera') is False


def test_vacio_no_revienta():
    assert canonical('') == ''
    assert same_position('', 'Primera') is False
    assert same_position(None, None) is False


# ======================================================================
# normalize_mapping
# ======================================================================

def test_normalize_mapping_agrega_el_plural():
    assert normalize_mapping({'Primeras': 13}) == {'Primera': 13}


def test_normalize_mapping_suma_canonico_y_variante():
    """Si ya existe la canonica, la variante se suma en vez de duplicar la clave."""
    out = normalize_mapping({'Primera': 2, 'Primeras': 3})
    assert out == {'Primera': 5}
    assert 'Primeras' not in out


def test_normalize_mapping_conserva_personalizados():
    out = normalize_mapping({'Marimbolero': 1, 'Primeras': 2})
    assert out['Marimbolero'] == 1
    assert out['Primera'] == 2


def test_position_aliases_recupera_el_nombre_del_excel():
    raw = {'Primeras': 13, 'Segundas': 2, 'Bajo': 4}
    alias = position_aliases(raw, normalize_mapping(raw))
    # La interfaz puede seguir mostrando lo que el usuario escribio.
    assert alias['Primera'] == 'Primeras'
    assert alias['Segunda'] == 'Segundas'
    assert alias['Bajo'] == 'Bajo'


# ======================================================================
# El motor deja de reportar incompatibilidad falsa
# ======================================================================

def test_motor_ya_no_reporta_no_slots_falso():
    """Regresion del aviso: 2 'Primeras' con 2 puestos 'Primera' se cubren."""
    slots = [_slot('m1', 'Grande', 'p0', 'Primera', 0),
             _slot('m1', 'Grande', 'p1', 'Primera', 1)]
    res = propose_distribution({'Primeras': 2},
                               [{'person_id': 1, 'name': 'Ana'},
                                {'person_id': 2, 'name': 'Beto'}],
                               slots, {}, {})
    assert len(res['assignments']) == 2
    assert res['unfulfilled_requirements'] == []
    assert not any('no existe' in w for w in res['warnings'])


def test_motor_acepta_segundas_contra_puestos_segunda():
    slots = [_slot('m1', 'Tenor', 't0', 'Segunda', 0)]
    res = propose_distribution({'Segundas': 1},
                               [{'person_id': 1, 'name': 'Ana'}],
                               slots, {}, {})
    assert len(res['assignments']) == 1
    assert res['unfulfilled_requirements'] == []


def test_capacidad_canonica_en_el_detalle():
    """`available` cuenta los puestos equivalentes, no los de nombre exacto."""
    slots = [_slot('m1', 'Grande', 'p0', 'Primera', 0),
             _slot('m1', 'Grande', 'p1', 'Primera', 1)]
    res = propose_distribution({'Primeras': 3},
                               [{'person_id': 1, 'name': 'Ana'},
                                {'person_id': 2, 'name': 'Beto'}],
                               slots, {}, {})
    unf = res['unfulfilled_requirements']
    assert len(unf) == 1
    # Hay 2 puestos equivalentes, no 0 como reportaba antes.
    assert unf[0]['available'] == 2
    assert unf[0]['missing'] == 1
    assert unf[0]['other_position_types'] == []


def test_puesto_verdaderamente_inexistente_sigue_reportandose():
    """La normalizacion no debe tapar la falta real de un puesto."""
    slots = [_slot('m1', 'Grande', 'p0', 'Primera', 0)]
    res = propose_distribution({'Marimbolero': 1},
                               [{'person_id': 1, 'name': 'Ana'}],
                               slots, {}, {})
    unf = res['unfulfilled_requirements'][0]
    assert unf['reason'] == 'no_slots'
    assert unf['available'] == 0
    assert 'Marimbolero' in unf['detail']


def test_no_se_mezclan_puestos_equivalentes_con_distintos():
    """'Primeras' no debe ocupar un puesto 'Segunda'."""
    slots = [_slot('m1', 'Grande', 'p0', 'Segunda', 0)]
    res = propose_distribution({'Primeras': 1},
                               [{'person_id': 1, 'name': 'Ana'}],
                               slots, {}, {})
    assert len(res['assignments']) == 0
    assert res['unfulfilled_requirements'][0]['available'] == 0



# ======================================================================
# El caso real: las plantillas "Primera" cubren el Excel "Primeras"
# ======================================================================

def test_plantilla_primera_cubre_primeras_del_excel():
    """El defecto original: "Primeras" no encontraba los puestos "Primera"."""
    slots = build_template_slots([_Tpl(1, 'Grande', ['Primera', 'Primera'])],
                                 {'Primeras': 2})
    assert len(slots) == 2
    assert all(s['position_type'] == 'Primera' for s in slots)


def test_no_se_mezclan_puestos_equivalentes_con_distintos():
    """'Primeras' no debe ocupar un puesto 'Segunda'."""
    slots = [_slot('m1', 'Grande', 'p0', 'Segunda', 0)]
    res = propose_distribution({'Primeras': 1},
                               [{'person_id': 1, 'name': 'Ana'}],
                               slots, {}, {})
    assert len(res['assignments']) == 0
    assert res['unfulfilled_requirements'][0]['available'] == 0


# ======================================================================
# Integracion: una persona con VARIAS asignaciones en la misma cancion
# ======================================================================

def test_persona_con_varias_asignaciones_no_se_duplica():
    """Regresion: alguien marcado en Bajo, Centro y Primera a la vez.

    En los datos reales hay personas con varias filas de `SongAssignment` en la
    misma cancion. Al pasar esas filas al motor sin deduplicar, la persona
    aparecia varias veces en la propuesta, incluso en el MISMO puesto fisico.
    """
    from app.services.suggestions.optimizer import optimize_proposals

    slots = [_slot('m1', 'Grande', 'p0', 'Primera', 0),
             _slot('m1', 'Grande', 'p1', 'Centro', 1),
             _slot('m1', 'Grande', 'p2', 'Bajo', 2)]
    # La misma persona, tres veces: el optimizador recibe una sola entrada.
    avail = [{'person_id': 1, 'name': 'Hector', '_wanted_type': 'Bajo'}]
    reqs = {'Bajo': 1}
    res = optimize_proposals(reqs, avail, slots, {}, {})

    pids = [a['person_id'] for a in res['assignments']]
    sids = [a['marimba_position_id'] for a in res['assignments']]
    assert len(pids) == len(set(pids)) == 1
    assert len(sids) == len(set(sids)) == 1


def test_requirements_y_personas_coinciden_tras_deduplicar():
    """Los requisitos se cuentan sobre las personas ya deduplicadas.

    Con 3 'Primera' pedidos y solo 2 personas distintas, se asignan 2 y el
    reporte de faltantes (cuando se pasa el explicador) dice que falta 1 por
    falta de puesto, no por una asignacion duplicada.
    """
    from app.services.suggestions.optimizer import optimize_proposals
    from app.services.suggestions.engine_d import _explain_shortage

    slots = [_slot('m1', 'Grande', 'p0', 'Primera', 0),
             _slot('m1', 'Grande', 'p1', 'Primera', 1)]
    avail = [{'person_id': 1, 'name': 'Ana', '_wanted_type': 'Primera'},
             {'person_id': 2, 'name': 'Beto', '_wanted_type': 'Primera'}]

    def explain(pos, need, done, used_s, free_people):
        return _explain_shortage(pos, need, done, slots, used_s, free_people)

    res = optimize_proposals({'Primera': 3}, avail, slots, {}, {},
                             explain_shortage=explain)
    assert len(res['assignments']) == 2
    unf = res['unfulfilled_requirements']
    assert len(unf) == 1
    assert unf[0]['missing'] == 1
    assert unf[0]['available'] == 2


def test_free_of_compara_por_canonico():
    """Un puesto 'Primera' es libre para el puesto musical 'Primeras'."""
    slots = [_slot('m1', 'Grande', 'p0', 'Primera', 0)]
    assert len(_free_of(slots, set(), 'Primeras')) == 1
    assert len(_free_of(slots, set(), 'Primera')) == 1
    # Y sigue sin servir para un puesto que no es equivalente.
    assert _free_of(slots, set(), 'Segunda') == []
