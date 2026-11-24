import json, os, glob, urllib.request, urllib.error, atexit, sys
BASE='http://localhost:8000/api'
CK=[]
def req(method, path, payload=None, raw=None, ctype='application/json'):
    data=None; headers={}
    if raw is not None:
        data=raw; headers['Content-Type']=ctype
    elif payload is not None:
        data=json.dumps(payload).encode(); headers['Content-Type']='application/json'
    r=urllib.request.Request(BASE+path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            b=resp.read()
            try: return resp.status, json.loads(b)
            except Exception: return resp.status, None
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read())
        except Exception: return e.code, None

def check(name, cond, detail=''):
    CK.append((name, bool(cond)))
    if cond: print('OK  ', name)
    else: print('FAIL', name, '|', str(detail)[:140])

s,p=req('POST','/projects',{'name':'QA Concierto Visual'})
pid=p.get('id') if isinstance(p,dict) else None
check('A1 crear proyecto', s==200 and pid, (s,p))
# Unico proyecto que crea este script. Se registra el id REAL devuelto por la
# API y se borra al final; nunca se borra por rango ni por patron de nombre.
CREADOS=[pid] if pid else []
def limpiar():
    for x in list(CREADOS):
        if x is None: continue
        st,_=req('DELETE','/projects/%s'%x)
        print('limpieza: proyecto %s -> %s'%(x,st))
    CREADOS.clear()
# Doble red: `finally` al final del script y `atexit` para excepciones o
# Ctrl+C, de modo que una corrida fallida tampoco deja datos en la base real.
atexit.register(limpiar)
s,p=req('GET','/projects/%s'%pid); check('A2 abrir proyecto', s==200, s)
s,p=req('GET','/projects')
check('A3 listado + persistencia', s==200 and isinstance(p,list) and any(x.get('id')==pid for x in p), s)

s,p=req('POST','/projects/%d/songs'%pid,{'name':'Luna de Xelaju'})
check('B1 crear cancion Luna', s==200, (s,p))
for n in ('Cancion Dos','Cancion Tres'): req('POST','/projects/%d/songs'%pid,{'name':n})
s,songs=req('GET','/projects/%d/songs'%pid)
check('B2 hay 3 canciones', s==200 and isinstance(songs,list) and len(songs)==3, (s,songs))
sid=[x for x in songs if x['name']=='Luna de Xelaju'][0]['id']
check('B3 abrir cancion', sid>0, sid)

def newcomp(name):
    s,p=req('POST','/compositions',{'project_id':pid,'song_id':sid,'name':name,'width':1600,'height':900,'data':{'elements':[]}})
    check('C1 crear %s'%name, s==200 and isinstance(p,dict) and p.get('id'), (s,p))
    return p
