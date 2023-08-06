var num = 10;
for (var i = 0; i < num; i++) {
    show_debug_message("Hello World " + string(i + 1));
}

/// @function clearSubdiv
static clearSubdiv = function() {
    // Clears any data structures related to the subdivision of the colmesh
    if (spHash >= 0) {
        var region = ds_map_find_first(spHash);
        while (!is_undefined(region)) {
            ds_list_destroy(spHash[? region]);
            region = ds_map_find_next(spHash, region);
        }
        ds_map_destroy(spHash);
        spHash = -1;
    }
};

var myWidth = 14;
var halfWidth = myWidth * 0.5;

enum eStates {
    STATE_IDLE = 0,
    STATE_WALK = 1,
    STATE_RUN = 2
}

var currState = eStates.STATE_IDLE;