export type Position={id:number,name:string};
export type Person={id:number,name:string,active:boolean};
export type Song={id:number,name:string,assignments:{id:number,person_id:number,person:string,position:string,mark:string}[]};
export type Template={id:number,name:string,description:string,positions:string[]};

export type MarimbaPosition={id:string,type:string,personId:number|null};

export type MarimbaElement={
 id:string;type:'marimba';name:string;
 x:number;y:number;width:number;height:number;
 rotation:number;scaleX:number;scaleY:number;
 positions:MarimbaPosition[];
};

export type PersonElement={
 id:string;type:'person';name:string;personId:number;positionType:string;
 x:number;y:number;width:number;height:number;
 rotation:number;scaleX:number;scaleY:number;
 marimbaId:string|null;marimbaPositionId:string|null;
};

export type Element=MarimbaElement|PersonElement;
export type CompositionData={elements:Element[]};
