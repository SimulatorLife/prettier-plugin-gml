myCount = 10;
myCountAlt = myCount++;
myCountAlt2 = ++myCount;

myArray = [1, 2, 3, 4, 5];

// Fall state

op1 = true or false;
op2 = true or false;

op3 = true and false;
op4 = true and false;

op5 = 10 mod 2;
op6 = 10 mod 2;

op7 = true xor false;
op8 = true xor false;

op9 = 10 div 6;
op10 = 10 != 6;

n = max(0, point_distance(0, 1, 0, 100));

if ((a == getValue()) == true) {
    // TODO
}

myVal = (h < 0) or (h > 1);

myVal2 = 0.5 + 5;

myVal3 = a + (b * c);

myVal4 = (a + b) + c;

myVal5 = a + b * c;

myVal6 = (a and b) or c;

myVal7 = (a > b) and (c < d);

myVal8 = (a - b) - c;

myVal9 = a == (b + c);

myVal10 = a + (b * c);

myVal11 = (a and b) or (c and d);

myVal12 = (x * y) / z;

myVal13 = (3 - 2) ? "cool" : "not cool";

g = 0.8 - ((jump * ground) * 20); // Gravity
acc = 1 + (ground * 0.3); // Acceleration

#region

camDirX = dot_product(-camMat[], camMat[], c, s);
camDirY = dot_product(-camMat[], camMat[], c, s);
camDirZ = dot_product(-camMat[], camMat[], c, s);

#endregion

function halve(value) {
    return value * 0.5;
}

if (pos == undefined) {
    pos = -1;
} else {
    pos = 0;
}

if ((enemyPos.x - x) <= 0) {
    state = "idle";
}

if (myState == undefined) {
    myState = "unknown";
}
