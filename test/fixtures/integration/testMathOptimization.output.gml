#macro GRASS_GRIDSIZE 5

grid[# _xInd, _yInd] = 100;

var curr_val = myStruct[];

myArray[@ 3] = 9999;

// eAIState

enum eAIState {
    idle, // no AI direction currently
    wander, // pathfind/steer to random points in room
    wander_path, // wanders around but uses path finding
    evade, // trying to evade active target. If we can pathfind, pick random points nearby to move to. Otherwise, steer away from active target
    follow, // steer to follow our active target keeping distance between
    follow_path, // pathfind to follow our active target keeping distance between
    move_to, // move to active target's position without pathfinding
    move_to_path, // move to active target's position using pathfinding
    attack_target // close enough to enemy target & all attackcriteria met -> attack target
}

/// @param angleDeg
/// @param ratioY
/// @param ratioX
function convert_trig(angleDeg, ratioY, ratioX) {
    var sin_radians = sin(degtorad(angleDeg));
    var cos_radians = cos(degtorad(angleDeg + 90));
    var tan_radians = tan(degtorad(-angleDeg));
    var asin_degrees = radtodeg(arcsin(ratioY));
    var atan_degrees = radtodeg(arctan(ratioY));
    var atan2_degrees = radtodeg(arctan2(ratioY, ratioX));
    var cos_to_rad = degtorad(dcos(angleDeg));
    var sin_to_rad = degtorad(dsin(angleDeg));
    var tan_to_rad = degtorad(dtan(angleDeg));
    var asin_to_rad = degtorad(darcsin(ratioY));
    var acos_degrees = radtodeg(arccos(ratioY));
    var acos_to_rad = degtorad(darccos(ratioY));
    var atan_to_rad = degtorad(darctan(ratioY));
    var atan2_to_rad = degtorad(darctan2(ratioY, ratioX + 1));
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

// Test that we can simplify expressions
var s = size * 0.104;
s = (s * 0.5) * (1 - lengthdir_x(1, swim_rot));

// 1) Cancelable ratio inside a product
var s1 = speed * 0.5;

// 2) Chained division and multiply by one-half
var s2 = distance * 0.25;

// 3) Degrees to radians
var s3 = degtorad(angle);
/// @description 4) Distributive constant collection
var s4 = value * 0.5;

// 5) Divide by a reciprocal
var s5 = x - (x0 * 0.016666666666666666);
// var s5 = (x - x0) / (1 / 60);


// 6) Sequential quarter then half
var s6 = width * 0.125;

// 7) Percent into tenth
var s7 = 10 * hp;

// 8) Multiply by one minus one-half
var s8 = len * 0.5;

// 9) Milliseconds to frames (60 fps) via chained factors
var s9 = acc * dt * 0.06;

// 10) Identity multiply
var s10 = size;

// 11) Additive identity
var s11 = y; // unnecessary addition

// 12) Double then quarter
var s12 = x * 0.5;

// 13) Scale then divide
var s13 = a * 0.5;

// 14) Velocity*time ms then to frames
var s14 = vx * dt * 0.06;

// 15) Ten then divide by five
var s15 = 2 * score;

// 16) Milliseconds to minutes
var s16 = time_ms * 0.0000166666666667;

// 17) Divide by one-half
var s17 = pixels * 0.5;

// 18) Redundant reciprocal factors
var s18 = a;

// 19) Minutes to seconds scaling
var s19 = 2 * t;

// 20) Nested percentage
var s20 = radius * 0.5;

// 21) Factorable sum
var s21 = 5 * k;

// 22) Multiply by zero
var s22 = offset;

// 23) Redundant parenthesis and unity power
var s23 = base_val;

// 24) Chain of ratios to a single factor
var s24 = height * 0.5;

// 25) Canceling negatives
var s25 = dx * 0.5;

// 26) Multiply by reciprocal then by value
var s26 = value_a;

// 27) Mixed constants
var s27 = 2 * n;

// 28) Inverted compound
var s28 = m;

// 29) Grouped decimals
var s29 = amount;

// 30) Reciprocal of reciprocal
var s30 = a_val;

// 31) Chained frame scaling with obvious cancel
var s31 = frames;

// 32) Extra zero factor hidden
var s32 = z;

// 33) Halves of halves
var s33 = w * 0.25;

// 34) 1000 then thousandth
var s34 = v;

// 35) Over-compounded scale
var s35 = scale;

// 36) Redundant denominator one
var s36 = length;

// 37) Redundant multiplication by one
var s37 = width;
var s37b = width;

// 38) Redundant denominator under zero
var s38 = 0;
