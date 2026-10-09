"""
Fase 9E - enlace publico de SOLO LECTURA a una composicion.

Se separa de `routes.py` a proposito: son permisos DISTINTOS y mezclarlos seria
la via mas facil de convertir un enlace de consulta en una puerta de entrada.

Reglas que no se negocian:

- El `GET` publico NO usa `require_user` ni `check_csrf`: justamente sirve para
  quien no tiene sesion. Y al ser `GET` no muta nada, asi que no necesita CSRF.
- Un token invalido, revocado o de una composicion borrada devuelve **404**, no
  403: no se revela si el recurso existe. Es la convencion de `deps.py`.
- El token se busca por su HUELLA. No hay forma de listar, buscar ni enumerar:
  no existe ningun `GET /api/public/...` sin token.
- Lo que se publica es exactamente el estado PERSISTIDO. Lo que este en el
  navegador de alguien y no se haya guardado no existe publicamente.
- NO se expone el historial de versiones de 9C ni ningun dato de `User`.
- 9G: caducidad OPCIONAL (`expires_at`, UTC, nullable). `None` = sin
  caducidad; `expires_at <= now` = expirado = 404 indistinguible del
  inexistente/revocado. `expires_at` jamas sale en la proyeccion publica.
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core import rate_limit
from app.core.config import settings
from app.core.security import new_token, token_fingerprint
from app.models import (Composition, Project, PublicCompositionLink, Song, now)
from app.api.deps import (User, check_csrf, require_user, get_project_access,
                          record_audit, ACCESS_OWNER)

router=APIRouter()

# Fase 9J: la politica se lee del entorno UNA vez al importar el modulo
# (`PUBLIC_LINK_RATE_LIMIT` / `PUBLIC_LINK_RATE_WINDOW_S`, con defecto
# 60 req / 60 s). Los tests la reconfiguran con `rate_limit.configurar()`.
rate_limit.configurar(settings.public_link_rate_limit,
                       float(settings.public_link_rate_window_s))


def _aware(dt):
    """SQLite devuelve datetimes naive: se interpretan como UTC (convencion)."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _expirado(link)->bool:
    """`True` si el enlace tiene caducidad alcanzada. `None` = sin caducidad."""
    exp=_aware(link.expires_at)
    return exp is not None and exp<=datetime.now(timezone.utc)


def _parse_expires_at(valor)->datetime|None:
    """Fecha absoluta futura en UTC. `None`/ausente = sin caducidad.

    Acepta ISO-8601 con o sin zona (`Z`, offset, o naive = UTC). El pasado
    o el instante actual se rechaza con 422: crear algo ya expirado no
    tiene sentido y seria indistinguible de no haberlo creado.
    """
    if valor is None or (isinstance(valor,str) and not valor.strip()):
        return None
    if not isinstance(valor,str):
        raise HTTPException(422,'La fecha de expiración no es válida.')
    texto=valor.strip().replace('Z','+00:00')
    try:
        exp=datetime.fromisoformat(texto)
    except ValueError:
        raise HTTPException(422,'La fecha de expiración no es válida.')
    exp=_aware(exp)
    if exp<=datetime.now(timezone.utc):
        raise HTTPException(422,'La fecha de expiración debe estar en el futuro.')
    return exp


def _solo_propietario(cid:int,user:User,db:Session)->Composition:
    """La composicion, pero solo si el usuario es el PROPIETARIO del proyecto.

    Compartir hacia fuera es una decision de propiedad, no de colaboracion: un
    `editor` puede escribir la composicion, pero no publicarla. Por eso se exige
    `ACCESS_OWNER` y no `WRITE_LEVELS`.
    """
    c=db.get(Composition,cid)
    # 404 tambien aqui: no se revela la existencia de una composicion ajena.
    if not c or get_project_access(c.project_id,user,db)!=ACCESS_OWNER:
        raise HTTPException(404,'La composición no existe.')
    return c


def _enlace_de(cid:int,db:Session):
    return (db.query(PublicCompositionLink)
            .filter(PublicCompositionLink.composition_id==cid).first())


# --- Administracion (autenticada, solo propietario, con CSRF) --------------

