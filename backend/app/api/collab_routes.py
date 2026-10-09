"""
Fase 7D - colaboracion y auditoria de proyectos.

Las rutas de escritura exigen PROPIETARIO. Un editor o un reader que intente
compartir, cambiar permisos o revocar recibe 404: el permiso se comprueba en el
servidor, no en la interfaz.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.deps import (ACCESS_EDITOR, ACCESS_NONE, ACCESS_OWNER, ACCESS_READER,
                          ownable_project, readable_project, record_audit,
                          revoke_user_sessions, require_user, require_write_user)
from app.models import User, ProjectCollaborator, AuditLog

router = APIRouter()

# Roles validos: conjunto cerrado, no se acepta texto arbitrario.
VALID_ROLES = {ACCESS_EDITOR, ACCESS_READER}


def _view(c, u: User) -> dict:
    """Vista publica de un colaborador. Nunca incluye hash ni contrasena."""
    return {'user_id': c.user_id, 'name': u.name, 'email': u.email,
            'role': c.role,
            'created_at': c.created_at.isoformat() if c.created_at else None}


@router.get('/projects/{pid}/access')
def project_access(pid: int, user: User = Depends(require_user),
                   db: Session = Depends(get_db)):
    """Nivel del usuario sobre el proyecto (lo usa el indicador de la UI)."""
    from app.api.deps import get_project_access
    access = get_project_access(pid, user, db)
    if access == ACCESS_NONE:
        raise HTTPException(404, 'El proyecto no existe.')
    return {'project_id': pid, 'access': access,
            'can_edit': access in (ACCESS_OWNER, ACCESS_EDITOR),
            'can_share': access == ACCESS_OWNER}


@router.get('/projects/{pid}/collaborators')
def list_collaborators(pid: int, user: User = Depends(require_user),
                       db: Session = Depends(get_db)):
    """Propietario y editores ven QUIEN tiene acceso (sin datos sensibles)."""
    p = readable_project(pid, user, db)
    rows = (db.query(ProjectCollaborator, User)
            .join(User, ProjectCollaborator.user_id == User.id)
            .filter(ProjectCollaborator.project_id == pid).all())
    out = [_view(c, u) for c, u in rows]
    # El propietario se muestra marcado como tal: no es una fila de
    # colaboracion, su permiso viene de `Project.owner_id`.
    if p.owner:
        out.insert(0, {'user_id': p.owner.id, 'name': p.owner.name,
                       'email': p.owner.email, 'role': ACCESS_OWNER,
                       'created_at': None})
    return out


@router.post('/projects/{pid}/collaborators')
def add_collaborator(pid: int, payload: dict,
                     user: User = Depends(require_write_user),
                     db: Session = Depends(get_db)):
    """Anade un colaborador. Solo el propietario."""
    p = ownable_project(pid, user, db)
    role = (payload.get('role') or '').strip().lower()
    if role not in VALID_ROLES:
        raise HTTPException(400, "El rol debe ser 'editor' o 'reader'.")
    email = (payload.get('email') or '').strip().lower()
    target = db.query(User).filter(User.email == email).first()
    if not target:
        raise HTTPException(404, 'No hay ninguna cuenta con ese correo.')
    if not target.active:
        raise HTTPException(400, 'Esa cuenta esta desactivada.')
    # Regla 7D: el propietario NUNCA es colaborador suyo.
    if target.id == p.owner_id:
        raise HTTPException(400, 'El propietario ya tiene acceso total.')
    if (db.query(ProjectCollaborator)
            .filter(ProjectCollaborator.project_id == pid,
                    ProjectCollaborator.user_id == target.id).first()):
        raise HTTPException(409, 'Esa persona ya tiene acceso al proyecto.')
    c = ProjectCollaborator(project_id=pid, user_id=target.id, role=role)
    db.add(c)
    db.commit()
    db.refresh(c)
    # Se construye la respuesta ANTES de auditar: `record_audit` hace commit y
    # expiraria el objeto `c`, dejandolo inutilizable para serializar.
    respuesta = _view(c, target)
    record_audit(db, user, pid, 'COLLABORATOR_ADDED', 'user', target.id,
                 {'email': target.email, 'role': role})
    return respuesta


@router.patch('/projects/{pid}/collaborators/{target_id}')
def change_collaborator_role(pid: int, target_id: int, payload: dict,
                             user: User = Depends(require_write_user),
                             db: Session = Depends(get_db)):
    """Cambia reader <-> editor. Solo el propietario."""
    p = ownable_project(pid, user, db)
    if target_id == p.owner_id:
        raise HTTPException(400, 'No se puede cambiar el rol del propietario.')
    role = (payload.get('role') or '').strip().lower()
    if role not in VALID_ROLES:
        raise HTTPException(400, "El rol debe ser 'editor' o 'reader'.")
    c = (db.query(ProjectCollaborator)
         .filter(ProjectCollaborator.project_id == pid,
                 ProjectCollaborator.user_id == target_id).first())
    if not c:
        raise HTTPException(404, 'Esa persona no tiene acceso al proyecto.')
    anterior = c.role
    c.role = role
    db.commit()
    record_audit(db, user, pid, 'COLLABORATOR_ROLE_CHANGED', 'user', target_id,
                 {'from': anterior, 'to': role})
    return _view(c, db.get(User, target_id))


@router.delete('/projects/{pid}/collaborators/{target_id}')
def remove_collaborator(pid: int, target_id: int,
                        user: User = Depends(require_write_user),
                        db: Session = Depends(get_db)):
    """Revoca el acceso. Solo el propietario."""
    p = ownable_project(pid, user, db)
    if target_id == p.owner_id:
        raise HTTPException(400, 'No se puede revocar el propietario.')
    c = (db.query(ProjectCollaborator)
         .filter(ProjectCollaborator.project_id == pid,
                 ProjectCollaborator.user_id == target_id).first())
    if not c:
        raise HTTPException(404, 'Esa persona no tiene acceso al proyecto.')
    u = db.get(User, target_id)
    email = u.email if u else str(target_id)
    db.delete(c)
    db.commit()
    # Revocacion INMEDIATA: se cierran sus sesiones abiertas para que no pueda
    # seguir operando con una sesion viva.
    revoke_user_sessions(db, target_id)
    record_audit(db, user, pid, 'COLLABORATOR_REMOVED', 'user', target_id,
                 {'email': email})
    return {'deleted': True, 'user_id': target_id}


@router.get('/projects/{pid}/audit-log')
def project_audit_log(pid: int, limit: int = 100, offset: int = 0,
                      user: User = Depends(require_user),
                      db: Session = Depends(get_db)):
    """Historial de cambios. Solo el propietario."""
    ownable_project(pid, user, db)
    limit = max(1, min(500, limit))
    offset = max(0, offset)
    total = db.query(AuditLog).filter(AuditLog.project_id == pid).count()
    rows = (db.query(AuditLog, User)
            .outerjoin(User, AuditLog.actor_user_id == User.id)
            .filter(AuditLog.project_id == pid)
            .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
            .offset(offset).limit(limit).all())
    return {'entries': [
        {'id': e.id, 'action': e.action, 'entity_type': e.entity_type,
         'entity_id': e.entity_id, 'details': e.details,
         'actor_id': e.actor_user_id,
         'actor_email': (u.email if u else None),
         'actor_name': (u.name if u else None),
         'created_at': e.created_at.isoformat() if e.created_at else None}
        for e, u in rows],
        'total': total, 'limit': limit, 'offset': offset}
    return _view(c, target)
