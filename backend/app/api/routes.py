import unicodedata,re
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from app.db.session import get_db
from app.models import (Project,Person,Position,Song,SongAssignment,MarimbaTemplate,
                        Composition,CompositionVersion)
from app.api.deps import (User, require_user, check_csrf, check_admin, owned_project,
                          owner_project,
                          owned_song, owned_composition, owned_person,
                          readable_project, readable_song, readable_composition,
                          project_ids_for_user, get_project_access, record_audit)
from app.schemas.schemas import ProjectIn,ProjectPatch,CompositionIn,CompositionPatch,MarimbaTemplateIn,MarimbaTemplatePatch,ImportConfirm,SongIn,SongPatch,CompositionDuplicateIn,ApplySuggestions,PersonIn,PersonPatch
from app.services.excel_parser import parse_workbook,match_people,detect_duplicates
from app.services.suggestions import suggest, get_suggestions_for_song
from app.services.suggestions.distribution import get_distribution_for_song
from app.services.suggestions.distributor import create_composition_from_proposals
from app.services.suggestions.engine_e import create_distribution_composition
from app.services.suggestions.history import get_person_history
from app.services.suggestions.requirements import get_song_requirements_report, get_capacity_composition
from app.services.suggestions.engine_a import (get_previous_song, slots_from_composition,
                                               get_previous_assignment_map)
from app.services.suggestions.positions import canonical
from app.services.suggestions.optimizer import COSTOS, optimize_proposals

router=APIRouter()

def obj(x):
    return {c.name:getattr(x,c.name) for c in x.__table__.columns}

@router.get('/health')
def health(): 
    return {'status':'ok'}

@router.post('/imports/preview')
async def preview(file:UploadFile=File(...), db:Session=Depends(get_db)):
    name=(file.filename or '')
    ext=name.lower().rsplit('.',1)[-1] if '.' in name else ''

    if ext not in ('xlsx','xlsm','xls'):
        raise HTTPException(400,'No se encontró la columna Nombre: extensión de archivo no válida. Solo se admiten .xlsx, .xlsm y .xls.')

    raw=await file.read()

    if not raw:
        raise HTTPException(400,'El archivo está vacío (0 bytes).')

    if len(raw)>10*1024*1024:
        raise HTTPException(413,'El archivo supera el tamaño permitido (10 MB).')

    try:
        parsed=parse_workbook(raw)
    except Exception as e:
        raise HTTPException(422,f'No se pudo leer el archivo como un Excel válido: {type(e).__name__}.')

    total_rows=sum(len(s['assignments']) for sh in parsed['sheets'] for s in sh['songs'])

    if total_rows==0:
        raise HTTPException(422,'El archivo no contiene filas válidas. Verifica que existan canciones (fila 1), posiciones (fila 2) y personas con marcas (desde la fila 3).')

    existing=[p.name for p in db.scalars(select(Person)).all()]
    parsed['matches']=match_people(parsed['people'],existing)
    parsed['duplicates']=detect_duplicates(parsed['people'])
    parsed['source_filename']=name

    return parsed

@router.post('/imports/confirm')
def confirm(payload:ImportConfirm,db:Session=Depends(get_db),
            user:User=Depends(check_csrf)):
    # 7C: importar en el proyecto de otro usuario seria una escritura cruzada.
    if payload.project_id is not None:
        owned_project(payload.project_id,user,db)
        project=db.get(Project,payload.project_id)

        if not project:
            raise HTTPException(404,f'El proyecto {payload.project_id} no existe.')

        if payload.source_filename and not project.source_filename:
            project.source_filename=payload.source_filename
    else:
        # 7C: un proyecto nuevo pertenece SIEMPRE a quien lo importa. Sin esto
        # naceria sin dueno y ninguna ruta privada podria abrirlo despues.
        project=Project(name=payload.project_name,description=payload.description,
                        source_filename=payload.source_filename,owner_id=user.id)
        db.add(project)

    db.flush()
    person_by_norm={}

    def n(s): 
        s=re.sub(r'[^a-z0-9 ]','',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower())
        return re.sub(r'\s+',' ',s).strip()

    existing_people={n(p.name):p for p in db.scalars(select(Person)).all()}
    existing_positions={n(p.name):p for p in db.scalars(select(Position)).all()}

    # UX-5: import incremental. Las canciones del Excel se AGREGAN al final de
    # las que ya tiene el proyecto; nunca se reemplazan ni se descartan.
    # Solo se deduplica DENTRO del mismo archivo (una cancion repetida en el
    # mismo Excel es un error del archivo), y se reportan como `duplicate_songs`
    # las que ya existian en el proyecto, para que la interfaz pueda avisar.
    songs_before=db.scalar(
        select(func.count()).select_from(Song).where(Song.project_id==project.id)) or 0
    existing_song_names={n(s.name) for s in
                         db.scalars(select(Song).where(Song.project_id==project.id)).all()}
    # Siguiente `order_index` libre: se toma del maximo existente, no del conteo,
    # para que un hueco previo no genere indices repetidos.
    max_order=db.scalar(
        select(func.max(Song.order_index)).where(Song.project_id==project.id))
    next_order=0 if max_order is None else max_order+1
    # Nombres ya vistos DENTRO de este payload.
    seen_in_payload=set()
    added=[]
    duplicates=[]
    ignored=[]

    for sh in payload.sheets:
        for song_data in sh.get('songs',[]):
            song_name=(song_data.get('name') or '').strip()

            if not song_name:
                continue

            key=n(song_name)

            # Repetida dentro del mismo archivo: se conserva la primera.
            if key in seen_in_payload:
                ignored.append(song_name)
                continue

            seen_in_payload.add(key)

            if key in existing_song_names:
                duplicates.append(song_name)

            song=Song(project_id=project.id,name=song_name,order_index=next_order)
            next_order+=1
            db.add(song) 
            db.flush()
            added.append(song_name)

            for a in song_data.get('assignments',[]):
                raw_name=(a.get('person') or '').strip()

                if not raw_name:
                    continue

                key=n(raw_name)
                person=person_by_norm.get(key) or existing_people.get(key)

                if not person:
                    person=Person(name=raw_name)
                    db.add(person)
                    db.flush()
                    existing_people[key]=person

                person_by_norm[key]=person

                pos_key=n(a['position'])
                pos=existing_positions.get(pos_key)

                if not pos:
                    pos=Position(name=a['position'])
                    db.add(pos)
                    db.flush()
                    existing_positions[pos_key]=pos

                db.add(SongAssignment(song_id=song.id,person_id=person.id,position_id=pos.id,mark=a.get('mark','X')))

    db.commit()

    return {'id':project.id,'name':project.name,
            'added_songs':added,'duplicate_songs':duplicates,'ignored_songs':ignored,
            'songs_before':songs_before,'songs_after':songs_before+len(added)}

