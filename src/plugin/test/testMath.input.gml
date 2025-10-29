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

// Test that we can simplify expressions
var s = 1.3 * size * 0.12 / 1.5;

// 1) Cancelable ratio inside a product
var s1 = speed * (60 / 120);

// 2) Chained division and multiply by one-half
var s2 = distance / 2 * 0.5;

// 3) Degrees to radians
var s3 = angle * pi / 180;

  /// 4) Distributive constant collection
  var s4 = value * 0.3 + value * 0.2


// 5) Divide by a reciprocal
  var s5 = (x - x0) / (1 / 60);

   // 6) Sequential quarter then half
  var s6 = width / 4 / 2;

// 7) Percent into tenth
  var s7 = (hp / max_hp) * 100 / 10;

  // 8) Multiply by one minus one-half
  var s8 = len * (1 - 0.5);

  // 9) Milliseconds to frames (60 fps) via chained factors
  var s9 = acc * dt / 1000 * 60;

  // 10) Identity multiply
  var s10 = size * 1.0;

  // 11) Additive identity
  var s11 = y + 0;  // original
  var s11_simplified = y;  // simplified

  // 12) Double then quarter
  var s12 = x * 2 / 4;

  // 13) Scale then divide
  var s13 = (a * 3) / 6;

  // 14) Velocity*time ms then to frames
  var s14 = (vx * dt) / 1000 * 60;

  // 15) Ten then divide by five
  var s15 = (score * 10) / 5;

  // 16) Milliseconds to minutes
  var s16 = time_ms / 1000 / 60;

  // 17) Divide by one-half
  var s17 = pixels / (1 / 2);

  // 18) Redundant reciprocal factors
  var s18 = a * (b / c) * (c / b);

  // 19) Minutes to seconds scaling
  var s19 = (t / 60) * 120;

  // 20) Nested percentage
  var s20 = (radius * 50) / 100;

  // 21) Factorable sum
  var s21 = k * 2 + k * 3;

  // 22) Multiply by zero
  var s22 = any_val * 0 + offset;

  // 23) Redundant parenthesis and unity power
  var s23 = ((base_val) * 1);

  // 24) Chain of ratios to a single factor
  var s24 = height / 3 * 9 / 6;

  // 25) Canceling negatives
  var s25 = (dx / -2) * -1;

  // 26) Multiply by reciprocal then by value
  var s26 = value_a * (1 / value_b) * value_b;

  // 27) Mixed constants
  var s27 = n * 8 / 2 / 2;

  // 28) Inverted compound
  var s28 = (m / 5) * (10 / 2);

  // 29) Grouped decimals
  var s29 = amount * 0.4 + amount * 0.1 + amount * 0.5;

  // 30) Reciprocal of reciprocal
  var s30 = a_val / (1 / b_val);

  // 31) Chained frame scaling with obvious cancel
  var s31 = frames / 30 * 60 / 2;

  // 32) Extra zero factor hidden
  var s32 = (z * 0.25) + (z * 0.25) + (z * 0.5);

  // 33) Halves of halves
  var s33 = w / 2 / 2;

  // 34) 1000 then thousandth
  var s34 = v * 1000 * 0.001;

  // 35) Over-compounded scale
  var s35 = scale * (3 / 6) * (4 / 2);
