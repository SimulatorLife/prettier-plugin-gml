foo        = 1;
longerName = 22;
show_debug_message("done");
value = compute();

// Comment separating assignments should reset the count
foo2                   = 12;
thisIsAReallyLongName2 = 23;
variable3              = 34;
show_debug_message("done again");
value2 = compute();

// Values for passing into shader
precalculated_0   = new Vector4();
precalculated_1   = new Vector4();
precalculated_2   = 0;
precalculated_0.y = 1 + (sin(time) * sin(0.5 * time) * (1.5 + (sin(0.05 * time) * 0.5)) * 0.5);
precalculated_1.z = sin(time);
precalculated_1.w = time * 0.2;