@router.get('/projects')
def projects(db:Session=Depends(get_db),user:User=Depends(require_user)):
    # 7D: los proyectos COMPARTIDOS tambien aparecen, con su nivel. Se
    # resuelven con dos consultas (propios + compartidos), no una por fila.
    acceso=project_ids_for_user(db,user)
    if not acceso:
        return []
    filas=db.scalars(select(Project).where(Project.id.in_(list(acceso)))
                    .order_by(Project.created_at.desc())).all()
    out=[]
    for x in filas:
        d=obj(x)
        # `access` y `shared_with_me` permiten a la interfaz distinguir de un
        # vistazo lo propio de lo compartido. No sustituye a la seguridad.
        d['access']=acceso[x.id]
        d['shared_with_me']=acceso[x.id]!='owner'
        out.append(d)
    return out

@router.post('/projects')
def create_project(p:ProjectIn,db:Session=Depends(get_db),user:User=Depends(check_csrf)):
    # El cuerpo de la peticion NO puede decidir la propiedad.
    x=Project(**p.model_dump())
    x.owner_id=user.id
    db.add(x)
    db.commit()
    db.refresh(x)
    # 7D: queda constancia de quien creo el proyecto.
    record_audit(db,user,x.id,'PROJECT_CREATED','project',x.id,{'name':x.name})
    return obj(x)

@router.patch('/projects/{pid}')
def rename_project(pid:int,p:ProjectPatch,db:Session=Depends(get_db),user:User=Depends(check_csrf)):
    # 404 (no 403) para un proyecto ajeno: no se revela su existencia.
    x=owned_project(pid,user,db)

    # 7F: se guarda el nombre anterior para que el evento diga QUE
    # cambio se hizo, no solo que hubo un cambio.
    nombre_anterior=x.name

    if p.name is not None:
        name=p.name.strip()

        if not name:
            raise HTTPException(400,'El nombre del proyecto no puede estar vacío.')

        dup=db.scalar(select(Project).where(Project.name==name,
                                            Project.id!=pid,Project.owner_id==user.id))

        if dup:
            raise HTTPException(409,f'Ya existe un proyecto llamado "{name}".')

        x.name=name

    if p.description is not None:
        x.description=p.description.strip() or None

    db.commit()
    db.refresh(x)

    # 7F: el evento va DESPUES del commit, para no dejar constancia de un
    # cambio que al final no llego a confirmarse.
    record_audit(db,user,x.id,'PROJECT_UPDATED','project',x.id,
                 {'name':x.name,'previous_name':nombre_anterior})

    return obj(x)

@router.delete('/projects/{pid}')
def delete_project(pid:int,db:Session=Depends(get_db),user:User=Depends(check_csrf)):
    """Elimina un trabajo completo: canciones, asignaciones y composiciones.

    No toca el catalogo global de personas ni las plantillas.

    7E: borrar el proyecto es question de SU PROYECTO, no de su contenido, asi
    que lo hace falta el propietario. Un `editor` puede escribir canciones y
    composiciones, pero no puede destruir el trabajo de su propietario.
    """
    x=owner_project(pid,user,db)

    song_ids=[s.id for s in x.songs]
    assignments=0

    if song_ids:
        assignments=db.scalar(select(func.count(SongAssignment.id)).where(SongAssignment.song_id.in_(song_ids))) or 0

    compositions=db.query(Composition).filter(Composition.project_id==pid).count()
    # Project.songs / Project.compositions ya tienen cascade='all, delete-orphan',
    # y Song.assignments tambien: basta con borrar el proyecto.
    nombre_proyecto=x.name
    db.delete(x)
    db.commit()
    # 7F: `project_id` se deja a proposito en None. La fila de auditoria
    # tiene ON DELETE CASCADE sobre el proyecto: si se associates al
    # proyecto, este mismo evento se borraria con el. Guardando solo el
    # id y el nombre sobrevive al borrado, que es justo cuando hace falta.
    record_audit(db,user,None,'PROJECT_DELETED','project',pid,
                 {'name':nombre_proyecto,
                  'songs_removed':len(song_ids),
                  'compositions_removed':compositions})

    return {'deleted':True,'id':pid,'songs':len(song_ids),
            'assignments_removed':assignments,'compositions_removed':compositions}

@router.get('/projects/{pid}')
def project(pid:int,db:Session=Depends(get_db),user:User=Depends(require_user)):
    # 7D: lectura permitida a owner, editor y reader. `access` viaja en la
    # respuesta para que la interfaz ajuste el modo (solo lectura, etc.).
    p=readable_project(pid,user,db)
    
    songs=[]
    for s in p.songs:
        songs.append({'id':s.id,'name':s.name,'assignments':[{'id':a.id,'person_id':a.person_id,'person':a.person.name,'position_id':a.position_id,'position':a.position.name,'mark':a.mark} for a in s.assignments]})

    return {'project':{**obj(p),'access':get_project_access(p.id,user,db)},
            'songs':songs,
            'compositions':[{'id':c.id,'name':c.name,'song_id':c.song_id,'width':c.width,'height':c.height,'data':c.data,'created_at':c.created_at,'updated_at':c.updated_at} for c in p.compositions]}

@router.get('/people')
def people(db:Session=Depends(get_db),user:User=Depends(require_user)):
    # Los de sus proyectos mas el catalogo global (project_id NULL), que por
    # diseno del proyecto es compartido. Antes devolvia TODOS los usuarios.
    mios=db.scalars(select(Person).join(Project,Person.project_id==Project.id)
                    .where(Project.owner_id==user.id,Person.active.is_(True))
                    .order_by(Person.name)).all()
    globales=db.scalars(select(Person).where(Person.project_id.is_(None),
                                             Person.active.is_(True))
                        .order_by(Person.name)).all()
    vistos={}
    for p in mios+globales:
        vistos.setdefault(p.id,p)
    return [obj(x) for x in vistos.values()]

