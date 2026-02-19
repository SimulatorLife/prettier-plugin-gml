var myCount = 10;
var myCountAlt = myCount++;
var myCountAlt2 = ++myCount;

var myArray = [1, 2, 3, 4, 5];

// Fall state

var op1 = true;
var op2 = true;

var op3 = false;
var op4 = false;

var op5 = 0;
var op6 = 0;

var op7 = true;
var op8 = true;

var op9 = 1;
var op10 = true;

n = 99;

if (a == getValue()) {
	// TODO
}

var myVal = (h < 0) or (h > 1);

var myVal2 = 5.5;

var myVal3 = a + b * c;

var myVal4 = a + b + c;

var myVal5 = (a + b) * c;

var myVal6 = a and b or c;

var myVal7 = (a > b) and (c < d);

var myVal8 = a - b - c;

var myVal9 = a == b + c;

var myVal10 = a + b * c;

var myVal11 = a and b or c and d;

var myVal12 = x * y / z;

var myVal13 = "cool";

var g = 0.8 - jump * ground * 20; // Gravity
var acc = 1 + ground * 0.3; // Acceleration

#region

camDirX = -camMat[0] * c + camMat[8] * s;
camDirY = -camMat[1] * c + camMat[9] * s;
camDirZ = -camMat[2] * c + camMat[10] * s;

#endregion

/// @param value
function halve(value) {
    return value * /* keep important comment */ 0.5;
}

pos = is_undefined(pos) ? -1 : 0;

if (enemyPos.x <= x) {
    state = "idle";
}

myState ??= "unknown";
