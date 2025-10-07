function greet(name, greeting) {
        var name = argument_count > 0 ? argument[0] : "friend";
        var greeting = argument_count > 1 ? argument[1] : "Hello";
        return greeting + ", " + name;
}

var message1 = greet();
var message2 = greet("Alice");
var message3 = greet("Bob", "Howdy");
var message4 = greet("Chaz");
var message5 = greet(undefined, "Welcome");

function bool_passthrough(condition) {
if(condition){
return true;
}else{
return false;
}
}

function bool_negated(a, b) {
    if (a && b) {
        return false;
    } else {
        return true;
    }
}

function bool_with_comment(condition) {
    if (condition) {
        // comment should stop simplification
        return true;
    } else {
        return false;
    }
}

function bool_with_extra(condition) {
    if (condition) {
        return true;
        condition += 1;
    } else {
        return false;
    }
}

function iterate_structures(list, map, grid) {
for(var i=0;i<ds_list_size(list);i++){show_debug_message(list[|i]);}
for(var key=0;key<=ds_map_size(map);key+=1){show_debug_message(ds_map_find_value(map,key));}
for(var x=0;x<ds_grid_width(grid);x++){
for(var y=0;y<ds_grid_height(grid);y++){show_debug_message(grid[# x,y]);}}
for(var unsafe=0;unsafe<ds_list_size(list);other++){show_debug_message(unsafe);}
}