def _person_in_project(db, name, project_id):
    """
    Devuelve la persona con ese nombre que pertenece al proyecto, si existe.

    Dos caminos: creada explicitamente para el proyecto (`project_id`) o
    heredada del catalogo global (`project_id IS NULL`) pero con alguna
    participacion en sus canciones. Asi el duplicado se detecta aunque la
    persona todavia no tenga asignaciones.
    """
    if project_id is None:
        return db.scalar(select(Person).where(Person.name == name))
    directa = db.scalar(select(Person).where(
        Person.name == name, Person.project_id == project_id))
    if directa:
        return directa
    song_ids = select(Song.id).where(Song.project_id == project_id)
    return db.scalar(
        select(Person)
        .join(SongAssignment, SongAssignment.person_id == Person.id)
        .where(SongAssignment.song_id.in_(song_ids),
               Person.name == name,
               Person.project_id.is_(None))
    )

@router.post('/people')
def create_person(p:PersonIn,db:Session=Depends(get_db),user:User=Depends(check_csrf)):
    name=p.name.strip()
    if not name:
        raise HTTPException(400,'El nombre de la persona no puede estar vacío.')
    # 7C: no se puede colar una persona en el proyecto de otro usuario. Si no
    # se indica proyecto, la persona va al catalogo global compartido.
    if p.project_id is not None:
        owned_project(p.project_id,user,db)
        # Una persona creada especificamente para este proyecto se conserva
        # como fila inactiva al retirarla con scope=project. Reactivarla es la
        # operacion inversa de esa retirada: no crea un id duplicado ni obliga
        # al usuario a renombrarla para poder volver a trabajar con ella.
        inactiva=db.scalar(select(Person).where(
            Person.name==name, Person.project_id==p.project_id,
            Person.active.is_(False)))
        if inactiva and not _person_has_project_references(db,inactiva.id,p.project_id):
            inactiva.active=True
            db.commit()
            db.refresh(inactiva)
            return obj(inactiva)
    # UX-4: la validacion de duplicado se hace SOLO dentro del proyecto actual.
    # Antes bloqueaba a quien ya existiria en otro proyecto, sin poder agregarlo.
    # Sin `project_id` no hay ambito de proyecto, asi que se exige unicidad global.
    if p.project_id is None:
        dup = db.scalar(select(Person).where(Person.name == name))
    else:
        dup = _person_in_project(db, name, p.project_id)
    if dup:
        raise HTTPException(409,f'Ya existe una persona llamada "{name}" en este proyecto.')
    x=Person(name=name,project_id=p.project_id)
    db.add(x)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409,'Ya existe una persona con ese nombre.')
    db.refresh(x)
    return obj(x)

@router.patch('/people/{pid}')
def rename_person(pid:int,p:PersonPatch,db:Session=Depends(get_db),
                  user:User=Depends(check_csrf)):
    x=owned_person(pid,user,db)
    name=p.name.strip()
    if not name:
        raise HTTPException(400,'El nombre de la persona no puede estar vacío.')
    dup=db.scalar(select(Person).where(Person.name==name))
    if dup and dup.id!=pid:
        raise HTTPException(409,f'Ya existe otra persona llamada "{name}".')
    x.name=name
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409,'Ya existe una persona con ese nombre.')
    db.refresh(x)
    return obj(x)

def _composition_references_person(data,pid):
    """True when the person is visually represented inside a stored composition."""
    if not isinstance(data,dict):
        return False
    for element in data.get('elements',[]) or []:
        if not isinstance(element,dict):
            continue
        if element.get('type')=='person' and str(element.get('personId'))==str(pid):
            return True
        for slot in element.get('positions',[]) or []:
            if isinstance(slot,dict) and str(slot.get('personId'))==str(pid):
                return True
    return False

def _person_has_project_references(db:Session,pid:int,project_id:int):
    """Indica si una persona aun tiene datos vivos dentro del proyecto."""
    song_ids=select(Song.id).where(Song.project_id==project_id)
    if db.scalar(select(SongAssignment.id).where(
        SongAssignment.person_id==pid,
        SongAssignment.song_id.in_(song_ids)).limit(1)) is not None:
        return True
    for composition in db.scalars(select(Composition).where(
            Composition.project_id==project_id)).all():
        if _composition_references_person(composition.data,pid):
            return True
    return False

def _strip_person_from_composition(data,pid):
    """Drop the visual representation of a person from composition data. Idempotent."""
    if not isinstance(data,dict) or not isinstance(data.get('elements'),list):
        return data,False,0
    removed_people=0
    freed_slots=0
    kept=[]
    for element in data['elements']:
        if isinstance(element,dict) and element.get('type')=='person' and str(element.get('personId'))==str(pid):
            removed_people+=1
            continue
        if isinstance(element,dict) and isinstance(element.get('positions'),list):
            slots=[]
            for slot in element['positions']:
                if isinstance(slot,dict) and slot.get('personId') is not None and str(slot.get('personId'))==str(pid):
                    slots.append({**slot,'personId':None})
                    freed_slots+=1
                else:
                    slots.append(slot)
            kept.append({**element,'positions':slots})
            continue
        kept.append(element)
    if not removed_people and not freed_slots:
        return data,False,0
    return {**data,'elements':kept},True,freed_slots

