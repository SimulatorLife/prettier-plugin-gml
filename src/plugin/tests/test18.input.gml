grid[#  _xInd,_yInd ]=100

var curr_val = myStruct[$ "the_key"]

myArray[@3] = 9999

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