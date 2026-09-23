import unicodedata,re
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from app.db.session import get_db
from app.models import Project,Person,Position,Song,SongAssignment,MarimbaTemplate,Composition
from app.schemas.schemas import ProjectIn,CompositionIn,CompositionPatch,MarimbaTemplateIn,ImportConfirm,SongIn,SongPatch,CompositionDuplicateIn,ApplySuggestions,PersonIn,PersonPatch
from app.services.excel_parser import parse_workbook,match_people,detect_duplicates
from app.services.suggestions import suggest, get_suggestions_for_song
from app.services.suggestions.distribution import get_distribution_for_song
from app.services.suggestions.distributor import create_composition_from_proposals
from app.services.suggestions.engine_e import create_distribution_composition
from app.services.suggestions.history import get_person_history
from app.services.suggestions.requirements import get_song_requirements_report

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
def confirm(payload:ImportConfirm,db:Session=Depends(get_db)):
    if payload.project_id is not None:
        project=db.get(Project,payload.project_id)

        if not project:
            raise HTTPException(404,f'El proyecto {payload.project_id} no existe.')

        if payload.source_filename and not project.source_filename:
            project.source_filename=payload.source_filename
    else:
        project=Project(name=payload.project_name,description=payload.description,source_filename=payload.source_filename)
        db.add(project)

    db.flush()
    person_by_norm={}

    def n(s): 
        s=re.sub(r'[^a-z0-9 ]','',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower())
        return re.sub(r'\s+',' ',s).strip()

    existing_people={n(p.name):p for p in db.scalars(select(Person)).all()}
    existing_positions={n(p.name):p for p in db.scalars(select(Position)).all()}

    for sh in payload.sheets:
        for song_data in sh.get('songs',[]):
            song=Song(project_id=project.id,name=song_data['name'],order_index=len(project.songs))
            db.add(song) 
            db.flush()

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

    return {'id':project.id,'name':project.name}

@router.get('/projects')
def projects(db:Session=Depends(get_db)): 
    return [obj(x) for x in db.scalars(select(Project).order_by(Project.created_at.desc())).all()]

@router.post('/projects')
def create_project(p:ProjectIn,db:Session=Depends(get_db)):
    x=Project(**p.model_dump()) 
    db.add(x)
    db.commit()
    db.refresh(x)

    return obj(x)

@router.get('/projects/{pid}')
def project(pid:int,db:Session=Depends(get_db)):
    p=db.get(Project,pid)

    if not p:
        raise HTTPException(404,'Proyecto no encontrado')
    
    songs=[]
    for s in p.songs:
        songs.append({'id':s.id,'name':s.name,'assignments':[{'id':a.id,'person_id':a.person_id,'person':a.person.name,'position_id':a.position_id,'position':a.position.name,'mark':a.mark} for a in s.assignments]})

    return {'project':obj(p),'songs':songs,'compositions':[{'id':c.id,'name':c.name,'song_id':c.song_id,'width':c.width,'height':c.height,'data':c.data,'created_at':c.created_at,'updated_at':c.updated_at} for c in p.compositions]}

@router.get('/people')
def people(db:Session=Depends(get_db)): 
    return [obj(x) for x in db.scalars(select(Person).order_by(Person.name)).all()]

@router.post('/people')
def create_person(p:PersonIn,db:Session=Depends(get_db)):
    name=p.name.strip()
    if not name:
        raise HTTPException(400,'El nombre de la persona no puede estar vacío.')
    if db.scalar(select(Person).where(Person.name==name)):
        raise HTTPException(409,f'Ya existe una persona llamada "{name}".')
    x=Person(name=name)
    db.add(x)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409,'Ya existe una persona con ese nombre.')
    db.refresh(x)
    return obj(x)

@router.patch('/people/{pid}')
def rename_person(pid:int,p:PersonPatch,db:Session=Depends(get_db)):
    x=db.get(Person,pid)
    if not x:
        raise HTTPException(404,'Persona no encontrada')
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

