for(var i=0;i<ds_queue_size(queue);i+=1){
for(var j=0;j<array_length(arr);j+=1){
show_debug_message($"{i}x{j}");
}
}

// Repeat loops do NOT need hoisting
var k = 0; repeat(array_length(arr2)) {
k += 1;
}

var apple = "apple";
var apple_len = string_length(apple);
apple = ["granny smith","fuji","gala"];

// If renaming would cause a naming conflict, do not hoist
for (var index = 0; index < array_length(apple); index += 1) {
	show_debug_message(apple[index]);
}

var arr=[1,2,3];
for(var i=0;i<array_length(arr);i++){
show_debug_message(arr[i]);
};
