import unicodedata,re
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.db.session import get_db
from app.models import Project,Person,Position,Song,SongAssignment,MarimbaTemplate,Composition
from app.schemas.schemas import ProjectIn,CompositionIn,MarimbaTemplateIn,ImportConfirm
from app.services.excel_parser import parse_workbook,match_people
from app.services.suggestions import suggest

router=APIRouter()

def obj(x):
    return {c.name:getattr(x,c.name) for c in x.__table__.columns}

@router.get('/health')
def health(): 
    return {'status':'ok'}

@router.post('/imports/preview')
async def preview(file:UploadFile=File(...), db:Session=Depends(get_db)):
    if not file.filename.lower().endswith(('.xlsx','.xlsm')): 
        raise HTTPException(400,'Solo se admiten archivos .xlsx/.xlsm en esta versión.')
    
    raw=await file.read()

    if len(raw)>10*1024*1024: 
        raise HTTPException(413,'El archivo supera el límite de 10 MB.')
    
    parsed=parse_workbook(raw)
    existing=[p.name for p in db.scalars(select(Person)).all()]

    parsed['matches']=match_people(parsed['people'],existing)
    parsed['source_filename']=file.filename

    return parsed

@router.post('/imports/confirm')
def confirm(payload:ImportConfirm,db:Session=Depends(get_db)):
    project=Project(name=payload.project_name,description=payload.description,source_filename=payload.source_filename); 
    db.add(project) 
    db.flush()
    person_by_norm={}

    def n(s): 
        return re.sub(r'[^a-z0-9 ]','',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower()).strip()
    
    for sh in payload.sheets:
        for song_data in sh.get('songs',[]):
            song=Song(project_id=project.id,name=song_data['name'],order_index=len(project.songs))
            db.add(song) 
            db.flush()

            for a in song_data.get('assignments',[]):
                pn=a['person'].strip(); key=n(pn)
                person=person_by_norm.get(key)

                if not person:
                    person=db.scalar(select(Person).where(Person.name==pn))

                    if not person: 
                        person=Person(name=pn)
                        db.add(person)
                        db.flush()

                    person_by_norm[key]=person

                pos=db.scalar(select(Position).where(Position.name==a['position']))
                
                if not pos: 
                    pos=Position(name=a['position'])

                db.add(pos)
                db.flush()
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

    return {'project':obj(p),'songs':songs,'compositions':[{'id':c.id,'name':c.name,'song_id':c.song_id,'width':c.width,'height':c.height,'data':c.data} for c in p.compositions]}

@router.get('/people')
def people(db:Session=Depends(get_db)): 
    return [obj(x) for x in db.scalars(select(Person).order_by(Person.name)).all()]

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

@router.post('/compositions')
def create_composition(p:CompositionIn,db:Session=Depends(get_db)):
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
        
    x.name=p.name
    x.song_id=p.song_id
    x.width=p.width
    x.height=p.height
    x.data=p.data

    db.commit()
    db.refresh(x)

    return obj(x)

@router.post('/suggestions')
def suggestions(payload:dict): 
    return suggest(payload)