from fastapi.testclient import TestClient
from fastapi import HTTPException
import pytest
import uuid
from app.main import app
from app.models import Project, Person, Position, Song, SongAssignment, Composition
from app.db.session import SessionLocal
from app.services.suggestions.history import get_person_history
from app.services.suggestions.requirements import get_song_requirements, get_song_assignments
from app.services.suggestions.distributor import generate_proposals, create_composition_from_proposals
from app.services.suggestions.movement import analyze_changes
from conftest import proyecto_de_prueba

client = TestClient(app)

def _get_or_create_person(db, name):
    p = db.query(Person).filter(Person.name == name).first()

    if not p:
        p = Person(name=name)
        db.add(p)
        db.commit()
        db.refresh(p)

    return p

def _get_or_create_position(db, name):
    pos = db.query(Position).filter(Position.name == name).first()

    if not pos:
        pos = Position(name=name)
        db.add(pos)
        db.commit()
        db.refresh(pos)

    return pos

def _setup():
    """Crea proyecto 'Concierto E2E' aislado con Song A (con composicion) y Song B."""
    db = SessionLocal()
    c = _get_or_create_person(db, "Carlos")
    a = _get_or_create_person(db, "Ana")
    lu = _get_or_create_person(db, "Luis")
    pp = _get_or_create_position(db, "Primera")
    ps = _get_or_create_position(db, "Segunda")
    project = proyecto_de_prueba(db, "Concierto E2E")

    db.add(project)
    db.commit()
    db.refresh(project)
    db.refresh(c); db.refresh(a); db.refresh(lu)
    db.refresh(pp); db.refresh(ps)

    sa = Song(project_id=project.id, name="Song A", order_index=0)
    sb = Song(project_id=project.id, name="Song B", order_index=1)

    db.add_all([sa, sb])
    db.commit()
    db.refresh(sa); db.refresh(sb)
    db.add_all([
        SongAssignment(song_id=sa.id, person_id=c.id, position_id=pp.id),
        SongAssignment(song_id=sa.id, person_id=a.id, position_id=ps.id),
        SongAssignment(song_id=sb.id, person_id=c.id, position_id=pp.id),
        SongAssignment(song_id=sb.id, person_id=a.id, position_id=ps.id),
    ])
    db.commit()

    data = {"elements": [
        {"id": "mb1", "type": "marimba", "name": "Marimba A",
         "x": 200, "y": 200, "width": 380, "height": 150,
         "rotation": 0, "scaleX": 1, "scaleY": 1,
         "positions": [
             {"id": "p0", "type": "Primera", "personId": c.id},
             {"id": "p1", "type": "Segunda", "personId": a.id},
         ]},
        {"id": f"person_{c.id}", "type": "person", "name": "Carlos",
         "personId": c.id, "positionType": "Primera",
         "marimbaId": "mb1", "marimbaPositionId": "p0",
         "x": 270, "y": 278, "rotation": 0, "scaleX": 1, "scaleY": 1},
        {"id": f"person_{a.id}", "type": "person", "name": "Ana",
         "personId": a.id, "positionType": "Segunda",
         "marimbaId": "mb1", "marimbaPositionId": "p1",
         "x": 340, "y": 278, "rotation": 0, "scaleX": 1, "scaleY": 1},
    ]}
    comp_a = Composition(project_id=project.id, song_id=sa.id,
                         name="Song A - Dist", width=1600, height=900, data=data)
    
    db.add(comp_a)
    db.commit()
    db.refresh(comp_a)

    return {"db": db, "project": project, "carlos": c, "ana": a,
            "luis": lu, "song_a": sa, "song_b": sb,
            "comp_a": comp_a, "orig": data}

def test_01_person_history():
    d = _setup()
    db, project, carlos = d["db"], d["project"], d["carlos"]

    try:
        history = get_person_history(project.id, db)
        ch = next(h for h in history if h["person_id"] == carlos.id)

        assert ch["name"] == "Carlos"
        assert "Primera" in ch["positions"]
        assert ch["position_frequency"]["Primera"] == 2
        assert len(ch["assignments"]) == 2

    finally:
        db.close()

def test_02_previous_position_detected():
    d = _setup()
    db, project = d["db"], d["project"]

    try:
        history = get_person_history(project.id, db,
                                     exclude_song_id=d["song_b"].id)
        ch = next(h for h in history if h["name"] == "Carlos")

        assert ch["last_position"] == "Primera"
        assert ch["last_song_name"] == "Song A"
        assert len(ch["assignments"]) == 1

    finally:
        db.close()

def test_03_previous_marimba_detected():
    d = _setup()
    db, project = d["db"], d["project"]

    try:
        history = get_person_history(project.id, db,
                                     exclude_song_id=d["song_b"].id)
        ch = next(h for h in history if h["name"] == "Carlos")

        assert ch["last_marimba"] == "Marimba A"
        assert "Marimba A" in ch["marimbas"]
        assert ch["marimba_frequency"]["Marimba A"] == 1

    finally:
        db.close()