c_ens=newcomp('Luna de Xelaju - Ensayo')
c_pri=newcomp('Luna de Xelaju - Principal')
s,p=req('PATCH','/compositions/%d'%c_ens['id'],{'name':'Luna de Xelaju - Ensayo v2'})
check('C2 renombrar composicion', s==200 and isinstance(p,dict) and p.get('name')=='Luna de Xelaju - Ensayo v2', (s,p))
s,p=req('POST','/compositions/%d/duplicate'%c_pri['id'],{'name':'Luna de Xelaju - Final'})
check('C3 guardar como (copia indep.)', s==200 and isinstance(p,dict) and p.get('id'), (s,p))
c_fin=p
data2={'elements':[{'id':'mX','type':'marimba','name':'Marimba Z','x':700,'y':250,'rotation':0,'scaleX':1,'scaleY':1,'locked':False,'positions':[{'id':'z0','type':'Primera','personId':None}]}]}
s,p=req('PUT','/compositions/%d'%c_fin['id'],{'project_id':pid,'song_id':sid,'name':c_fin.get('name') or 'Luna de Xelaju - Final','width':1600,'height':900,'data':data2})
check('C4 editar la copia', s==200, (s,p))
s,proj=req('GET','/projects/%d'%pid)
def compby(cid): return [c for c in proj.get('compositions',[]) if c['id']==cid][0]
check('C5 original intacto tras editar copia', (compby(c_pri['id']).get('data') or {}).get('elements') in ([],None), compby(c_pri['id']).get('data'))
check('C6 composicion pertenece a la cancion', compby(c_fin['id']).get('song_id')==sid, compby(c_fin['id']).get('song_id'))
s,p=req('DELETE','/compositions/%d'%c_fin['id']); check('C7 eliminar composicion', s in (200,204), (s,p))
s,proj=req('GET','/projects/%d'%pid)
check('C8 copia eliminada', not any(c['id']==c_fin['id'] for c in proj.get('compositions',[])))
check('C9 cancion NO eliminada', any(x['id']==sid for x in proj.get('songs',[])))
s,pp=req('GET','/people'); check('C10 GET personas OK', s==200 and isinstance(pp,list), s)
s,_=req('PATCH','/compositions/99999999',{'name':'x'}); check('C11 404 renombrar inexistente', s==404, s)
s,_=req('DELETE','/compositions/99999999'); check('C12 404 eliminar inexistente', s==404, s)
s,_=req('GET','/projects/99999999'); check('C13 404 proyecto', s==404, s)
s,_=req('GET','/songs/99999999/history'); check('C14 404 cancion', s==404, s)
xl=sorted(glob.glob(os.path.join('..','examples','**','*.xlsx'),recursive=True))
if not xl: xl=sorted(glob.glob(os.path.join('..','*.xlsx')))
if xl:
    fn=xl[0]; raw=open(fn,'rb').read(); b='----QA1234'
    body=('--%s\r\nContent-Disposition: form-data; name="file"; filename="%s"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n'%(b,os.path.basename(fn))).encode()+raw+('\r\n--%s--\r\n'%b).encode()
    s,p=req('POST','/imports/preview',raw=body,ctype='multipart/form-data; boundary='+b)
    check('D1 excel preview', s==200 and isinstance(p,dict), (s,str(p)[:140]))
    if s==200 and isinstance(p,dict):
        # Se importa DENTRO del proyecto de la prueba. Antes se hacia
        # `req('POST','/imports/confirm', p)` sin `project_id`, y el endpoint
        # (routes.py) crea un proyecto NUEVO cuando no se le indica uno: cada
        # ejecucion dejaba un proyecto huerfano en la base real.
        payload=dict(p); payload['project_id']=pid
        s2,p2=req('POST','/imports/confirm',payload)
        check('D2 excel confirm', s2==200, (s2,str(p2)[:140]))
else:
    check('D1 excel preview', False, 'no se encontro xlsx en examples/')
s,people=req('GET','/people')
check('D3 personas cargadas', s==200 and isinstance(people,list) and len(people)>=3, (s,len(people) if isinstance(people,list) else people))
pids=[x['id'] for x in (people or [])][:6]
pnames={x['id']:x.get('name','') for x in (people or [])}

def slot(i,t): return {'id':'s%d'%i,'type':t,'personId':None}
mA={'id':'mA','type':'marimba','name':'Marimba A','x':300,'y':200,'rotation':0,'scaleX':1,'scaleY':1,'locked':False,'positions':[slot(0,'Primera'),slot(1,'Primera'),slot(2,'Segunda'),slot(3,'Bajo')]}
mB={'id':'mB','type':'marimba','name':'Marimba B','x':760,'y':200,'rotation':15,'scaleX':0.9,'scaleY':0.9,'locked':False,'positions':[slot(10,'Primera'),slot(11,'Segunda')]}
mC={'id':'mC','type':'marimba','name':'Marimba C','x':300,'y':470,'rotation':-8,'scaleX':1.15,'scaleY':1.15,'locked':True,'positions':[slot(20+k,'Primera') for k in range(5)]}
def person(i,slotid,ptype,mid):
    return {'id':'per%d'%i,'type':'person','name':pnames.get(pids[i],'P%d'%i),'personId':pids[i],'positionType':ptype,'marimbaId':mid,'marimbaPositionId':slotid,'x':0,'y':0,'rotation':0,'scaleX':1,'scaleY':1,'locked':(i==0)}
