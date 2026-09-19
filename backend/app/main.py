from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
import time

from app.db.session import Base,engine
from app.models import models
from app.api.routes import router
from app.core.config import settings

app=FastAPI(title='Marimba Organizer API',version='0.1.0')

def wait_for_db(retries:int=30,delay:float=2.0)->None:
    for attempt in range(1,retries+1):
        try:
            with engine.connect() as conn:
                conn.execute(text('SELECT 1'))
            return
        except OperationalError:
            if attempt==retries:
                raise
            time.sleep(delay)

wait_for_db()
Base.metadata.create_all(bind=engine)

app.add_middleware(CORSMiddleware,allow_origins=[x.strip() for x in settings.cors_origins.split(',')],allow_credentials=True,allow_methods=['*'],allow_headers=['*'])
app.include_router(router,prefix='/api')
@app.get('/')

def root(): return {
    'message':'Marimba Organizer API','docs':'/docs'
}