@router.delete('/people/{pid}')
def delete_person(pid:int,db:Session=Depends(get_db)):
    x=db.get(Person,pid)
    if not x:
        raise HTTPException(404,'Persona no encontrada')
    # Person is global. Never cascade a visual removal into song history.
    if db.scalar(select(SongAssignment.id).where(SongAssignment.person_id==pid).limit(1)) is not None:
        raise HTTPException(409,'La persona participa en canciones. Ret?rala de la composici?n sin borrar el cat?logo.')
    for composition in db.scalars(select(Composition)).all():
        data=composition.data if isinstance(composition.data,dict) else {}
        for element in data.get('elements',[]) or []:
            if not isinstance(element,dict):
                continue
            referenced=element.get('type')=='person' and str(element.get('personId'))==str(pid)
            referenced=referenced or any(isinstance(slot,dict) and str(slot.get('personId'))==str(pid)
                                        for slot in element.get('positions',[]) or [])
            if referenced:
                raise HTTPException(409,'La persona est? referenciada en composiciones guardadas.')
    db.delete(x)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409,'La persona tiene referencias y no puede eliminarse.')
    return {'deleted':True,'id':pid,'assignments_removed':0}

@router.get('/positions')
def positions(db:Session=Depends(get_db)): 
    return [obj(x) for x in db.scalars(select(Position).order_by(Position.name)).all()]

DEFAULT_TEMPLATES=[
 {'name':'Marimba tenor','description':'3 puestos: 1 tenor y 2 segundas','positions':['Tenor','Segunda','Segunda']},
 {'name':'Marimba grande','description':'4 puestos: 1 bajo, 1 centro y 2 primeras','positions':['Primera','Primera','Centro','Bajo']},
 {'name':'Marimbito','description':'2 puestos: 2 primeras','positions':['Primera','Primera']},
]

@router.get('/marimba-templates')
def templates(db:Session=Depends(get_db)):
    if not db.scalars(select(MarimbaTemplate)).first():
        for t in DEFAULT_TEMPLATES: db.add(MarimbaTemplate(**t))
        db.commit()

    return [obj(x) for x in db.scalars(select(MarimbaTemplate).order_by(MarimbaTemplate.id)).all()]

@router.post('/marimba-templates')
def create_template(p:MarimbaTemplateIn,db:Session=Depends(get_db)):
    x=MarimbaTemplate(**p.model_dump())

    db.add(x)
    db.commit()
    db.refresh(x)
    
    return obj(x)

@router.get('/compositions/{cid}')
def composition(cid:int,db:Session=Depends(get_db)):
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
def create_composition(p:CompositionIn,db:Session=Depends(get_db)):
    if not db.get(Project,p.project_id):
        raise HTTPException(404,f'El proyecto {p.project_id} no existe.')

    _validate_song_for_project(db,p.project_id,p.song_id)
    x=Composition(**p.model_dump())

    db.add(x)
    db.commit()
    db.refresh(x)

    return obj(x)

@router.put('/compositions/{cid}')
def update_composition(cid:int,p:CompositionIn,db:Session=Depends(get_db)):
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

    return obj(x)

@router.patch('/compositions/{cid}')
def rename_composition(cid:int,p:CompositionPatch,db:Session=Depends(get_db)):
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
def delete_composition(cid:int,db:Session=Depends(get_db)):
    x=db.get(Composition,cid)

    if not x: 
        raise HTTPException(404,'Composición no encontrada')

    pid=x.project_id
    sid=x.song_id
    db.delete(x)
    db.commit()

    return {'deleted':True,'id':cid,'project_id':pid,'song_id':sid}

@router.get('/projects/{pid}/songs')
def list_songs(pid:int,db:Session=Depends(get_db)):
    p=db.get(Project,pid)

    if not p:
        raise HTTPException(404,'Proyecto no encontrado')

    out=[]

    for s in sorted(p.songs,key=lambda x:(x.order_index,x.id)):
        comps=[c for c in p.compositions if c.song_id==s.id]
        out.append({'id':s.id,'name':s.name,'order_index':s.order_index,
            'assignment_count':len(s.assignments),
            'composition_id':comps[0].id if comps else None,
            'composition_name':comps[0].name if comps else None})

    return out

