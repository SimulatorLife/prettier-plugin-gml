if (situation_1)
{
    gpu_push_state();
    gpu_push_state();
    draw_text(x, y, "Hi");
    gpu_pop_state();
}
else
{
    show_debug_message("no state");
}

if (situation_2)
{
    gpu_push_state();
    draw_circle(x, y, 10, false);
    gpu_pop_state();
    gpu_pop_state();
}
