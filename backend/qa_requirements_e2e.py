"""E2E real del informe de requisitos contra el backend en Docker.

Aislamiento: el unico proyecto que crea se registra por su id real y se borra al
final (y con `atexit`, tambien si el script falla). La base real queda intacta.
"""
import json, urllib.request, urllib.error, atexit

BASE='http://localhost:8000/api'
OK=[];FAIL=[]
# ids creados por ESTA corrida; nunca se borra por rango ni por nombre.
CREADOS=[]

def limpiar():
    for x in list(CREADOS):
        try:
            urllib.request.urlopen(
                urllib.request.Request(BASE+'/projects/%s'%x, method='DELETE'),
                timeout=30).read()
            print('limpieza: proyecto %s borrado'%x)
        except Exception as e:
            print('limpieza: proyecto %s no borrado (%s)'%(x,e))
    CREADOS.clear()

atexit.register(limpiar)

def call(method,path,payload=None):
    data=json.dumps(payload).encode() if payload is not None else None
    h={'Content-Type':'application/json'} if data else {}
    r=urllib.request.Request(BASE+path,data=data,headers=h,method=method)
    try:
        with urllib.request.urlopen(r,timeout=30) as resp:
            b=resp.read()
            try: return resp.status,json.loads(b)
            except Exception: return resp.status,None
    except urllib.error.HTTPError as e:
        try: return e.code,json.loads(e.read())
        except Exception: return e.code,None

def check(name,cond,detail=''):
    (OK if cond else FAIL).append(name)
    print(('OK   ' if cond else 'FAIL ')+name+((' | '+str(detail)[:130]) if not cond else ''))

def marimba(mid,name,types):
    return {'id':mid,'type':'marimba','name':name,'x':0,'y':0,'width':380,'height':150,
            'rotation':0,'scaleX':1,'scaleY':1,
            'positions':[{'id':'%s_p%d'%(mid,i),'type':t,'personId':None}
                         for i,t in enumerate(types)]}

s,p=call('POST','/projects',{'name':'E2E Requisitos'})
pid=p['id'];check('A1 crear proyecto',s==200,(s,p))
if pid: CREADOS.append(pid)

def asg(n,pos,i): return {'person':'%s %s %d'%(n,pos,i),'position':pos,'mark':'X'}
confs=[asg('E2E Primera','Primera',i) for i in range(1,6)]
confs+=[asg('E2E Segunda','Segunda',i) for i in range(1,3)]
confs+=[asg('E2E Bajo','Bajo',1)]
s,p=call('POST','/imports/confirm',{'project_id':pid,'sheets':[{'name':'H','songs':[
    {'name':'Luna de Xelaju','assignments':confs}]}]})
check('A2 importar cancion con requisitos',s==200,(s,p))
s,proj=call('GET','/projects/%d'%pid)
sid=[x for x in proj['songs'] if x['name']=='Luna de Xelaju'][0]['id']

els=[marimba('mA','Marimba A',['Primera','Primera','Segunda','Bajo']),
     marimba('mB','Marimba B',['Primera','Segunda'])]
s,c=call('POST','/compositions',{'project_id':pid,'song_id':sid,'name':'Luna - Ensayo',
                                 'width':1600,'height':900,'data':{'elements':els}})
cid=c['id'];check('B1 crear composicion',s==200,(s,c))

s,r=call('GET','/songs/%d/requirements'%sid)
check('C1 endpoint responde',s==200,(s,r))
check('C2 song_id correcto',r.get('song_id')==sid,r.get('song_id'))
check('C3 composition_id detectado',r.get('composition_id')==cid,r.get('composition_id'))
check('C4 position_counts legacy',r.get('position_counts')=={'Bajo':1,'Primera':5,'Segunda':2},
      r.get('position_counts'))
rows={x['position_type']:x for x in r['requirements']}
check('C5 Primera 3/5 parcial',rows.get('Primera')=={'position_type':'Primera','required':5,
      'available':3,'missing':2,'status':'partial'},rows.get('Primera'))
check('C6 Segunda cubierta',rows.get('Segunda',{}).get('status')=='covered',rows.get('Segunda'))
check('C7 Bajo cubierta',rows.get('Bajo',{}).get('status')=='covered',rows.get('Bajo'))
check('C8 totales 8/6/2',r.get('totals')=={'required':8,'available':6,'missing':2},r.get('totals'))
check('C9 complete False',r.get('complete') is False,r.get('complete'))

els2=[marimba('mA','Marimba A',['Primera']*4+['Segunda','Bajo']),
      marimba('mB','Marimba B',['Primera','Segunda'])]
s,c2=call('PUT','/compositions/%d'%cid,{'project_id':pid,'song_id':sid,'name':'Luna - Ensayo',
                                        'width':1600,'height':900,'data':{'elements':els2}})
check('D1 guardar composicion ampliada',s==200,(s,c2))
s,r2=call('GET','/songs/%d/requirements?composition_id=%d'%(sid,cid))
rows2={x['position_type']:x for x in r2['requirements']}
check('D2 Primera 5/5 cubierta',rows2.get('Primera',{}).get('available')==5
      and rows2.get('Primera',{}).get('missing')==0,rows2.get('Primera'))
check('D3 complete True',r2.get('complete') is True,r2.get('complete'))
check('D4 totales completos',r2.get('totals')=={'required':8,'available':8,'missing':0},r2.get('totals'))

s,c3=call('POST','/compositions',{'project_id':pid,'song_id':sid,'name':'Luna - Otra',
           'width':1600,'height':900,
           'data':{'elements':[marimba('mC','Marimba C',['Primera','Segunda','Bajo'])]}})
s,r3=call('GET','/songs/%d/requirements'%sid)
check('E1 usa la composicion mas reciente',r3.get('composition_id')==c3['id'],r3.get('composition_id'))
check('E2 capacidad insuficiente 8/3/5',r3.get('totals')=={'required':8,'available':3,'missing':5},
      r3.get('totals'))
check('E3 Primera parcial (1 de 5)',
      {x['position_type']:x['status'] for x in r3['requirements']}.get('Primera')=='partial',
      r3['requirements'])
s,r4=call('GET','/songs/%d/requirements?composition_id=%d'%(sid,cid))
check('E4 composicion explicita manda',r4.get('composition_id')==cid and r4.get('complete') is True,
      (r4.get('composition_id'),r4.get('complete')))

s,before=call('GET','/compositions/%d'%cid)
call('GET','/songs/%d/requirements?composition_id=%d'%(sid,cid))
s,after=call('GET','/compositions/%d'%cid)
check('F1 composicion intacta',before.get('data')==after.get('data'))
s,sg=call('GET','/songs/%d'%sid)
check('F2 asignaciones intactas',len(sg.get('assignments',[]))==8,len(sg.get('assignments',[])))
check('F3 composiciones siguen',len(sg.get('compositions',[]))==2,len(sg.get('compositions',[])))

s,e=call('GET','/songs/999999/requirements');check('G1 cancion inexistente 404',s==404,s)
s,e=call('GET','/songs/%d/requirements?composition_id=999999'%sid)
check('G2 composicion inexistente 404',s==404,s)

print('---')
limpiar()
print('TOTAL %d checks | FALLAS %d'%(len(OK)+len(FAIL),len(FAIL)))
for f in FAIL: print('FALLA:',f)