def test_04_continuity_detected():
    d = _setup()
    db, project, sb = d["db"], d["project"], d["song_b"]
    
    try:
        assigns = get_song_assignments(sb.id, db)
        history = get_person_history(project.id, db, exclude_song_id=sb.id)
        res = generate_proposals(assigns, history)
        cp = next(p for p in res["proposals"]
                  if p["person_id"] == d["carlos"].id)

        assert cp["marimba_name"] == "Marimba A"
        assert any("Continuidad" in r for r in cp["reasons"])

        changes = analyze_changes(res["proposals"], history)
        cc = next(x for x in changes
                  if x["person_id"] == d["carlos"].id)
        
        assert cc["is_change"] is False

    finally:
        db.close()

def test_05_marimba_change_detected():
    d = _setup()
    db, project, sb = d["db"], d["project"], d["song_b"]

    try:
        assigns = get_song_assignments(sb.id, db)
        history = get_person_history(project.id, db, exclude_song_id=sb.id)
        res = generate_proposals(assigns, history)

        for p in res["proposals"]:
            if p["person_id"] == d["carlos"].id:
                p["marimba_name"] = "Marimba B"

        changes = analyze_changes(res["proposals"], history)
        cc = next(x for x in changes
                  if x["person_id"] == d["carlos"].id)

        assert cc["is_change"] is True
        assert cc["from_marimba"] == "Marimba A"
        assert cc["to_marimba"] == "Marimba B"
        assert "Cambio de marimba" in cc["reason"]

    finally:
        db.close()

def test_06_song_requirements():
    d = _setup()
    db, sb = d["db"], d["song_b"]

    try:
        counts = get_song_requirements(sb.id, db)

        assert counts["Primera"] == 1
        assert counts["Segunda"] == 1

    finally:
        db.close()

def test_07_generate_suggestions():
    d = _setup()
    db, project, sb = d["db"], d["project"], d["song_b"]

    try:
        assigns = get_song_assignments(sb.id, db)
        history = get_person_history(project.id, db, exclude_song_id=sb.id)
        res = generate_proposals(assigns, history)

        assert len(res["proposals"]) == 2

        for p in res["proposals"]:
            assert {"person_id", "name", "position_type",
                    "marimba_name", "marimba_position_index",
                    "reasons", "history"} <= set(p.keys())
            assert isinstance(p["reasons"], list) and p["reasons"]

        assert len(res["people_with_history"]) == 2
        assert res["people_without_history"] == []

    finally:
        db.close()

def test_08_no_suggestions_for_unknown_person():
    d = _setup()
    db = d["db"]

    try:
        with pytest.raises(HTTPException):
            create_composition_from_proposals(
                d["song_b"].id,
                [{"person_id": 999999, "name": "Fantasma",
                  "position_type": "Primera",
                  "marimba_name": "Marimba X",
                  "marimba_position_index": 0,
                  "reasons": ["x"]}],
                "Composicion fantasma", db)
            
    finally:
        db.close()

def test_09_apply_valid_suggestion():
    d = _setup()
    db, project, sb, sa = d["db"], d["project"], d["song_b"], d["song_a"]

    try:
        assigns = get_song_assignments(sb.id, db)
        history = get_person_history(project.id, db, exclude_song_id=sb.id)
        res = generate_proposals(assigns, history)
        comp = create_composition_from_proposals(
            sb.id, res["proposals"], "Song B - Dist", db)
        
        assert comp["name"] == "Song B - Dist"
        assert "elements" in comp["data"]
        assert any(e.get("type") == "marimba"
                   for e in comp["data"]["elements"])

        orig = db.get(Composition, d["comp_a"].id)

        assert orig.data == d["orig"]
        assert orig.song_id == sa.id

    finally:
        db.close()

def test_10_reject_conflicting_suggestion():
    r = client.post("/api/suggestions", json={
        "history": [], "people": [], "groups": []})
    
    assert r.status_code == 200

    d = _setup()
    db = d["db"]

    try:
        with pytest.raises(HTTPException):
            get_song_requirements(999999, db)

        resp = client.get("/api/songs/999999/suggestions")

        assert resp.status_code == 404

        resp2 = client.get("/api/songs/999999/history")

        assert resp2.status_code == 404

    finally:
        db.close()

def test_11_original_composition_intact_before_apply():
    d = _setup()
    db, project, sb = d["db"], d["project"], d["song_b"]

    try:
        before = dict(db.get(Composition, d["comp_a"].id).data)
        assigns = get_song_assignments(sb.id, db)
        history = get_person_history(project.id, db, exclude_song_id=sb.id)
        res = generate_proposals(assigns, history)
        after_gen = db.get(Composition, d["comp_a"].id).data

        assert after_gen == before

        changes = analyze_changes(res["proposals"], history)

        assert isinstance(changes, list)

        after_an = db.get(Composition, d["comp_a"].id).data

        assert after_an == before

    finally:
        db.close()

