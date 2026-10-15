from app.schema_audit import HEAD


def test_schema_audit_has_explicit_head_and_status_contract():
    assert HEAD == '0001_initial_schema'