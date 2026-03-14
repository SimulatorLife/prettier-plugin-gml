repeat (amount) {
    do_something();
}

repeat (3) {
    show_debug_message("done");
}

repeat (compute_limit()) {
    trigger();
}

for (var j = 0; j < compute_half_limit(); j += 2) {
    trigger();
}

var v = 0;
for (k = v; k < amount; k++) {
    do_something_alt(v);
    v += 1;
}
