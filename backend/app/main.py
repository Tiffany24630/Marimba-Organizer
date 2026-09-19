from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.db.session import Base,engine
from app.models import models
from app.api.routes import router
from app.core.config import settings

app=FastAPI(title='Marimba Organizer API',version='0.1.0')

Base.metadata.create_all(bind=engine)

app.add_middleware(CORSMiddleware,allow_origins=[x.strip() for x in settings.cors_origins.split(',')],allow_credentials=True,allow_methods=['*'],allow_headers=['*'])
app.include_router(router,prefix='/api')
@app.get('/')

def root(): return {
    'message':'Marimba Organizer API','docs':'/docs'
}