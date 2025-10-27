draw_primitive_begin(pr_linelist);

if (should_draw)
{
    draw_vertex(0, 0);
    draw_primitive_end();
}
else
{
    draw_vertex_colour(0, 0, c_white, 1);
}

instance_destroy();