@router.delete('/people/{pid}')
def delete_person(pid:int,project_id:int|None=None,scope:str='composition',
                 db:Session=Depends(get_db),user:User=Depends(check_csrf)):
    # 7C: el borrado de una persona debe limitarse SIEMPRE al ambito del
    # usuario. Sin esto, bastaba con conocer un person_id para tocar el
    # catalogo compartido o los proyectos ajenos.
    owned_person(pid,user,db)
    if project_id is not None:
        owned_project(project_id,user,db)
    """
    Removal of a person is ALWAYS explicitly scoped. The schema has no direct
    person<->project table: project membership is expressed by the ``SongAssignment``
    rows of the project's songs, and the visual representation lives in
    ``Composition.data``.

    * ``project_id`` omitted -> catalogue deletion. Guarded with 409 whenever the
      person has assignments or is referenced by a saved composition, so a secondary
      path can never destroy historical data.
    * ``project_id`` + ``scope="composition"`` (default) -> only the visual
      representation is removed from the project's stored compositions. The
      ``people`` row and EVERY ``SongAssignment`` are preserved.
    * ``project_id`` + ``scope="project"`` -> additionally deletes the
      ``SongAssignment`` rows of that person inside the songs of this project (this is
      the only persistent person<->project link available). The ``people`` row and all
      other projects' assignments are preserved.
    """
    x=db.get(Person,pid)
    if not x:
        raise HTTPException(404,'Persona no encontrada')

    if project_id is None:
        if scope not in ('composition','catalog'):
            raise HTTPException(400,"Sin project_id el único ámbito válido es 'catalog'.")
        if db.scalar(select(SongAssignment.id).where(SongAssignment.person_id==pid).limit(1)) is not None:
            raise HTTPException(409,'La persona participa en canciones. Retírala primero del proyecto o de la composición; el catálogo no se borra.')
        for composition in db.scalars(select(Composition)).all():
            if _composition_references_person(composition.data,pid):
                raise HTTPException(409,'La persona está referenciada en composiciones guardadas. Quítala primero de la composición.')
        db.delete(x)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(409,'La persona tiene referencias y no puede eliminarse.')
        return {'deleted':True,'scope':'catalog','id':pid,'assignments_removed':0,'compositions_updated':0}

    p=db.get(Project,project_id)
    if not p:
        raise HTTPException(404,f'El proyecto {project_id} no existe.')
    if scope not in ('composition','project'):
        raise HTTPException(400,f"Ámbito '{scope}' no válido con project_id. Usa 'composition' o 'project'.")

    assignments_removed=0
    if scope=='project':
        project_song_ids=[s.id for s in p.songs]
        if project_song_ids:
            assignments=db.scalars(select(SongAssignment).where(SongAssignment.person_id==pid,SongAssignment.song_id.in_(project_song_ids))).all()
            assignments_removed=len(assignments)
            for a in assignments:
                db.delete(a)
        # Las filas creadas dentro del proyecto no se destruyen: se desactivan
        # para que el mismo nombre/id pueda reactivarse en un alta posterior.
        # Una persona global puede seguir siendo usada por otros proyectos.
        if x.project_id==project_id:
            x.active=False

    compositions_updated=0
    freed_slots=0
    for composition in p.compositions:
        new_data,changed,freed=_strip_person_from_composition(composition.data,pid)
        if changed:
            composition.data=new_data
            compositions_updated+=1
            freed_slots+=freed
    db.commit()
    return {'deleted':False,'scope':scope,'id':pid,'project_id':project_id,
            'assignments_removed':assignments_removed,'compositions_updated':compositions_updated,
            'freed_slots':freed_slots}

@router.get('/positions')
def positions(db:Session=Depends(get_db),user:User=Depends(require_user)):
    # Catalogo musical global de referencia: solo lectura, requiere sesion.
    return [obj(x) for x in db.scalars(select(Position).order_by(Position.name)).all()]

DEFAULT_TEMPLATES=[
 {'name':'Marimba tenor','description':'3 puestos: 1 tenor y 2 segundas','positions':['Tenor','Segunda','Segunda']},
 {'name':'Marimba grande','description':'4 puestos: 1 bajo, 1 centro y 2 primeras','positions':['Primera','Primera','Centro','Bajo']},
 {'name':'Marimbito','description':'2 puestos: 2 primeras','positions':['Primera','Primera']},
]

@router.get('/marimba-templates')
def templates(db:Session=Depends(get_db),user:User=Depends(require_user)):
    if not db.scalars(select(MarimbaTemplate)).first():
        for t in DEFAULT_TEMPLATES: db.add(MarimbaTemplate(**t))
        db.commit()

    return [obj(x) for x in db.scalars(select(MarimbaTemplate).order_by(MarimbaTemplate.id)).all()]

@router.post('/marimba-templates')
def create_template(p:MarimbaTemplateIn,db:Session=Depends(get_db),admin:User=Depends(check_admin)):
    # 7C: las plantillas son catalogo GLOBAL compartido por todos los
    # usuarios. Se puede leer con sesion, pero modificarlas es una decision
    # global: solo un administrador. Asi ningun usuario cambia las marimbas
    # que ve el resto.
    x=MarimbaTemplate(**p.model_dump())

    db.add(x)
    db.commit()
    db.refresh(x)
    
    return obj(x)

@router.patch('/marimba-templates/{tid}')
def update_template(tid:int,p:MarimbaTemplatePatch,db:Session=Depends(get_db),
                   admin:User=Depends(check_admin)):
    x=db.get(MarimbaTemplate,tid)
    if not x:
        raise HTTPException(404,'Plantilla no encontrada')

    if p.name is not None:
        name=p.name.strip()

        if not name:
            raise HTTPException(400,'El nombre de la plantilla no puede estar vacío.')

        dup=db.scalar(select(MarimbaTemplate).where(MarimbaTemplate.name==name,MarimbaTemplate.id!=tid))

        if dup:
            raise HTTPException(409,f'Ya existe una plantilla llamada "{name}".')

        x.name=name

    if p.description is not None:
        x.description=p.description.strip() or None

    if p.positions is not None:
        positions=[str(t).strip() for t in p.positions if str(t).strip()]

        if not positions:
            raise HTTPException(400,'La plantilla debe tener al menos un puesto.')

        x.positions=positions

    db.commit()
    db.refresh(x)

    return obj(x)

@router.delete('/marimba-templates/{tid}')
def delete_template(tid:int,db:Session=Depends(get_db),admin:User=Depends(check_admin)):
    """Elimina una plantilla global. Solo afecta propuestas futuras: las
    marimbas ya guardadas en composiciones son copias independientes."""
    x=db.get(MarimbaTemplate,tid)

    if not x:
        raise HTTPException(404,'Plantilla no encontrada')

    name=x.name
    db.delete(x)
    db.commit()

    return {'deleted':True,'id':tid,'name':name}

@router.get('/compositions/{cid}')
def composition(cid:int,db:Session=Depends(get_db),user:User=Depends(check_csrf)):
    # Aislamiento 7C: recurso ajeno -> 404.
    readable_composition(cid,user,db)
    c=db.get(Composition,cid)

    if not c: 
        raise HTTPException(404,'Composición no encontrada')

    return obj(c)

