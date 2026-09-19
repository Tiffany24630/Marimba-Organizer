from datetime import datetime, timezone
from sqlalchemy import String, Text, DateTime, ForeignKey, Integer, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.session import Base

def now(): return datetime.now(timezone.utc)

class Project(Base):
    __tablename__='projects'

    id:Mapped[int]=mapped_column(primary_key=True)
    name:Mapped[str]=mapped_column(String(200))
    description:Mapped[str|None]=mapped_column(Text)
    source_filename:Mapped[str|None]=mapped_column(String(255))
    created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),default=now)
    updated_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),default=now,onupdate=now)

    songs=relationship('Song',back_populates='project',cascade='all, delete-orphan')
    compositions=relationship('Composition',back_populates='project',cascade='all, delete-orphan')

class Person(Base):
    __tablename__='people'

    id:Mapped[int]=mapped_column(primary_key=True)
    name:Mapped[str]=mapped_column(String(200),unique=True) 
    active:Mapped[bool]=mapped_column(default=True)

class Position(Base):
    __tablename__='positions'
    
    id:Mapped[int]=mapped_column(primary_key=True)
    name:Mapped[str]=mapped_column(String(100),unique=True)

class Song(Base):
    __tablename__='songs'

    id:Mapped[int]=mapped_column(primary_key=True)
    project_id:Mapped[int]=mapped_column(ForeignKey('projects.id',ondelete='CASCADE'))
    name:Mapped[str]=mapped_column(String(200))
    order_index:Mapped[int]=mapped_column(Integer,default=0)

    project=relationship('Project',back_populates='songs')
    assignments=relationship('SongAssignment',back_populates='song',cascade='all, delete-orphan')

class SongAssignment(Base):
    __tablename__='song_assignments'

    id:Mapped[int]=mapped_column(primary_key=True)
    song_id:Mapped[int]=mapped_column(ForeignKey('songs.id',ondelete='CASCADE'))
    person_id:Mapped[int]=mapped_column(ForeignKey('people.id'))
    position_id:Mapped[int]=mapped_column(ForeignKey('positions.id'))
    mark:Mapped[str]=mapped_column(String(20),default='X')

    song=relationship('Song',back_populates='assignments')
    person=relationship('Person')
    position=relationship('Position')

class MarimbaTemplate(Base):
    __tablename__='marimba_templates'
    
    id:Mapped[int]=mapped_column(primary_key=True)
    name:Mapped[str]=mapped_column(String(100),unique=True)
    description:Mapped[str|None]=mapped_column(Text)
    positions:Mapped[list]=mapped_column(JSON,default=list)

class Composition(Base):
    __tablename__='compositions'

    id:Mapped[int]=mapped_column(primary_key=True)
    project_id:Mapped[int]=mapped_column(ForeignKey('projects.id',ondelete='CASCADE'))
    song_id:Mapped[int|None]=mapped_column(ForeignKey('songs.id',ondelete='SET NULL'),nullable=True)
    name:Mapped[str]=mapped_column(String(200))
    width:Mapped[int]=mapped_column(Integer,default=1600)
    height:Mapped[int]=mapped_column(Integer,default=900)
    ata:Mapped[dict]=mapped_column(JSON,default=dict)
    created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),default=now)
    updated_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),default=now,onupdate=now)

    project=relationship('Project',back_populates='compositions')