@router.post('/projects/{pid}/songs')
def create_song(pid:int,p:SongIn,db:Session=Depends(get_db)):
    project=db.get(Project,pid)

    if not project:
        raise HTTPException(404,'Proyecto no encontrado')

    name=p.name.strip()

    if not name:
        raise HTTPException(400,'El nombre de la canción no puede estar vacío.')

    if any(s.name.strip().lower()==name.lower() for s in project.songs):
        raise HTTPException(409,f'Ya existe una canción llamada "{name}" en este proyecto.')

    s=Song(project_id=pid,name=name,order_index=len(project.songs))
    db.add(s)
    db.commit()
    db.refresh(s)

    return {'id':s.id,'name':s.name,'order_index':s.order_index}

def _get_song_or_404(song_id:int,db:Session)->Song:
    s=db.get(Song,song_id)

    if not s:
        raise HTTPException(404,'Canción no encontrada')

    return s

@router.get('/songs/{song_id}')
def get_song(song_id:int,db:Session=Depends(get_db)):
    s=_get_song_or_404(song_id,db)
    p=db.get(Project,s.project_id)
    comps=[c for c in p.compositions if c.song_id==s.id] if p else []

    return {'id':s.id,'project_id':s.project_id,'name':s.name,'order_index':s.order_index,
        'assignments':[{'id':a.id,'person_id':a.person_id,'person':a.person.name,'position_id':a.position_id,'position':a.position.name,'mark':a.mark} for a in s.assignments],
        'compositions':[{'id':c.id,'name':c.name,'song_id':c.song_id,'width':c.width,'height':c.height,'data':c.data,'created_at':c.created_at,'updated_at':c.updated_at} for c in comps]}

@router.patch('/songs/{song_id}')
def rename_song(song_id:int,p:SongPatch,db:Session=Depends(get_db)):
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

    return {'id':s.id,'name':s.name,'order_index':s.order_index}

@router.delete('/songs/{song_id}')
def delete_song(song_id:int,db:Session=Depends(get_db)):
    s=_get_song_or_404(song_id,db)
    pid=s.project_id
    db.delete(s)
    db.commit()

    return {'deleted':True,'id':song_id,'project_id':pid}

@router.post('/compositions/{cid}/duplicate')
def duplicate_composition(cid:int,p:CompositionDuplicateIn,db:Session=Depends(get_db)):
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
def suggestions(payload:dict): 
    return suggest(payload)

@router.get('/songs/{song_id}/history')
def song_history(song_id:int, db:Session=Depends(get_db)):
    song=_get_song_or_404(song_id,db)
    return get_person_history(song.project_id, db, exclude_song_id=song_id)

@router.get('/songs/{song_id}/requirements')
def song_requirements(song_id:int, composition_id:int|None=None, db:Session=Depends(get_db)):
    return get_song_requirements_report(song_id, db, composition_id=composition_id)

@router.get('/songs/{song_id}/suggestions')
def song_suggestions(song_id:int, db:Session=Depends(get_db)):
    return get_suggestions_for_song(song_id, db)

@router.get('/songs/{song_id}/distribution-suggestion')
def distribution_suggestion(song_id:int, db:Session=Depends(get_db)):
    return get_distribution_for_song(song_id, db)

@router.post('/songs/{song_id}/distribution/apply')
def apply_distribution(song_id:int, payload:ApplySuggestions, db:Session=Depends(get_db)):
    song=_get_song_or_404(song_id,db)
    comp=create_distribution_composition(song_id, payload.proposals, payload.name, db)
    return comp

@router.post('/songs/{song_id}/suggestions/apply')
def apply_suggestions(song_id:int, payload:ApplySuggestions, db:Session=Depends(get_db)):
    song=_get_song_or_404(song_id,db)
    comp=create_composition_from_proposals(song_id, payload.proposals, payload.name, db)
    return comp