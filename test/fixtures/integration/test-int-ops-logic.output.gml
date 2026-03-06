myCount = 10;
myCountAlt = myCount++;
myCountAlt2 = ++myCount;

myArray = [1, 2, 3, 4, 5];

// Fall state

op1 = true;
op2 = true;

op3 = false;
op4 = false;

op5 = 5;
op6 = 5;

op7 = true;
op8 = true;

op9 = 1;
op10 = true;

n = 99;

if (a == getValue()) {
    // TODO
}

myVal = (h < 0) or (h > 1);

myVal2 = 5.5;

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

myVal13 = "cool";

g = 0.8 - jump * ground * 20; // Gravity
acc = 1 + ground * 0.3; // Acceleration

#region

camDirX = dot_product(-camMat[0], camMat[8], c, s);
camDirY = dot_product(-camMat[1], camMat[9], c, s);
camDirZ = dot_product(-camMat[2], camMat[10], c, s);

#endregion

function halve(value) {
    return value * /* keep important comment */ 0.5;
}

pos = is_undefined(pos) ? -1 : 0;

if ((enemyPos.x - x) <= 0) {
    state = "idle";
}

myState ??= "unknown";
