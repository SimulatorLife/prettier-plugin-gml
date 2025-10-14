for (var i = 0; i < amount; i += 1) {
    do_something();
}

for (count = 0; count < 3; ++count) {
    show_debug_message("done");
}

for (var step = 0; step < compute_limit(); step = step + 1) {
    trigger();
}
