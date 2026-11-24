"""Orquestador del motor para una cancion (parte 3).

Fase 3: la decision de asignaciones vive UNICAMENTE en
`core.build_distribution_core`. Este modulo solo aplica el adaptador de salida
de `/distribution-suggestion`; ya no decide nada por su cuenta.
"""
from app.models import Song
from fastapi import HTTPException
from app.services.suggestions.core import (build_distribution_core,
                                           to_distribution_response)


def get_distribution_for_song(song_id, db):
    song = db.get(Song, song_id)

    if not song:
        raise HTTPException(404, 'La cancion %d no existe.' % song_id)

    if song.project is None:
        raise HTTPException(404, 'El proyecto no existe.')

    return to_distribution_response(build_distribution_core(song, db))
