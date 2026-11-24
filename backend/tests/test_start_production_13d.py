import os
import sys

import start_production


def test_migracion_falla_y_no_inicia_uvicorn(monkeypatch, capsys):
    calls = []

    class Result:
        returncode = 7

    monkeypatch.setattr(start_production.subprocess, 'run',
                        lambda command, check: (calls.append(command) or Result()))
    exec_calls = []
    monkeypatch.setattr(start_production.os, 'execvpe',
                        lambda *args: exec_calls.append(args))

    assert start_production.main() == 7
    assert calls == [[sys.executable, '-m', 'alembic', 'upgrade', 'head']]
    assert exec_calls == []
    output = capsys.readouterr().err
    assert 'Uvicorn no se iniciara' in output
    assert 'DATABASE_URL' not in output


def test_migracion_exitosa_reemplaza_proceso_con_uvicorn_y_port(monkeypatch):
    class Result:
        returncode = 0

    commands = []
    monkeypatch.setattr(start_production.subprocess, 'run',
                        lambda command, check: (commands.append((command, check)) or Result()))
    exec_calls = []

    def fake_exec(*args):
        exec_calls.append(args)

    monkeypatch.setattr(start_production.os, 'execvpe', fake_exec)
    monkeypatch.setenv('PORT', '10000')

    assert start_production.main() == 0
    assert commands == [([sys.executable, '-m', 'alembic', 'upgrade', 'head'], False)]
    assert exec_calls[0][0] == 'uvicorn'
    assert exec_calls[0][1] == [
        'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', '10000'
    ]
    assert exec_calls[0][2]['PORT'] == '10000'
