from pathlib import Path
from app.services.excel_parser import parse_workbook

def test_real_workbook_is_parsed():
    p=Path(__file__).parents[2]/'examples'/'Puestos conciertos Marimba.xlsx'
    data=parse_workbook(p.read_bytes())
    
    assert len(data['sheets'])==4
    assert any(x.lower().startswith('tiffany salazar') for x in data['people'])
    assert data['positions']
    assert data['marks']