// subMesh.addShape(new colmesh_block(matrix_build(0, 0, 0, 0, 0, 0, 300, 300, 40)));
subMesh.addShape(new colmesh_disk(0, 0, 0, 0, 0, 1, 300, 50));

if (headerText != "ColMesh v4") {
    return false;
}

switch (cannonball_type) {
    case obj_cannonball_beachball:
        sprite_index = spr_cannonball_beachball;
        break;
    case obj_cannonball_bomb:
        sprite_index = spr_cannonball_bomb;
        break;
    default:
        sprite_index = noone;
        break;
}

var matrix = scr_matrix_build(
    x,
    y,
    z + zfight,
    xrotation,
    yrotation,
    image_angle,
    image_xscale,
    image_yscale,
    image_zscale
);

#macro  SQUARE(_value)    ((_value)*(_value))
var total = 0;
var limit = argument0;
var arr = argument1;
var value = 0;
var tracker = {data: arr, lastIndex: -1};

do {
    value += 1;
    if (value > limit) {
        throw "Exceeded";
    }
} until (value >= limit);

var arr_len = array_length(arr);
for (var i = 0; i < arr_len; i++) {
    var current = arr[i];
    if (current < 0) {
        continue;
    }
    if (current > limit) {
        throw "Too big";
    }
    tracker.lastIndex = i;
    total += current;
}

var arr2 = [1, 2, 3, 4, 5];

var i = 0;
repeat (array_length(arr2)) {
    show_debug_message(arr2[i++]);
}

#macro INCREMENT(_v) ((_v)+1)
do {
    value = INCREMENT(value);
    if (value == SQUARE(limit)) {
        value = limit * limit;
        throw "Square limit";
    }
} until (value > (limit * limit));

return total;

/// @function bool_passthrough
/// @param condition
function bool_passthrough(condition) {
    return condition;
}

/// @function bool_negated
/// @param {boolean} a - The first boolean
/// @param {boolean} b - The second boolean
function bool_negated(a, b) {
    return !(a and b);
}

/// @function bool_with_comment
/// @param condition
function bool_with_comment(condition) {
    if (condition) {
        // comment should stop simplification
        return true;
    } else {
        return false;
    }
}

/// @function bool_with_extra
/// @param condition
function bool_with_extra(condition) {
    if (condition) {
        return true;
        condition += 1;
    } else {
        return false;
    }
}

/// @function iterate_structures
/// @param list
/// @param map
/// @param grid
/// @returns {undefined}
function iterate_structures(list, map, grid) {
    var list_size = ds_list_size(list);
    for (var i = 0; i < list_size; i++) {
        show_debug_message(list[| i]);
    }

    var map_size = ds_map_size(map);
    for (var key = 0; key <= map_size; key += 1) {
        show_debug_message(ds_map_find_value(map, key));
    }

    var grid_width = ds_grid_width(grid);
    for (var x = 0; x < grid_width; x++) {
        var grid_height = ds_grid_height(grid);
        for (var y = 0; y < grid_height; y++) {
            show_debug_message(grid[# x, y]);
        }
    }

    for (var unsafe = 0; unsafe < ds_list_size(list); other++) {
        show_debug_message(unsafe);
    }
}

switch (value) {
    case 1:
    case 2:
        show_debug_message("two");
        break;
    default:
        break;
}
