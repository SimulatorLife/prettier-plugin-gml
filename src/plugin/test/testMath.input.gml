// Script assets have changed for v2.3.0 see
// https://help.yoyogames.com/hc/en-us/articles/360005277377 for more information
#macro GRASS_GRIDSIZE 5

grid[#  _xInd,_yInd ]=100

var curr_val = myStruct[$ "the_key"]

myArray[@3] = 9999

///--------------------------------------------------------------
/// eAIState
///--------------------------------------------------------------

enum eAIState {
	idle, // no AI direction currently
	wander, // pathfind/steer to random points in room
	wander_path, // wanders around but uses path finding
	evade,  // trying to evade active target. If we can pathfind, pick random points nearby to move to. Otherwise, steer away from active target
	follow, // steer to follow our active target keeping distance between
	follow_path,  // pathfind to follow our active target keeping distance between
	move_to, // move to active target's position without pathfinding
	move_to_path, // move to active target's position using pathfinding
	attack_target,    // close enough to enemy target & all attackcriteria met -> attack target
}

function convert_trig(angleDeg, ratioY, ratioX) {
var sin_radians = sin(degtorad(angleDeg));
var cos_radians = cos( degtorad( angleDeg+90 ) );
var tan_radians = tan(degtorad(-angleDeg));
var asin_degrees = radtodeg(arcsin(ratioY));
var atan_degrees = radtodeg(arctan(ratioY));
var atan2_degrees = radtodeg(arctan2(ratioY,ratioX));
var cos_to_rad = degtorad(dcos(angleDeg));
var sin_to_rad = degtorad(dsin(angleDeg));
var tan_to_rad = degtorad(dtan(angleDeg));
var asin_to_rad = degtorad(darcsin(ratioY));
var acos_degrees = radtodeg(arccos(ratioY));
var acos_to_rad = degtorad(darccos(ratioY));
var atan_to_rad = degtorad(darctan(ratioY));
var atan2_to_rad = degtorad(darctan2(ratioY, ratioX + 1));
return [sin_radians,cos_radians,tan_radians,asin_degrees,atan_degrees,atan2_degrees,cos_to_rad,sin_to_rad,tan_to_rad,asin_to_rad,acos_degrees,acos_to_rad,atan_to_rad,atan2_to_rad];
}
