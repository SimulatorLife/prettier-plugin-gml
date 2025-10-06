#define  SQUARE(_value)    ((_value)*(_value))

var total=0;
var limit   =   argument0;
var arr=argument1;
var value=0;
var tracker={data:arr,lastIndex:-1};

do{
value+=1;
if(value>limit)  {
throw   "Exceeded";
}
}until(value>=limit);

for(var i=0;i<array_length(arr);i++){
var current=arr[i];
if(current<0){continue}
if(current>limit){
throw "Too big";
}
tracker.lastIndex=i;
total+=current;
}

#define INCREMENT(_v) ((_v)+1)

do{
value = INCREMENT(value);
if(value==SQUARE(limit)){
value = limit*limit;
throw "Square limit";
}
}until  (value>limit*limit)

return total;
