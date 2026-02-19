squared = value * value;
cubed = value * value * value;
quartic = value * value * value * value;
sqrtManual = power(length, 0.5);
sqrtFromPower = power(distance, 0.5);
logTwo = ln(amount) / ln(2);
expManual = power(2.718281828459045, factor);
meanDivision = (alpha + beta) / 2;
meanMultiply = (first + second) * 0.5;
dot2 = (ax * bx) + (ay * by);
dot2Flat = ax * bx + ay * by;
dot3 = (ax * bx) + (ay * by) + (az * bz);
distance = sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
distancePower = power(
    (x_end - x_start) * (x_end - x_start) + (y_end - y_start) * (y_end - y_start),
    0.5
);
distance3 = sqrt(
    (x2 - x1) * (x2 - x1) +
        (y2 - y1) * (y2 - y1) +
        (z2 - z1) * (z2 - z1)
);
direction = arctan2(y2 - y1, x2 - x1);
lenXDegrees = radius * dcos(direction);
lenYDegrees = -radius * dsin(direction);
lenXRadians = radius * cos(degtorad(direction));
lenYRadians = -radius * sin(degtorad(direction));
sinDegrees = sin(direction * pi / 180);
cosDegrees = cos((direction / 180) * pi);
tanDegrees = tan(direction * pi / 180);
unchangedCall = update() * update();
commented = value /* keep */ * value;
