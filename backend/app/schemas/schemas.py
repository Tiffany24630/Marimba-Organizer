from pydantic import BaseModel, Field
from typing import Any

class ProjectIn(BaseModel): 
    name:str
    description:str|None=None

class CompositionIn(BaseModel): project_id:int
    song_id:int|None=None
    name:str
    width:int=1600
    height:int=900
    data:dict[str,Any]=Field(default_factory=dict)

class MarimbaTemplateIn(BaseModel): 
    name:str
    description:str|None=None
    positions:list[str]

class ImportConfirm(BaseModel): 
    project_name:str
    description:str|None=None
    source_filename:str|None=None
    sheets:list[dict[str,Any]]