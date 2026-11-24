"""Inspección de solo lectura para adoptar bases pre-Alembic.

Este módulo nunca ejecuta DDL, no escribe `alembic_version` y no intenta
reparar una base. La adopción de metadatos, si procede, sigue siendo una
decisión explícita del operador después de revisar el resultado.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import inspect, text

from app.db.session import Base, engine
from app.models import models  # noqa: F401 - registra todas las tablas


HEAD = '0001_initial_schema'
_SYSTEM_TABLES = {'alembic_version', 'sqlite_sequence'}


def _cols(values) -> tuple[str, ...]:
    if values is None:
        return ()
    return tuple((value or '').strip() for value in values)


def _type_name(dialect, value: Any) -> str:
    try:
        return dialect.type_compiler.process(value).replace(' ', '').lower()
    except Exception:
        return str(value).replace(' ', '').lower()


def _expected_schema(dialect) -> dict[str, dict[str, Any]]:
    expected = {}
    for table in Base.metadata.sorted_tables:
        columns = {}
        for column in table.columns:
            columns[column.name] = {
                'type': _type_name(dialect, column.type),
                'nullable': bool(column.nullable),
                'primary_key': bool(column.primary_key),
            }
        foreign_keys = set()
        for fk in table.foreign_key_constraints:
            elements = tuple(fk.elements)
            foreign_keys.add((
                _cols(element.parent.name for element in elements),
                fk.referred_table.name,
                _cols(element.column.name for element in elements),
                (fk.ondelete or '').lower(),
            ))
        uniques = {
            _cols(constraint.columns.keys())
            for constraint in table.constraints
            if constraint.__class__.__name__ == 'UniqueConstraint'
        }
        indexes = {
            (_cols(index.columns.keys()), bool(index.unique))
            for index in table.indexes
        }
        expected[table.name] = {
            'columns': columns,
            'foreign_keys': foreign_keys,
            'uniques': uniques,
            'indexes': indexes,
        }
    return expected


def _actual_version(connection, inspector) -> dict[str, Any]:
    if not inspector.has_table('alembic_version'):
        return {'state': 'absent', 'revisions': []}
    rows = connection.execute(
        text('SELECT version_num FROM alembic_version ORDER BY version_num')
    ).scalars().all()
    revisions = [str(row) for row in rows]
    if len(revisions) != 1:
        return {'state': 'unknown', 'revisions': revisions}
    if revisions[0] != HEAD:
        return {'state': 'unknown', 'revisions': revisions}
    return {'state': 'valid', 'revisions': revisions}


def inspect_schema() -> dict[str, Any]:
    """Devuelve un diagnóstico sin ejecutar ninguna operación de escritura."""
    diagnostics: list[dict[str, Any]] = []
    with engine.connect() as connection:
        if connection.dialect.name == 'postgresql':
            with connection.begin():
                connection.execute(text('SET TRANSACTION READ ONLY'))
                return _inspect_connection(connection, diagnostics)
        return _inspect_connection(connection, diagnostics)


def _inspect_connection(connection, diagnostics: list[dict[str, Any]]) -> dict[str, Any]:
    inspector = inspect(connection)
    dialect = connection.dialect
    expected = _expected_schema(dialect)
    expected_tables = set(expected)
    actual_tables = set(inspector.get_table_names()) - _SYSTEM_TABLES

    missing_tables = sorted(expected_tables - actual_tables)
    extra_tables = sorted(actual_tables - expected_tables)
    for table in missing_tables:
        diagnostics.append({'kind': 'missing_table', 'table': table})
    for table in extra_tables:
        diagnostics.append({'kind': 'unexpected_table', 'table': table})

    for table_name in sorted(expected_tables & actual_tables):
        spec = expected[table_name]
        actual_columns = {
            column['name']: column for column in inspector.get_columns(table_name)
        }
        actual_primary_key = set(
            inspector.get_pk_constraint(table_name).get('constrained_columns') or []
        )
        expected_columns = set(spec['columns'])
        for column in sorted(expected_columns - set(actual_columns)):
            diagnostics.append({
                'kind': 'missing_column', 'table': table_name, 'column': column,
            })
        for column in sorted(set(actual_columns) - expected_columns):
            diagnostics.append({
                'kind': 'unexpected_column', 'table': table_name, 'column': column,
            })
        for column_name in sorted(expected_columns & set(actual_columns)):
            wanted = spec['columns'][column_name]
            actual = actual_columns[column_name]
            actual_type = _type_name(dialect, actual['type'])
            if actual_type != wanted['type']:
                diagnostics.append({
                    'kind': 'type_mismatch', 'table': table_name,
                    'column': column_name, 'expected': wanted['type'],
                    'actual': actual_type,
                })
            if bool(actual.get('nullable')) != wanted['nullable']:
                diagnostics.append({
                    'kind': 'nullable_mismatch', 'table': table_name,
                    'column': column_name, 'expected': wanted['nullable'],
                    'actual': bool(actual.get('nullable')),
                })
            if (column_name in actual_primary_key) != wanted['primary_key']:
                diagnostics.append({
                    'kind': 'primary_key_mismatch', 'table': table_name,
                    'column': column_name,
                })

        actual_fks = set()
        for fk in inspector.get_foreign_keys(table_name):
            actual_fks.add((
                _cols(fk.get('constrained_columns')),
                fk.get('referred_table') or '',
                _cols(fk.get('referred_columns')),
                (fk.get('options') or {}).get('ondelete', '').lower(),
            ))
        for fk in sorted(spec['foreign_keys'] - actual_fks):
            diagnostics.append({
                'kind': 'missing_foreign_key', 'table': table_name,
                'columns': fk[0], 'referred_table': fk[1],
                'referred_columns': fk[2], 'ondelete': fk[3],
            })

        actual_uniques = {
            _cols(unique.get('column_names'))
            for unique in inspector.get_unique_constraints(table_name)
        }
        actual_indexes = {
            (_cols(index.get('column_names')), bool(index.get('unique')))
            for index in inspector.get_indexes(table_name)
        }
        for unique in sorted(spec['uniques']):
            if unique not in actual_uniques and (unique, True) not in actual_indexes:
                diagnostics.append({
                    'kind': 'missing_unique', 'table': table_name,
                    'columns': unique,
                })
        for index_columns, unique in sorted(spec['indexes']):
            if (index_columns, unique) not in actual_indexes:
                diagnostics.append({
                    'kind': 'missing_index', 'table': table_name,
                    'columns': index_columns, 'unique': unique,
                })

    version = _actual_version(connection, inspector)
    hard_kinds = {
        'missing_table', 'missing_column', 'type_mismatch',
        'nullable_mismatch', 'primary_key_mismatch', 'missing_foreign_key',
        'missing_unique', 'missing_index',
    }
    has_hard_difference = any(item['kind'] in hard_kinds for item in diagnostics)
    has_uncertain_difference = any(
        item['kind'] in {'unexpected_table', 'unexpected_column'}
        for item in diagnostics
    )

    if has_hard_difference:
        status = 'incompatible'
    elif version['state'] == 'unknown' or has_uncertain_difference:
        status = 'unknown'
    else:
        status = 'compatible'

    if status == 'compatible' and version['state'] == 'absent':
        recommendation = (
            'Esquema físicamente compatible sin historial Alembic; requiere '
            'backup, revisión humana y adopción explícita. Este comando no hace stamp.'
        )
    elif status == 'compatible':
        recommendation = 'Esquema compatible y revisión Alembic válida.'
    elif status == 'unknown':
        recommendation = 'No adoptar: el estado histórico no puede demostrarse.'
    else:
        recommendation = 'No adoptar: corregir o migrar con un plan revisado.'

    return {
        'status': status,
        'revision': version,
        'expected_head': HEAD,
        'diagnostics': diagnostics,
        'recommendation': recommendation,
    }