import os,sys
from pathlib import Path

BACKEND=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(BACKEND))
os.environ['DATABASE_URL']='sqlite:///./test_marimba.db'

_db=BACKEND/'test_marimba.db'
if _db.exists():
    _db.unlink()