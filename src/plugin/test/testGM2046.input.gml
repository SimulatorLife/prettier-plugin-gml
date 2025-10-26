/// Draw Event

surface_set_target(sf);
draw_clear_alpha(c_blue, 1);
draw_circle(50, 50, 20, false);
vertex_submit(vb, pr_trianglelist, surface_get_texture(sf));

surface_set_target(sf2);
draw_clear_alpha(c_black, 1);
draw_circle(10, 10, 20, false);
vertex_submit(vb, pr_trianglelist, -1);
