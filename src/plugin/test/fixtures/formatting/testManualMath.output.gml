squared = sqr(value);
cubed = power(value, 3);
quartic = power(value, 4);
sqrtManual = sqrt(length);
sqrtFromPower = sqrt(distance);
logTwo = log2(amount);
expManual = exp(factor);
meanDivision = mean(alpha, beta);
meanMultiply = mean(first, second);
dot2 = dot_product(ax, ay, bx, by);
dot2Flat = dot_product(ax, ay, bx, by);
dot3 = dot_product_3d(ax, ay, az, bx, by, bz);
distance = point_distance(x1, y1, x2, y2);
distancePower = point_distance(x_start, y_start, x_end, y_end);
distance3 = point_distance_3d(x1, y1, z1, x2, y2, z2);
direction = point_direction(x1, y1, x2, y2);
lenXDegrees = lengthdir_x(radius, direction);
lenYDegrees = lengthdir_y(radius, direction);
lenXRadians = lengthdir_x(radius, direction);
lenYRadians = lengthdir_y(radius, direction);
sinDegrees = dsin(direction);
cosDegrees = dcos(direction);
tanDegrees = dtan(direction);
unchangedCall = update() * update();
commented = value /* keep */ * value;

abs_manual = abs(x);
abs_builtin = abs(x);

clamp_manual = clamp(v, lo, hi);
clamp_builtin = clamp(v, lo, hi);

lerp_manual = lerp(a, b, t);
lerp_builtin = lerp(a, b, t);

inv_lerp_manual = (v - a) / (b - a);
inv_lerp_builtin = (v - a) / (b - a);

remap_manual = lerp(a2, b2, (v - a1) / (b1 - a1));
remap_builtin = lerp(a2, b2, (v - a1) / (b1 - a1));

sign_manual = sign(x);
sign_builtin = sign(x);

round_manual = round(x);
round_builtin = round(x);

frac_manual = frac(x);
frac_builtin = frac(x);

midpoint_manual = mean(a, b);
midpoint_builtin = mean(a, b);

min3_manual = min(a, b, c);
min3_builtin = min(a, b, c);

max3_manual = max(a, b, c);
max3_builtin = max(a, b, c);

deg_to_rad_manual = degtorad(deg);
deg_to_rad_builtin = degtorad(deg);

rad_to_deg_manual = radtodeg(rad);
rad_to_deg_builtin = radtodeg(rad);

angle_wrap_manual = ang mod 360;
angle_wrap_builtin = ang mod 360;

approach_manual = clamp(cur + (tgt - cur), tgt - step, tgt + step);
approach_builtin = clamp(cur + (tgt - cur), tgt - step, tgt + step);

dist_sq_manual = point_distance(x1, y1, x2, y2);
dist_sq_builtin = point_distance(x1, y1, x2, y2);
dist_sq_optimized = sqr(x2 - x1) + sqr(y2 - y1);

inside_manual = point_in_rectangle(x, y, l, t, r, b);
inside_builtin = point_in_rectangle(x, y, l, t, r, b);

inside_circle_manual = point_in_circle(x, y, cx, cy, r);
inside_circle_builtin = point_in_circle(x, y, cx, cy, r);

range_manual = (v >= lo) and (v <= hi);
range_builtin = (v >= lo) and (v <= hi);

choose_manual = irandom(n - 1);
choose_builtin = irandom(n - 1);

rand_range_manual = random_range(lo, hi);
rand_range_builtin = random_range(lo, hi);

angle_diff_manual = angle_difference(a, b);
angle_diff_builtin = angle_difference(a, b);

move_towards_manual = motion_add(dir, spd);
move_towards_builtin = motion_add(dir, spd);

hypot_manual = point_distance(0, 0, a, b);
hypot_builtin = point_distance(0, 0, a, b);
hypot_optimized = point_distance(0, 0, a, b);

log10_manual = log10(x);
log10_builtin = log10(x);