if len(pids)>=3:
    mA['positions'][0]['personId']=pids[0]
    mA['positions'][1]['personId']=pids[1]
    mB['positions'][1]['personId']=pids[2]
els=[mA,mB,mC,person(0,'s0','Primera','mA'),person(1,'s1','Primera','mA'),person(2,'s11','Segunda','mB')]
s,cx=req('POST','/compositions',{'project_id':pid,'song_id':sid,'name':'QA Compleja','width':1600,'height':900,'data':{'elements':els}})
check('E1 crear composicion compleja', s==200 and isinstance(cx,dict) and cx.get('id'), (s,str(cx)[:140]))
if isinstance(cx,dict) and cx.get('id'):
    cid=cx['id']
    mA2=dict(mA); mA2['x']=420; mA2['y']=240
    els2=[mA2,mB,mC]+els[3:]
    s,_=req('PUT','/compositions/%d'%cid,{'project_id':pid,'song_id':sid,'name':'QA Compleja','width':1600,'height':900,'data':{'elements':els2}})
    check('E2 guardar cambios (PUT)', s==200, s)
    s,proj=req('GET','/projects/%d'%pid)
    cc=compby(cid); got={e.get('id'):e for e in (cc.get('data') or {}).get('elements',[])}
    a=got.get('mA',{}); mb=got.get('mB',{}); c3=got.get('mC',{}); p0=got.get('per0',{})
    check('E3 coordenadas persisten', a.get('x')==420 and a.get('y')==240, (a.get('x'),a.get('y')))
    check('E4 rotacion persiste', mb.get('rotation')==15, mb.get('rotation'))
    check('E5 escala persiste', mb.get('scaleX')==0.9, mb.get('scaleX'))
    check('E6 lock marimba persiste', c3.get('locked') is True, c3.get('locked'))
    check('E7 lock persona persiste', p0.get('locked') is True, p0.get('locked'))
    check('E8 tipos de puesto persisten', [q.get('type') for q in a.get('positions',[])]==['Primera','Primera','Segunda','Bajo'], a.get('positions'))
    sa=a.get('positions',[])
    check('E9 asignaciones persisten', len(sa)>=2 and sa[0].get('personId')==pids[0] and sa[1].get('personId')==pids[1], sa[:2])
    sb=mb.get('positions',[])
    check('E10 puesto vacio se mantiene', len(sb)>=2 and sb[0].get('personId') is None and sb[1].get('personId')==pids[2], sb)
    s,cpy=req('POST','/compositions/%d/duplicate'%cid,{'name':'QA Compleja v2'})
    check('E11 duplicar compleja (guardar como)', s==200 and isinstance(cpy,dict) and cpy.get('id'), (s,str(cpy)[:100]))
    if s==200 and isinstance(cpy,dict):
        m2=dict(got.get('mA',{})); m2['x']=999
        s,_=req('PUT','/compositions/%d'%cpy['id'],{'project_id':pid,'song_id':sid,'name':'QA Compleja v2','width':1600,'height':900,'data':{'elements':[m2]+[e for e in els2 if e.get('id')!='mA']}})
        s,proj=req('GET','/projects/%d'%pid)
        xx=[e for e in compby(cid)['data']['elements'] if e.get('id')=='mA'][0].get('x')
        check('E12 original intacto tras editar copia', xx==420, xx)
print('---')
limpiar()
bad=[n for n,ok in CK if not ok]
print('TOTAL %d checks | %d fallas'%(len(CK),len(bad)))
for n in bad: print('FALLA:',n)