def _validate_song_for_project(db:Session,project_id:int,song_id:int|None)->None:
    if song_id is None:
        return

    s=db.get(Song,song_id)

    if not s:
        raise HTTPException(404,f'La canción {song_id} no existe.')

    if s.project_id!=project_id:
        raise HTTPException(400,'La canción pertenece a otro proyecto.')

@router.post('/compositions')
def create_composition(p:CompositionIn,db:Session=Depends(get_db),
                       user:User=Depends(check_csrf)):
    # 7C: la composicion nace siempre dentro de un proyecto propio.
    owned_project(p.project_id,user,db)

    _validate_song_for_project(db,p.project_id,p.song_id)
    x=Composition(**p.model_dump())

    db.add(x)
    db.commit()
    db.refresh(x)
    # 7D: auditoria de la accion persistente.
    record_audit(db,user,p.project_id,'COMPOSITION_CREATED','composition',x.id)

    return obj(x)

@router.put('/compositions/{cid}')
def update_composition(cid:int,p:CompositionIn,db:Session=Depends(get_db),user:User=Depends(check_csrf)):
    # Aislamiento 7C: recurso ajeno -> 404.
    owned_composition(cid,user,db)
    x=db.get(Composition,cid)

    if not x: 
        raise HTTPException(404,'Composición no encontrada')
        
    _validate_song_for_project(db,x.project_id,p.song_id)

    x.name=p.name
    x.song_id=p.song_id
    x.width=p.width
    x.height=p.height
    x.data=p.data

    db.commit()
    db.refresh(x)

    # 7F: no se guarda `p.data`: una composicion puede ser enorme y para auditar
    # la operacion basta con saber que se toco.
    record_audit(db,user,x.project_id,'COMPOSITION_UPDATED','composition',cid,
                 {'name':x.name,'song_id':x.song_id})

    return obj(x)

@router.patch('/compositions/{cid}')
def rename_composition(cid:int,p:CompositionPatch,db:Session=Depends(get_db),user:User=Depends(check_csrf)):
    # Aislamiento 7C: recurso ajeno -> 404.
    owned_composition(cid,user,db)
    x=db.get(Composition,cid)

    if not x: 
        raise HTTPException(404,'Composición no encontrada')

    if p.song_id is not None:
        _validate_song_for_project(db,x.project_id,p.song_id)
        x.song_id=p.song_id

    if p.name is not None:
        name=p.name.strip()
        if not name:
            raise HTTPException(400,'El nombre de la composición no puede estar vacío.')
        x.name=name

    db.commit()
    db.refresh(x)

    return obj(x)

@router.delete('/compositions/{cid}')
def delete_composition(cid:int,db:Session=Depends(get_db),user:User=Depends(check_csrf)):
    # Aislamiento 7C: recurso ajeno -> 404.
    owned_composition(cid,user,db)
    x=db.get(Composition,cid)

    if not x: 
        raise HTTPException(404,'Composición no encontrada')

    pid=x.project_id
    sid=x.song_id
    nombre=x.name
    db.delete(x)
    db.commit()
    # 7F: el proyecto sigue existiendo, asi que el evento puede colgar
    # de el y aparecer en su historial.
    record_audit(db,user,pid,'COMPOSITION_DELETED','composition',cid,
                 {'name':nombre,'song_id':sid})

    return {'deleted':True,'id':cid,'project_id':pid,'song_id':sid}

# --- Fase 9C: historial persistente de versiones de una composicion ---------
#
# NO es el `history`/`future` del store del navegador (que se pierde al
# recargar). Aqui una version es un SNAPSHOT INMUTABLE guardado en la base.
#
# Reglas de seguridad, en todas las rutas:
#   - se reutiliza `readable_composition` / `owned_composition`, que ya resuelven
#     owner/editor/reader y devuelven 404 (no 403) ante un recurso ajeno;
#   - una version que NO pertenece a la composicion de la URL se trata igual
#     que si no existiera: 404. Asi no se revela que ese id existe en otro sitio.


def _snapshot_of(c:Composition)->dict:
    """Estado completo y autocontenido de una composicion."""
    return {'name':c.name,'width':c.width,'height':c.height,'data':c.data}


def _snapshot_valido(s)->bool:
    """Una version solo se restaura si su snapshot tiene estructura utilizable."""
    if not isinstance(s,dict) or not isinstance(s.get('data'),dict):
        return False
    w,h=s.get('width'),s.get('height')
    if not isinstance(w,int) or not isinstance(h,int) or w<=0 or h<=0:
        return False
    return isinstance(s.get('name'),str) and bool(s['name'].strip())


def _version_out(v:CompositionVersion)->dict:
    """Representacion publica. Incluye el snapshot: sin el no se podria restaurar."""
    return {'id':v.id,'composition_id':v.composition_id,
            'version_number':v.version_number,
            'created_at':v.created_at.isoformat() if v.created_at else None,
            'created_by':{'id':v.created_by_user_id,
                          'name':v.author.name if v.author else None},
            'snapshot':v.snapshot}


def _version_summary(v:CompositionVersion)->dict:
    """Listado: NO incluye el snapshot, que puede ser muy grande."""
    return {'id':v.id,'composition_id':v.composition_id,
            'version_number':v.version_number,
            'created_at':v.created_at.isoformat() if v.created_at else None,
            'created_by':{'id':v.created_by_user_id,
                          'name':v.author.name if v.author else None}}


def _next_version_number(db:Session,cid:int)->int:
    mayor=(db.query(func.max(CompositionVersion.version_number))
           .filter(CompositionVersion.composition_id==cid).scalar())
    return (mayor or 0)+1


def _append_version(db:Session,user:User,c:Composition,
                    snapshot:dict)->CompositionVersion:
    """Anade una version. Reintenta si otra peticion gasto el mismo numero.

    El `UNIQUE (composition_id, version_number)` es la garantia real: dos
    peticiones simultaneas pueden calcular el mismo `max+1`, pero solo una
    sobrevive al INSERT. La otra reintenta con el numero siguiente.
    """
    for intento in range(5):
        v=CompositionVersion(composition_id=c.id,
                             version_number=_next_version_number(db,c.id),
                             snapshot=snapshot,created_by_user_id=user.id)
        db.add(v)
        try:
            db.commit()
            db.refresh(v)
            return v
        except IntegrityError:
            db.rollback()
            if intento==4:
                raise
    raise HTTPException(409,'No se pudo asignar un número de versión libre.')