@router.post('/compositions/{cid}/public-link')
async def crear_enlace_publico(cid:int,request:Request,
                               db:Session=Depends(get_db),
                               user:User=Depends(check_csrf)):
    """Crea (o reactiva) el enlace publico de una composicion.

    9G: acepta `{"expires_at": "<ISO-8601 futuro>"}` opcional en el cuerpo.
    Sin cuerpo o sin `expires_at` = sin caducidad (9E intacto). Pasado o
    invalido = 422. Solo el propietario (lo impone `_solo_propietario`).
    """
    c=_solo_propietario(cid,user,db)
    expira=None
    try:
        cuerpo=await request.json()
    except Exception:
        cuerpo=None
    if isinstance(cuerpo,dict) and 'expires_at' in cuerpo:
        expira=_parse_expires_at(cuerpo.get('expires_at'))
    link=_enlace_de(cid,db)
    token=new_token()
    if link is None:
        link=PublicCompositionLink(composition_id=cid,
                                  token_hash=token_fingerprint(token),
                                  created_by_user_id=user.id,
                                  expires_at=expira)
        db.add(link)
    else:
        # Reactivar genera un token NUEVO: el anterior queda inutilizable, por
        # si se compartio antes de cancelar.
        link.token_hash=token_fingerprint(token)
        link.created_by_user_id=user.id
        link.created_at=now()
        link.revoked_at=None
        link.expires_at=expira
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409,'Ya existe un enlace para esta composición.')
    db.refresh(link)
    record_audit(db,user,c.project_id,'PUBLIC_LINK_CREATED','composition',cid)
    return {'active':True,'token':token,
            'created_at':link.created_at.isoformat() if link.created_at else None,
            'expires_at':_aware(link.expires_at).isoformat()
                          if link.expires_at else None}


@router.delete('/compositions/{cid}/public-link')
def revocar_enlace_publico(cid:int,db:Session=Depends(get_db),
                           user:User=Depends(check_csrf)):
    """Revoca el enlace. No borra la composicion ni su historial."""
    c=_solo_propietario(cid,user,db)
    link=_enlace_de(cid,db)
    if link is None or link.revoked_at is not None:
        # 404: indistinguible de "no hay enlace", y no filtra el estado.
        raise HTTPException(404,'La composición no existe.')
    link.revoked_at=now()
    db.commit()
    record_audit(db,user,c.project_id,'PUBLIC_LINK_REVOKED','composition',cid)
    return {'active':False,'revoked_at':link.revoked_at.isoformat()}


@router.get('/compositions/{cid}/public-link')
def estado_enlace_publico(cid:int,db:Session=Depends(get_db),
                          user:User=Depends(check_csrf)):
    """Estado del enlace. NO devuelve el token: ya no se puede recuperar.

    9G: incluye `expires_at` (UTC ISO) para que el propietario vea la
    caducidad; un enlace expirado cuenta como inactivo, igual que revocado.
    """
    _solo_propietario(cid,user,db)
    link=_enlace_de(cid,db)
    activo=bool(link and link.revoked_at is None and not _expirado(link))
    expirado=bool(link and link.revoked_at is None and _expirado(link))
    return {'active':activo,
            'expired':expirado,
            'created_at':link.created_at.isoformat()
                          if link and link.created_at else None,
            'revoked_at':link.revoked_at.isoformat()
                          if link and link.revoked_at else None,
            'expires_at':_aware(link.expires_at).isoformat()
                          if link and link.expires_at else None}


# --- 9I: listado AGREGADO de enlaces del propietario ------------------------

