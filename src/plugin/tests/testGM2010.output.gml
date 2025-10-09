vertex_format_begin();
vertex_format_add_position_3d();
format = vertex_format_end();
vb = vertex_create_buffer();

vertex_begin(vb, format);
vertex_position_3d(vb, x, y, 0);
vertex_position_3d(vb, x + 100, y, 0);
vertex_position_3d(vb, x, y + 100, 0);
vertex_end(vb);