def _version_de(cid:int,vid:int,db:Session)->CompositionVersion:
    """Version que pertenece a ESA composicion, o 404 indistinguible."""
    v=(db.query(CompositionVersion)
       .filter(CompositionVersion.id==vid,
               CompositionVersion.composition_id==cid).first())
    if not v:
        raise HTTPException(404,'La versión no existe.')
    return v


@router.get('/compositions/{cid}/versions')
def list_versions(cid:int,db:Session=Depends(get_db),user:User=Depends(require_user)):
    readable_composition(cid,user,db)
    vs=(db.query(CompositionVersion)
       .filter(CompositionVersion.composition_id==cid)
       .order_by(CompositionVersion.version_number.desc()).all())
    return {'versions':[_version_summary(v) for v in vs]}


@router.post('/compositions/{cid}/versions')
def create_version(cid:int,db:Session=Depends(get_db),user:User=Depends(check_csrf)):
    """Guarda el estado ACTUAL de la composicion como version inmutable."""
    owned_composition(cid,user,db)
    c=db.get(Composition,cid)
    if not c:
        raise HTTPException(404,'Composición no encontrada')
    v=_append_version(db,user,c,_snapshot_of(c))
    record_audit(db,user,c.project_id,'COMPOSITION_VERSION_CREATED',
                 'composition_version',v.id,{'composition_id':cid,
                                            'version_number':v.version_number})
    return _version_out(v)


@router.get('/compositions/{cid}/versions/{vid}')
def get_version(cid:int,vid:int,db:Session=Depends(get_db),
                user:User=Depends(require_user)):
    readable_composition(cid,user,db)
    return _version_out(_version_de(cid,vid,db))


@router.post('/compositions/{cid}/versions/{vid}/restore')
def restore_version(cid:int,vid:int,db:Session=Depends(get_db),
                    user:User=Depends(check_csrf)):
    """Restaura una version. NUNCA borra ni modifica las existentes.

    Antes de sobrescribir el estado actual se guarda una version nueva con el
    estado previo. Asi el historial es de solo-anadir: restaurar la version 1
    sobre un estado que solo existia en memoria deja ese estado a salvo y
    recuperable. Las versiones antiguas no se tocan en ningun caso.
    """
    owned_composition(cid,user,db)
    c=db.get(Composition,cid)
    if not c:
        raise HTTPException(404,'Composición no encontrada')
    v=_version_de(cid,vid,db)
    if not _snapshot_valido(v.snapshot):
        raise HTTPException(422,'La versión guardada no tiene un estado utilizable.')

    previo=_append_version(db,user,c,_snapshot_of(c))
    s=v.snapshot
    c.name=s['name']
    c.width=s['width']
    c.height=s['height']
    c.data=s['data']
    db.commit()
    db.refresh(c)
    record_audit(db,user,c.project_id,'COMPOSITION_VERSION_RESTORED',
                 'composition_version',v.id,
                 {'composition_id':cid,'restored':v.version_number,
                  'previous_state_saved_as':previo.version_number})
    return {'composition':obj(c),'restored_version':v.version_number,
            'previous_state_saved_as':previo.version_number}

@router.get('/projects/{pid}/songs')
def list_songs(pid:int,db:Session=Depends(get_db),user:User=Depends(require_user)):
    p=readable_project(pid,user,db)

    out=[]

    for s in sorted(p.songs,key=lambda x:(x.order_index,x.id)):
        comps=[c for c in p.compositions if c.song_id==s.id]
        out.append({'id':s.id,'name':s.name,'order_index':s.order_index,
            'assignment_count':len(s.assignments),
            'composition_id':comps[0].id if comps else None,
            'composition_name':comps[0].name if comps else None})

    return out

@router.post('/projects/{pid}/songs')
def create_song(pid:int,p:SongIn,db:Session=Depends(get_db),user:User=Depends(check_csrf)):
    project=owned_project(pid,user,db)

    name=p.name.strip()

    if not name:
        raise HTTPException(400,'El nombre de la canción no puede estar vacío.')

    if any(s.name.strip().lower()==name.lower() for s in project.songs):
        raise HTTPException(409,f'Ya existe una canción llamada "{name}" en este proyecto.')

    s=Song(project_id=pid,name=name,order_index=len(project.songs))
    db.add(s)
    db.commit()
    db.refresh(s)
    # 7D: auditoria de la accion persistente.
    record_audit(db,user,pid,'SONG_CREATED','song',s.id)

    return {'id':s.id,'name':s.name,'order_index':s.order_index}

def _get_song_or_404(song_id:int,db:Session)->Song:
    s=db.get(Song,song_id)

    if not s:
        raise HTTPException(404,'Canción no encontrada')

    return s

@router.get('/songs/{song_id}')
def get_song(song_id:int,db:Session=Depends(get_db),user:User=Depends(require_user)):
    # Aislamiento 7C: recurso ajeno -> 404.
    readable_song(song_id,user,db)
    s=_get_song_or_404(song_id,db)
    p=db.get(Project,s.project_id)
    comps=[c for c in p.compositions if c.song_id==s.id] if p else []

    return {'id':s.id,'project_id':s.project_id,'name':s.name,'order_index':s.order_index,
        'assignments':[{'id':a.id,'person_id':a.person_id,'person':a.person.name,'position_id':a.position_id,'position':a.position.name,'mark':a.mark} for a in s.assignments],
        'compositions':[{'id':c.id,'name':c.name,'song_id':c.song_id,'width':c.width,'height':c.height,'data':c.data,'created_at':c.created_at,'updated_at':c.updated_at} for c in comps]}

