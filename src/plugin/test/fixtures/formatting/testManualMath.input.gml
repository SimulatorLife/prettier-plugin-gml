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

abs_manual = x < 0 ? -x : x;
abs_builtin = abs(x);

clamp_manual = min(max(v, lo), hi);
clamp_builtin = clamp(v, lo, hi);

lerp_manual = a + (b - a) * t;
lerp_builtin = lerp(a, b, t);

inv_lerp_manual = (v - a) / (b - a);
inv_lerp_builtin = (v - a) / (b - a);

remap_manual = a2 + (b2 - a2) * ((v - a1) / (b1 - a1));
remap_builtin = lerp(a2, b2, (v - a1) / (b1 - a1));

sign_manual = x > 0 ? 1 : (x < 0 ? -1 : 0);
sign_builtin = sign(x);

round_manual = floor(x + 0.5);
round_builtin = round(x);

frac_manual = x - floor(x);
frac_builtin = frac(x);

midpoint_manual = (a + b) * 0.5;
midpoint_builtin = mean(a, b);

min3_manual = min(a, min(b, c));
min3_builtin = min(a, b, c);

max3_manual = max(a, max(b, c));
max3_builtin = max(a, b, c);

deg_to_rad_manual = deg * (pi / 180);
deg_to_rad_builtin = degtorad(deg);

rad_to_deg_manual = rad * (180 / pi);
rad_to_deg_builtin = radtodeg(rad);

angle_wrap_manual = ((ang mod 360) + 360) mod 360;
angle_wrap_builtin = ang mod 360;

approach_manual = cur + clamp(tgt - cur, -step, step);
approach_builtin = clamp(cur + (tgt - cur), tgt - step, tgt + step);

dist_sq_manual = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
dist_sq_builtin = point_distance(x1, y1, x2, y2);
dist_sq_optimized = sqr(x2 - x1) + sqr(y2 - y1);

inside_manual = (x >= l) and (x <= r) and (y >= t) and (y <= b);
inside_builtin = point_in_rectangle(x, y, l, t, r, b);

inside_circle_manual = point_distance(x, y, cx, cy) <= r;
inside_circle_builtin = point_in_circle(x, y, cx, cy, r);

range_manual = (v >= lo) and (v <= hi);
range_builtin = (v >= lo) and (v <= hi);

choose_manual = irandom(n - 1);
choose_builtin = floor(random(n - 1));

rand_range_manual = lo + random(hi - lo);
rand_range_builtin = random_range(lo, hi);

angle_diff_manual = ((b - a + 180) mod 360) - 180;
angle_diff_builtin = angle_difference(a, b);

move_towards_manual = x += lengthdir_x(spd, dir); y += lengthdir_y(spd, dir);
move_towards_builtin = motion_add(dir, spd);

hypot_manual = sqrt(a * a + b * b);
hypot_builtin = point_distance(0, 0, a, b);
hypot_optimized = sqrt(sqr(a) + sqr(b));

log10_manual = ln(x) / ln(10);
log10_builtin = log10(x);
