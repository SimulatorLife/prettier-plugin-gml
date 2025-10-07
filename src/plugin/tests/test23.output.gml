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
