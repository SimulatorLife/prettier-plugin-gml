function iterate_structures(list, map, grid) {
for(var i=0;i<ds_list_size(list);i++){show_debug_message(list[|i]);}
for(var key=0;key<=ds_map_size(map);key+=1){show_debug_message(ds_map_find_value(map,key));}
for(var x=0;x<ds_grid_width(grid);x++){
for(var y=0;y<ds_grid_height(grid);y++){show_debug_message(grid[# x,y]);}}
for(var unsafe=0;unsafe<ds_list_size(list);other++){show_debug_message(unsafe);}
}
