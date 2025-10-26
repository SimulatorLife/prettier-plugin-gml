var squared = value * value;
var cubed = value * value * value;
var quartic = value * value * value * value;
var sqrtManual = power(length, 0.5);
var sqrtFromPower = power(distance, 0.5);
var logTwo = ln(amount) / ln(2);
var expManual = power(2.718281828459045, factor);
var meanDivision = (alpha + beta) / 2;
var meanMultiply = (first + second) * 0.5;
var dot2 = (ax * bx) + (ay * by);
var dot2Flat = ax * bx + ay * by;
var dot3 = (ax * bx) + (ay * by) + (az * bz);
var distance = sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
var distancePower = power(
    (x_end - x_start) * (x_end - x_start) + (y_end - y_start) * (y_end - y_start),
    0.5
);
var distance3 = sqrt(
    (x2 - x1) * (x2 - x1) +
        (y2 - y1) * (y2 - y1) +
        (z2 - z1) * (z2 - z1)
);
var direction = arctan2(y2 - y1, x2 - x1);
var lenXDegrees = radius * dcos(direction);
var lenYDegrees = -radius * dsin(direction);
var lenXRadians = radius * cos(degtorad(direction));
var lenYRadians = -radius * sin(degtorad(direction));
var sinDegrees = sin(direction * pi / 180);
var cosDegrees = cos((direction / 180) * pi);
var unchangedCall = update() * update();
var commented = value /* keep */ * value;