def _plantillas_aisladas(marca):
    """
    Crea EXCLUSIVAMENTE las plantillas que necesita esta prueba y devuelve sus ids.

    `get_default_templates(db)` (engine_a.py) lee TODAS las plantillas de la base,
    sin ningun filtro. Por eso el resultado del test dependia de lo que hubiera
    guardado en la base de pruebas (en este proyecto quedaban plantillas de
    verificaciones anteriores) y la prueba era fragil.

    Nota: `MarimbaTemplate` NO tiene columna `active`. El aislamiento se hace
    creando plantillas propias y BORRANDOLAS al terminar en `_limpiar_plantillas`,
    sin tocar jamas las que ya existian.
    """
    db = SessionLocal()
    try:
        from app.models import MarimbaTemplate
        sufijo = uuid.uuid4().hex[:8].upper()
        ids = []

        for nombre, posiciones in marca:
            t = MarimbaTemplate(name='%s QA %s' % (nombre, sufijo),
                                positions=list(posiciones))
            db.add(t)
            db.flush()
            ids.append(t.id)

        db.commit()
        return ids
    finally:
        db.close()


def _limpiar_plantillas(ids):
    """Borra SOLO las plantillas creadas por la prueba; no toca las demas."""
    if not ids:
        return
    db = SessionLocal()
    try:
        from app.models import MarimbaTemplate

        for t in db.query(MarimbaTemplate).filter(
                MarimbaTemplate.id.in_(ids)).all():
            db.delete(t)

        db.commit()
    finally:
        db.close()


# Plantillas minimas: cubren las unicas dos posiciones que el test necesita
# ('Primera' para Carlos y 'Segunda' para Ana).
MARCA_PRUEBA = [
    ('Grande', ['Primera', 'Primera']),
    ('Tenor', ['Segunda']),
]


def test_12_suggestion_endpoints_e2e():
    d = _setup()
    db, sb = d["db"], d["song_b"]
    ids = _plantillas_aisladas(MARCA_PRUEBA)

    try:
        r = client.get(f"/api/songs/{sb.id}/history")

        assert r.status_code == 200

        hist = r.json()

        assert any(h["name"] == "Carlos" for h in hist)

        r = client.get(f"/api/songs/{sb.id}/requirements")

        assert r.status_code == 200
        assert r.json()["position_counts"]["Primera"] == 1

        r = client.get(f"/api/songs/{sb.id}/suggestions")

        assert r.status_code == 200

        body = r.json()

        assert body["song_name"] == "Song B"
        assert len(body["proposals"]) == 2
        assert "changes" in body

        cp = next(p for p in body["proposals"]
                  if p["name"] == "Carlos")
        
        # UX-3: las sugerencias se arman con las plantillas globales, no con una
        # marimba unica, y cada persona cae en un puesto compatible de una instancia.
        plan = body["marimba_plan"]
        plan_names = {m["name"] for m in plan}
        assert plan_names, "debe haber plan de marimbas derivado de plantillas"
        assert cp["marimba_name"] in plan_names, (
            f'{cp["marimba_name"]} debe pertenecer al plan {plan_names}')
        flat = [(m["name"], pos) for m in plan for pos in m["positions"]]
        assert (cp["marimba_name"], cp["position_type"]) in flat

        # La continuidad de posicion/marimba sigue informada en las razones.
        assert any("Continuidad" in r for r in cp["reasons"])

        r = client.post(f"/api/songs/{sb.id}/suggestions/apply",
                        json={"proposals": body["proposals"],
                              "name": "Song B - Dist",
                              "marimba_plan": body["marimba_plan"]})

        assert r.status_code == 200

        comp = r.json()

        assert comp["name"] == "Song B - Dist"
        assert any(e.get("type") == "marimba"
                   for e in comp["data"]["elements"])

        orig = db.get(Composition, d["comp_a"].id)

        db.refresh(orig)

        assert orig.data == d["orig"]

    finally:
        db.close()
        # Las plantillas de esta prueba se borran SIEMPRE, passara lo que pasare
        # con las aserciones, para no dejar residuos que afecten a otros tests.
        _limpiar_plantillas(ids)

def test_13_legacy_suggestions_endpoint():
    r = client.post("/api/suggestions", json={
        "history": [{"person_id": 1, "marimba_id": 101},
                    {"person_id": 1, "marimba_id": 101},
                    {"person_id": 2, "marimba_id": 102}],
        "people": [{"person_id": 1, "name": "Carlos"},
                   {"person_id": 2, "name": "Ana"}],
        "groups": []})
    
    assert r.status_code == 200
    assert "movement" in r.json() and "groups" in r.json()