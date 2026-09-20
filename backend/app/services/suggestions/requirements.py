from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models import Song


def get_song_requirements(song_id, db):
    """
    Retornar {nombre_posicion: cantidad} basado en los SongAssignment de la canción.
    """
    song = db.get(Song, song_id)
    if not song:
        raise HTTPException(404, f'La canción {song_id} no existe.')

    counts = {}
    for assignment in song.assignments:
        pos_name = assignment.position.name
        counts[pos_name] = counts.get(pos_name, 0) + 1

    return dict(sorted(counts.items(), key=lambda x: x[0]))


def get_song_assignments(song_id, db):
    """
    Retornar la lista de asignaciones para una canción:
    [{person_id, person_name, position_name, mark}, ...]
    """
    song = db.get(Song, song_id)
    if not song:
        raise HTTPException(404, f'La canción {song_id} no existe.')

    return [
        {
            'person_id': a.person_id,
            'person_name': a.person.name,
            'position_name': a.position.name,
            'mark': a.mark,
        }
        for a in song.assignments
    ]
