#macro GRASS_GRIDSIZE 5

grid[# _xInd, _yInd] = 100;

var curr_val = myStruct[$ "the_key"];

myArray[@ 3] = 9999;

///--------------------------------------------------------------
/// eAIState
///--------------------------------------------------------------

enum eAIState {
    idle,          // no AI direction currently
    wander,        // pathfind/steer to random points in room
    wander_path,   // wanders around but uses path finding
    evade,         // trying to evade active target. If we can pathfind, pick random points nearby to move to. Otherwise, steer away from active target
    follow,        // steer to follow our active target keeping distance between
    follow_path,   // pathfind to follow our active target keeping distance between
    move_to,       // move to active target's position without pathfinding
    move_to_path,  // move to active target's position using pathfinding
    attack_target  // close enough to enemy target & all attackcriteria met -> attack target
}

/// @function convert_trig
/// @param angleDeg
/// @param ratioY
/// @param ratioX
function convert_trig(angleDeg, ratioY, ratioX) {
    var sin_radians = dsin(angleDeg);
    var cos_radians = dcos(angleDeg + 90);
    var tan_radians = dtan(-angleDeg);
    var asin_degrees = darcsin(ratioY);
    var atan_degrees = darctan(ratioY);
    var atan2_degrees = darctan2(ratioY, ratioX);
    var cos_to_rad = cos(angleDeg);
    var sin_to_rad = sin(angleDeg);
    var tan_to_rad = tan(angleDeg);
    var asin_to_rad = arcsin(ratioY);
    var acos_degrees = darccos(ratioY);
    var acos_to_rad = arccos(ratioY);
    var atan_to_rad = arctan(ratioY);
    var atan2_to_rad = arctan2(ratioY, ratioX + 1);
    return [
        sin_radians,
        cos_radians,
        tan_radians,
        asin_degrees,
        atan_degrees,
        atan2_degrees,
        cos_to_rad,
        sin_to_rad,
        tan_to_rad,
        asin_to_rad,
        acos_degrees,
        acos_to_rad,
        atan_to_rad,
        atan2_to_rad
    ];
}
