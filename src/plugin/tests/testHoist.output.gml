var queue_count = ds_queue_size(queue);
for (var i = 0; i < queue_count; i += 1) {
    var arr_len = array_length(arr);
    for (var j = 0; j < arr_len; j += 1) {
        show_debug_message($"{i}x{j}");
    }
}

// Repeat loops do NOT need hoisting
var k = 0;
repeat (array_length(arr2)) {
    k += 1;
}

var apple = "apple";
var apple_len = string_length(apple);
apple = ["granny smith", "fuji", "gala"];

// If renaming would cause a naming conflict, do not hoist
for (var index = 0; index < array_length(apple); index += 1) {
	show_debug_message(apple[index]);
}
