from pathlib import Path
from io import BytesIO
import zipfile

from openpyxl import Workbook
from app.services.excel_parser import parse_workbook, detect_duplicates

EXAMPLES=Path(__file__).parents[2]/'examples'


def xlsx_bytes(ws_build):
    wb=Workbook()
    ws_build(wb)
    buf=BytesIO()
    wb.save(buf)
    return buf.getvalue()


def build_valid(wb):
    ws=wb.active
    ws.title='Concierto'
    ws['A1']='Nombre'
    ws['B1']='Canción 1'
    ws['C1']='Canción 2'
    ws['B2']='Primera'
    ws['C2']='Bajo'
    ws['A3']='Tiffany Salazar'
    ws['B3']='X'
    ws['A4']='María López'
    ws['C4']='X'


def test_real_workbook_is_parsed():
    p=EXAMPLES/'Puestos conciertos Marimba.xlsx'
    data=parse_workbook(p.read_bytes())

    assert len(data['sheets'])==4
    assert any(x.lower().startswith('tiffany salazar') for x in data['people'])
    assert data['positions']
    assert data['marks']
    assert data['stats']['valid_rows']>0


def test_valid_excel_detects_people_positions_and_rows():
    data=parse_workbook(xlsx_bytes(build_valid))

    assert data['people']==['María López','Tiffany Salazar']
    assert data['positions']==['Bajo','Primera']
    assert data['stats']['valid_rows']==2
    assert data['sheets'][0]['songs'][0]['assignments'][0]['person']=='Tiffany Salazar'


def test_new_unknown_position_is_detected():
    def build(wb):
        ws=wb.active
        ws['A1']='Nombre'; ws['B1']='Canción'
        ws['B2']='Marimba Doble Agudo'
        ws['A3']='Juan Pérez'; ws['B3']='X'

    data=parse_workbook(xlsx_bytes(build))

    assert data['positions']==['Marimba Doble Agudo']


def test_headers_with_spaces_and_accents_are_tolerated():
    def build(wb):
        ws=wb.active
        ws['A1']=' Nombre del Músico '
        ws['B1']='  CANCIÓN ÚNICA '
        ws['B2']=' Segunda  '
        ws['A3']='  Ana   García '
        ws['B3']='X'

    data=parse_workbook(xlsx_bytes(build))

    assert data['people']==['Ana García']
    assert data['positions']==['Segunda']


def test_file_without_valid_rows_raises_value_error():
    def build(wb):
        ws=wb.active
        ws['A1']='ID'
        ws['B1']='Stock Actual'

    data=parse_workbook(xlsx_bytes(build))

    assert data['people']==[] and data['positions']==[]


def test_truncated_file_raises():
    p=EXAMPLES/'Puestos conciertos Marimba.xlsx'
    raw=p.read_bytes()

    with __import__('pytest').raises(Exception):
        parse_workbook(raw[:200])


def test_not_an_excel_raises():
    with __import__('pytest').raises(Exception):
        parse_workbook(b'esto no es un excel')


def test_detect_duplicates_exact_and_similar():
    d=detect_duplicates(['Ana García','Ana García','Roberto Pérez','Roberto Peres'])

    assert any('Ana García' in g for g in d['exact'])
    assert any(set(x['names'])=={'Roberto Pérez','Roberto Peres'} for x in d['similar'])


def test_real_example_is_valid_zip():
    p=EXAMPLES/'Puestos conciertos Marimba.xlsx'

    assert zipfile.is_zipfile(BytesIO(p.read_bytes()))