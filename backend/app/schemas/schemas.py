from pydantic import BaseModel, Field
from typing import Any

class ProjectIn(BaseModel): 
    name:str
    description:str|None=None

class ProjectPatch(BaseModel):
    name:str|None=None
    description:str|None=None

class CompositionIn(BaseModel):
    project_id:int
    song_id:int|None=None
    name:str
    width:int=1600
    height:int=900
    data:dict[str,Any]=Field(default_factory=dict)

class MarimbaTemplateIn(BaseModel): 
    name:str
    description:str|None=None
    positions:list[str]

class MarimbaTemplatePatch(BaseModel):
    name:str|None=None
    description:str|None=None
    positions:list[str]|None=None

class SongIn(BaseModel):
    name:str

class SongPatch(BaseModel):
    name:str

class CompositionDuplicateIn(BaseModel):
    name:str|None=None
    song_id:int|None=None

class CompositionPatch(BaseModel):
    name:str|None=None
    song_id:int|None=None

class PersonIn(BaseModel):
    name:str
    project_id:int|None=None

class PersonPatch(BaseModel):
    name:str

class ApplySuggestions(BaseModel):
    proposals:list[dict]
    name:str|None=None
    marimba_plan:list[dict]|None=None

class ImportConfirm(BaseModel):
    project_name:str=''
    project_id:int|None=None
    description:str|None=None
    source_filename:str|None=None
    sheets:list[dict[str,Any]]