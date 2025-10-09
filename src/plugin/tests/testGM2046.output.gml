/// Draw Event

surface_set_target(sf);
draw_clear_alpha(c_blue, 1);
draw_circle(50, 50, 20, false);
surface_reset_target();
vertex_submit(vb, pr_trianglelist, surface_get_texture(sf));