@router.get('/public-links')
def listar_enlaces_publicos(db:Session=Depends(get_db),
                            user:User=Depends(require_user)):
    """Auditoria de TODOS los enlaces publicos del PROPIETARIO (solo lectura).

    9I: antes hay que entrar composicion por composicion (`PublicLinkPanel`);
    aqui se responde de una vez «que tengo publicado, que caduco y que
    revocare». Reutiliza los mismos mecanismos que las rutas individuales:

    - El AISLAMIENTO ocurre EN la consulta (`Project.owner_id==user.id`),
      no filtrando despues: editor, reader y usuarios ajenos no reciben ni
      un registro de otro propietario. No se usa `project_ids_for_user` porque
      ahi entran los compartidos; aqui solo cuenta la PROPIEDAD (igual que
      `_solo_propietario`).
    - Los estados se DERIVAN de los datos existentes (nunca se almacenan):
      `revocado` manda sobre `expirado` (precedencia 9I §9), y para el resto
      se reutiliza `_expirado()` tal cual: cero duplicaciones de la semantica
      UTC de 9G (`_aware`/`_expirado` viven en este mismo modulo).
    - NO devuelve token, huella, ids de usuario, ids internos, auditoria ni
      detalles de base: solo lo necesario para AUDITAR. Sin token no hay
      «abrir/copiar» aqui (el token en claro solo existe al crearlo); la URL
      se muestra unicamente en `PublicLinkPanel`, como siempre.
    - Orden estable `created_at DESC, id DESC` (convencion de listado: el mas
      reciente primero; el `id` desempata con timestamps identicos).
    - Sin paginacion, filtros ni busqueda: la escala real es de una mano de
      enlaces; anadirlos seria complejidad sin medida (9I §10).
    """
    filas=(db.query(PublicCompositionLink,Composition,Project)
           .join(Composition,
                 PublicCompositionLink.composition_id==Composition.id)
           .join(Project,Composition.project_id==Project.id)
           .filter(Project.owner_id==user.id)
           .order_by(PublicCompositionLink.created_at.desc(),
                     PublicCompositionLink.id.desc())
           .all())
    out=[]
    for link,c,p in filas:
        # Precedencia: revocado gana siempre sobre expirado (un enlace con las
        # dos condiciones se muestra como «Revocada», 9I §9).
        if link.revoked_at is not None:
            estado='revoked'
        elif _expirado(link):
            estado='expired'
        else:
            estado='active'
        # Campos elegidos uno a uno (estilo `public_user`): nada de `obj()`.
        out.append({'project_name':p.name,
                    'composition_name':c.name,
                    'created_at':link.created_at.isoformat()
                                 if link.created_at else None,
                    'expires_at':_aware(link.expires_at).isoformat()
                                 if link.expires_at else None,
                    'revoked_at':link.revoked_at.isoformat()
                                 if link.revoked_at else None,
                    'status':estado})
    return out

# --- Consulta publica (sin sesion, sin CSRF, solo lectura) -----------------

@router.get('/public/compositions/{token}')
def ver_publico(token:str,request:Request,db:Session=Depends(get_db)):
    """Composicion compartida en modo consulta. NO requiere sesion.

    Fase 9J: rate-limit por IP de conexion directa (60 req / 60 s por defecto).
    Dentro del limite la semantica 9E/9G esta intacta; fuera del limite se
    responde 429 uniforme (cabecera `Retry-After` real), sin revelar si el
    token existe, expiro o fue revocado.
    """
    # Solo el acceso publico por token se limita: `public-links` (autenticado)
    # y las operaciones del propietario quedan fuera (9J §5).
    ip=(request.client.host if request.client and request.client.host
        else 'desconocida')
    permitido,reintento=rate_limit.comprobar(ip)
    if not permitido:
        raise HTTPException(429,'Demasiadas solicitudes. Inténtalo de nuevo '
                                'en unos momentos.',
                            headers={'Retry-After':str(max(int(reintento),1))})
    if not token or len(token)>200:
        raise HTTPException(404,'Enlace no válido.')
    if not token or len(token)>200:
        raise HTTPException(404,'Enlace no válido.')
    link=(db.query(PublicCompositionLink)
          .filter(PublicCompositionLink.token_hash==token_fingerprint(token),
                  PublicCompositionLink.revoked_at.is_(None)).first())
    # Invalido, revocado, expirado o composicion borrada: la MISMA
    # respuesta, siempre 404. El expirado NO revela que existio.
    if link is None or _expirado(link):
        raise HTTPException(404,'Enlace no válido.')
    c=db.get(Composition,link.composition_id)
    if c is None:
        raise HTTPException(404,'Enlace no válido.')

    song=db.get(Song,c.song_id) if c.song_id else None
    project=db.get(Project,c.project_id)
    # Campos ELEGIDOS UNO A UNO, igual que hace `public_user`: no se devuelve
    # `obj(c)` ni nada de `User`. Solo lo justo para identificar al musician y
    # saber en que cancion esta. Sin correos, sin roles, sin propietario, sin
    # identificadores internos, sin token y sin historial de versiones.
    return {
      'name':c.name,
      'width':c.width,
      'height':c.height,
      'data':c.data or {'elements':[]},
      'song_name':song.name if song else None,
      'project_name':project.name if project else None,
    }