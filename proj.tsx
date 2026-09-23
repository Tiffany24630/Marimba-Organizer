520|        setData((d:any)=>d?{...d,compositions:[...(d?.compositions||[]),comp]}:d);
521|        setCompId(comp.id);setCompName(comp.name||'');setElements(comp.data?.elements||[]);select(null);reloadSongs(id);
522|       }}/>
523|     )}
524|
525|     <h3>Marimbas</h3>
526|     {templates.map((t:Template)=>(
527|      <button className="item" key={t.id} onClick={()=>addMarimba({name:t.name,positions:t.positions})}>
528|       <b>+ {t.name}</b><small>{t.positions.length} puestos · {t.positions.join(', ')}</small>
529|      </button>)))}
530|     <button className="item custom" onClick={()=>addCustomMarimba()}>
531|      <b>+ Marimba personalizada</b><small>Empieza con un puesto y configúrala en el panel derecho</small>
532|     </button>
533|     <p className="hint">Las plantillas son solo punto de partida: luego puedes agregar, quitar, cambiar o reordenar puestos sin afectar la plantilla.</p>
534|    </aside>
535|    <div className={`splitter ${isResizing?'dragging':''}`} onMouseDown={()=>setIsResizing(true)} onTouchStart={()=>setIsResizing(true)} aria-hidden="true"></div>
536|    <section className="canvas-panel"><CanvasEditor/></section>
537|    <Inspector detectedPositions={detected} drawerOpen={showInspector} onDrawerToggle={setShowInspector}/>
538|   </div>
539|   </div>
540|  </main>
541| );
542|}
