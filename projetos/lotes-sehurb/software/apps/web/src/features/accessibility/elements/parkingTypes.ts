// Editable design starting points, not universal regulatory dimensions.
export const parkingTypes:Record<string,{name:string;width:number;length:number}>={
 car:{name:'Carro',width:2.5,length:5},accessible:{name:'PCD',width:2.5,length:5},elderly:{name:'Idoso',width:2.5,length:5},
 motorcycle:{name:'Moto',width:1,length:2.2},bicycle:{name:'Bicicleta',width:.6,length:2},electric:{name:'Elétrico',width:2.5,length:5},
 loading:{name:'Carga/descarga',width:3,length:7},truck:{name:'Caminhão',width:3.5,length:12},bus:{name:'Ônibus',width:3.5,length:14},
 taxi:{name:'Táxi',width:2.5,length:5},ambulance:{name:'Ambulância',width:3,length:6},custom:{name:'Personalizada',width:2.5,length:5}
};
