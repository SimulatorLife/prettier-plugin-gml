gpu_push_state();

if (show_name) {
    draw_text(x, y, name);
}

gpu_pop_state();
draw_sprite(sprite_index, 0, x, y);
