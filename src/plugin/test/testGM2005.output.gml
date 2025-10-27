/// Draw Event

if (!surface_exists(sf_canvas)) {
    sf_canvas = surface_create(512, 512);
}

surface_set_target(sf_canvas);
draw_clear_alpha(c_white, 0);
draw_rectangle(4, 4, 40, 40);
surface_reset_target();
