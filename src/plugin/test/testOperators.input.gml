var myCount = 10;
++myCount
--myCount
myCount++
myCount--
myCount+=1
myCount-=1
var myCountAlt = myCount++
var myCountAlt2 = ++myCount;

var myArray = [1,2,3,4,5,];

///////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////// Fall state //////////////////////////////////////////////////////


var op1 = true || false;
var op2 = true or false;

var op3 = true and false;
var op4 = true && false;

var op5 = 10 % 2;
var op6 = 10 mod 2;

var op7 = true ^^ false;
var op8 = true xor false;

var op9 = (((10 div 6)));
var op10 = 10 != 6;


n = max(0., point_distance(.0, 1., 0.0, 100.0));

if ((a == getValue()) == true) {
	// TODO
}

var myVal = h < 0 || h > 1

var myVal2 = .5 + 1 * 5 /3

var myVal3 = a + b * c

var myVal4 = a + b + c

var myVal5 = (a + b) * c

var myVal6 = a && b or c

var myVal7 = a > b && c < d

var myVal8 = a - b - c

var myVal9 = a == b + c

var myVal10 = a + b * c

var myVal11 = a && b or c and d

var myVal12 = x * y / z

var myVal13 = (3 - 2) ? "cool" : "not cool"

var g = 0.8 - jump * ground * 20; //Gravity
var acc = 1 + ground * 0.3; //Acceleration

#region
camDirX = -camMat[0] * c + camMat[8] * s;
camDirY = -camMat[1] * c + camMat[9] * s;
camDirZ = -camMat[2] * c + camMat[10] * s;
#endregion

function halve(value) {
    return value / /* keep important comment */ 2;
}


if (pos == undefined) {
	pos = -1;
} else {
	pos = 0;
}


if (enemyPos.x  - x <= 0) {
	state = "idle";
}

if (myState == undefined) {
	myState = "unknown";
}
