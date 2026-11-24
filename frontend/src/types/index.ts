export type Position={id:number,name:string};
export type Person={id:number,name:string,active:boolean};
export type Song={id:number,name:string,assignments:{id:number,person_id:number,person:string,position:string,mark:string}[]};
export type Template={id:number,name:string,description:string,positions:string[]};

export type MarimbaPosition={id:string,type:string,personId:number|null,note?:Note};

/**
 * Fase 7B.1 - anotaciones.
 *
 * `label`   etiqueta BREVE (chip): "Kay", "Segunda fila".
 * `comment` comentario descriptivo (se recorta en pantalla, texto completo al
 *            pasar el raton / tocar). Se distinguen visualmente.
 *
 * Viajan DENTRO del elemento porque asi heredan gratis lo que ya hacia el
 * proyecto: se guardan con la composicion, desaparecen al borrar el elemento
 * (store `remove`), y se copian al duplicar una composicion sin dejar huerfanos.
 * Sin tabla nueva ni migracion.
 */
export type Note={label?:string,comment?:string};

export type MarimbaElement={
 id:string;type:'marimba';name:string;
 x:number;y:number;width:number;height:number;
 rotation:number;scaleX:number;scaleY:number;
 locked?:boolean;
 note?:Note;
 positions:MarimbaPosition[];
};

export type PersonElement={
 id:string;type:'person';name:string;personId:number;positionType:string;
 x:number;y:number;width:number;height:number;
 rotation:number;scaleX:number;scaleY:number;
 locked?:boolean;
 note?:Note;
 marimbaId:string|null;marimbaPositionId:string|null;
};

export type Element=MarimbaElement|PersonElement;
export type CompositionData={elements:Element[]};

export type Composition={
 id:number;
 project_id:number;
 song_id:number|null;
 name:string;
 width:number;
 height:number;
 data:CompositionData;
 created_at?:string;
 updated_at?:string;
};

export type RequirementStatus='covered'|'partial'|'missing';

export type PositionRequirement={
 position_type:string;
 required:number;
 available:number;
 missing:number;
 status:RequirementStatus;
};

export type SongRequirements={
 song_id:number;
 song_name:string;
 composition_id:number|null;
 capacity_source:'composition'|'sin_composicion';
 position_counts:Record<string,number>;
 requirements:PositionRequirement[];
 totals:{required:number;available:number;missing:number};
 extra_capacity:{position_type:string;available:number}[];
 has_requirements:boolean;
 complete:boolean;
};