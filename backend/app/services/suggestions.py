def suggest(data):
    hist={}

    for x in data.get('history',[]): 
        hist.setdefault(x.get('person_id'),[]).append(x.get('marimba_id'))
    
    movement=[]

    for p in data.get('people',[]):
        ids=hist.get(p.get('person_id'),[])

        if ids:
            counts={i:ids.count(i) for i in set(ids)}
            preferred=max(counts,key=counts.get)
            movement.append({'person_id':p.get('person_id'),'name':p.get('name'),'suggested_marimba_id':preferred,'history':counts,'reason':'Mantener la misma marimba reduce cambios respecto al historial cargado.'})

    return {'movement':movement,'groups':data.get('groups',[])}