@router.patch('/songs/{song_id}')
def rename_song(song_id:int,p:SongPatch,db:Session=Depends(get_db),user:User=Depends(require_user)):
    # Aislamiento 7C: recurso ajeno -> 404.
    owned_song(song_id,user,db)
    s=_get_song_or_404(song_id,db)
    name=p.name.strip()

    if not name:
        raise HTTPException(400,'El nombre de la canción no puede estar vacío.')

    project=db.get(Project,s.project_id)

    if any(o.id!=s.id and o.name.strip().lower()==name.lower() for o in project.songs):
        raise HTTPException(409,f'Ya existe otra canción llamada "{name}" en este proyecto.')

    s.name=name
    db.commit()
    db.refresh(s)
    # 7D: auditoria de la accion persistente.
    record_audit(db,user,s.project_id,'SONG_UPDATED','song',s.id)

    return {'id':s.id,'name':s.name,'order_index':s.order_index}

@router.delete('/songs/{song_id}')
def delete_song(song_id:int,db:Session=Depends(get_db),user:User=Depends(require_user)):
    # Aislamiento 7C: recurso ajeno -> 404.
    owned_song(song_id,user,db)
    s=_get_song_or_404(song_id,db)
    pid=s.project_id
    nombre_song=s.name
    db.delete(s)
    db.commit()

    # 7F: al borrar una cancion caen tambien sus composiciones (cascade).
    record_audit(db,user,pid,'SONG_DELETED','song',song_id,{'name':nombre_song})

    return {'deleted':True,'id':song_id,'project_id':pid}

@router.post('/compositions/{cid}/duplicate')
def duplicate_composition(cid:int,p:CompositionDuplicateIn,db:Session=Depends(get_db),user:User=Depends(check_csrf)):
    # Aislamiento 7C: recurso ajeno -> 404.
    owned_composition(cid,user,db)
    src=db.get(Composition,cid)

    if not src:
        raise HTTPException(404,'Composición no encontrada')

    target_song_id=p.song_id if p.song_id is not None else src.song_id

    if target_song_id is not None:
        ts=db.get(Song,target_song_id)

        if not ts:
            raise HTTPException(404,f'La canción destino {target_song_id} no existe.')

        if ts.project_id!=src.project_id:
            raise HTTPException(400,'La canción destino pertenece a otro proyecto; no se puede asociar la copia.')

    import copy as _copy
    copy=Composition(
        project_id=src.project_id,
        song_id=target_song_id,
        name=(p.name or '').strip() or f'{src.name} (copia)',
        width=src.width,
        height=src.height,
        data=_copy.deepcopy(src.data),
    )
    db.add(copy)
    db.commit()
    db.refresh(copy)

    return obj(copy)

@router.post('/suggestions')
def suggestions(payload:dict,user:User=Depends(require_user)):
    # Sugerencia pura (no lee ni escribe datos de la base): basta con sesion.
    return suggest(payload)

def propose_on_composition(song_id, db, weights=None):
    """
    Fase 7A: propone personas para los puestos de la composicion EXISTENTE.

    Es la operacion clave del flujo unico: NO crea marimbas ni construye un
    plan nuevo. Toma los puestos reales que el usuario ya coloco y devuelve que
    persona ocuparia cada puesto, sin tocar la composicion guardada.

    `weights` ajusta las prioridades de forma opcional. La compatibilidad
    musical sigue siendo una RESTRICCION del optimizador, nunca un coste
    negociable.
    """
    song = db.get(Song, song_id)
    if not song:
        raise HTTPException(404, 'La cancion %d no existe.' % song_id)
    comp = get_capacity_composition(song, db)
    if comp is None:
        raise HTTPException(400, 'La cancion no tiene una composicion con '
                                  'marimbas donde proponer.')

    slots = slots_from_composition(comp)
    if not slots:
        raise HTTPException(400, 'La composicion no tiene marimbas. Coloca al '
                                  'menos una antes de pedir una propuesta.')

    # Personas elegibles: las de esta cancion, deduplicadas por id, con su
    # puesto musical canonico.
    seen, avail, reqs = set(), [], {}
    for a in sorted(song.assignments, key=lambda x: x.id):
        if a.person_id in seen:
            continue
        seen.add(a.person_id)
        can = canonical(a.position.name)
        avail.append({'person_id': a.person_id, 'name': a.person.name,
                      '_wanted_type': can})
        reqs[can] = reqs.get(can, 0) + 1

    avail.sort(key=lambda p: (p['name'], p['person_id']))
    prev = get_previous_song(song, db)
    pmap = get_previous_assignment_map(prev, db)
    hist = get_person_history(song.project.id, db, exclude_song_id=song_id,
                              before_song=song)
    hmap = {h['person_id']: h for h in hist}

    old = dict(COSTOS)
    if weights:
        unknown = set(weights) - set(COSTOS)
        if unknown:
            raise HTTPException(400, 'Pesos desconocidos: %s'
                                % ', '.join(sorted(unknown)))
        COSTOS.update(weights)
    try:
        result = optimize_proposals(reqs, avail, slots, pmap, hmap)
    finally:
        # Los pesos son de ESTA llamada: no se filtran al global.
        COSTOS.clear()
        COSTOS.update(old)

    por_slot = {a['marimba_position_id']: a for a in result['assignments']}
    cambios = []
    for s in slots:
        a = por_slot.get(s['slot_id'])
        cambios.append({
            'slot_id': s['slot_id'],
            'marimba_id': s['marimba_id'],
            'marimba_name': s['marimba_name'],
            'position_type': s['position_type'],
            'slot_index': s['slot_index'],
            'occupied_by': s['occupied_by'],
            'proposed_person_id': a['person_id'] if a else None,
            'proposed_name': a['name'] if a else None,
            # `changed` compara con lo que YA hay en el lienzo.
            'changed': bool(a and s['occupied_by'] != a['person_id']),
        })

    asignados = {a['person_id'] for a in result['assignments']}
    sin_asignar = [{'person_id': p['person_id'], 'name': p['name'],
                    'position_type': p['_wanted_type']}
                   for p in avail if p['person_id'] not in asignados]

    cap = {}
    for s in slots:
        cap[s['position_type']] = cap.get(s['position_type'], 0) + 1

    return {'song_id': song_id, 'composition_id': comp.id,
            'slots': cambios,
            'assigned': result['assignments'],
            'unassigned': sin_asignar,
            'changed': sum(1 for x in cambios if x['changed']),
            'unchanged': sum(1 for x in cambios if not x['changed']),
            'total_cost': result['total_cost'],
            'warnings': result['warnings'],
            'unfulfilled_requirements': result['unfulfilled_requirements'],
            'capacity': dict(sorted(cap.items()))}


