if (situation_1) {
    gpu_push_state();
    draw_text(x, y, "Hi");
    gpu_pop_state();
} else {
    show_debug_message("no state");
}

if (situation_2) {
    gpu_push_state();
    draw_circle(x, y, 10, false);
    gpu_pop_state();
}

// Scenario 3
gpu_push_state();
draw_circle(x + 5, y + 5, 10, true);
scr_custom_function_which_may_pop_state();

// Scenario 4
gpu_push_state();
draw_circle(x + 1, y + 1, 2, true);
scr_another_custom_function_which_might_reset_things();
