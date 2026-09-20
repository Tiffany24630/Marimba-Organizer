class CompositionDuplicateIn(BaseModel):
    name:str|None=None
    song_id:int|None=None

class ApplySuggestions(BaseModel):
    proposals:list[dict]
    name:str|None=None