@router.post('/songs/{song_id}/propose-on-composition')
def propose_on_composition_endpoint(song_id: int, db: Session = Depends(get_db),
                                    user:User=Depends(check_csrf)):
    # 7C: la cancion debe pertenecer a un proyecto del usuario. Sin esto,
    # `propose_on_composition` leeria datos de otro usuario por un ID adivinado.
    owned_song(song_id,user,db)
    return propose_on_composition(song_id, db)


@router.post('/compositions/{cid}/apply-assignments')
def apply_composition_assignments(cid: int, payload: dict,
                                  db: Session = Depends(get_db),user:User=Depends(check_csrf)):
    # Aislamiento 7C: recurso ajeno -> 404.
    owned_composition(cid,user,db)
    """
    Acepta una propuesta sobre una composicion existente.

    Solo cambia el `personId` de los puestos fisicos: NO crea, NO elimina y NO
    mueve marimbas. Guarda una composicion NUEVA, igual que las demas rutas de
    aplicacion, de modo que la anterior queda intacta y el usuario puede
    volver atras.
    """
    comp = db.get(Composition, cid)
    if not comp:
        raise HTTPException(404, 'La composicion no existe.')
    rows = payload.get('assignments')
    if not isinstance(rows, list):
        raise HTTPException(400, 'Se esperaba una lista de asignaciones.')

    data = dict(comp.data or {})
    elements = [dict(e) if isinstance(e, dict) else e
                for e in (data.get('elements') or [])]

    # Indice de puestos (marimba, id) -> elemento, por id estable.
    slots = {}
    for e in elements:
        if isinstance(e, dict) and e.get('type') == 'marimba':
            for p in (e.get('positions') or []):
                if isinstance(p, dict) and p.get('id'):
                    slots[p['id']] = (e, p)

    parsed = []
    for row in rows:
        sid = row.get('slot_id')
        if sid not in slots:
            raise HTTPException(400, 'El puesto %s no existe en esta '
                                      'composicion.' % sid)
        pid = row.get('person_id')
        if pid is not None and not db.get(Person, pid):
            raise HTTPException(404, 'La persona %s no existe.' % pid)
        parsed.append((sid, pid))

    # Validacion COMPLETA antes de tocar nada: si algo falla, no se aplica nada.
    vistos = set()
    for sid, pid in parsed:
        if pid is None:
            continue
        if pid in vistos:
            raise HTTPException(400, 'La persona %d se asigna dos veces.' % pid)
        vistos.add(pid)
        if not slots[sid][1].get('type'):
            raise HTTPException(400, 'El puesto %s no tiene tipo musical.' % sid)

    # Aplicacion: unicamente el personId de los puestos indicados.
    destino = {}
    for sid, pid in parsed:
        slots[sid][1]['personId'] = pid
        if pid is not None:
            destino[pid] = (slots[sid][0]['id'], sid)

    # Los elementos persona siguen a la propuesta conservando sus ids; las que
    # se quedan sin puesto se retiran del lienzo (no se borra su historial).
    for e in elements:
        if not (isinstance(e, dict) and e.get('type') == 'person'):
            continue
        pid = e.get('personId')
        d = destino.get(pid)
        if d:
            e['marimbaId'] = d[0]
            e['marimbaPositionId'] = d[1]

    # Las personas que siguen en la propuesta conservan sus ids y se mueven a su
    # puesto. Las que se quedan sin puesto salen del lienzo (su historial en la
    # base no se toca).
    final = []
    for e in elements:
        if isinstance(e, dict) and e.get('type') == 'person':
            if e.get('personId') in destino:
                final.append(e)
        else:
            final.append(e)

    nueva = Composition(project_id=comp.project_id, song_id=comp.song_id,
                        name=payload.get('name') or comp.name,
                        width=comp.width, height=comp.height,
                        data={'elements': final})
    db.add(nueva)
    db.commit()
    db.refresh(nueva)
    # 7D: auditoria de la accion persistente.
    record_audit(db,user,nueva.project_id,'ASSIGNMENTS_APPLIED','composition',cid)
    return {c.name: getattr(nueva, c.name) for c in nueva.__table__.columns}


@router.get('/songs/{song_id}/history')
def song_history(song_id:int, db:Session=Depends(get_db),user:User=Depends(require_user)):
    # Aislamiento 7C: recurso ajeno -> 404.
    readable_song(song_id,user,db)
    song=_get_song_or_404(song_id,db)
    return get_person_history(song.project_id, db, exclude_song_id=song_id)

@router.get('/songs/{song_id}/requirements')
def song_requirements(song_id:int, composition_id:int|None=None, db:Session=Depends(get_db),user:User=Depends(require_user)):
    # Aislamiento 7C: recurso ajeno -> 404.
    readable_song(song_id,user,db)
    return get_song_requirements_report(song_id, db, composition_id=composition_id)

@router.get('/songs/{song_id}/suggestions')
def song_suggestions(song_id:int, db:Session=Depends(get_db),user:User=Depends(require_user)):
    # Aislamiento 7C: recurso ajeno -> 404.
    readable_song(song_id,user,db)
    return get_suggestions_for_song(song_id, db)

@router.get('/songs/{song_id}/distribution-suggestion')
def distribution_suggestion(song_id:int, db:Session=Depends(get_db),user:User=Depends(require_user)):
    # Aislamiento 7C: recurso ajeno -> 404.
    readable_song(song_id,user,db)
    return get_distribution_for_song(song_id, db)

@router.post('/songs/{song_id}/distribution/apply')
def apply_distribution(song_id:int, payload:ApplySuggestions, db:Session=Depends(get_db),
                      user:User=Depends(check_csrf)):
    # 7C: sin esta comprobacion, un usuario podria escribir una composicion
    # dentro del proyecto de otro sencillamente sabiendo su song_id.
    owned_song(song_id,user,db)
    comp=create_distribution_composition(song_id, payload.proposals, payload.name, db)
    return comp

@router.post('/songs/{song_id}/suggestions/apply')
def apply_suggestions(song_id:int, payload:ApplySuggestions, db:Session=Depends(get_db),
                      user:User=Depends(check_csrf)):
    owned_song(song_id,user,db)
    comp=create_composition_from_proposals(song_id, payload.proposals, payload.name, db, marimba_plan=payload.marimba_plan)
    return comp
