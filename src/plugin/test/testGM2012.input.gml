// If a vertex format is malformed, then it does nothing and should be removed
vertex_format_end();
vertex_format_begin();
vertex_format_add_position_3d();
vertex_format_begin();
vertex_format_add_texcoord();
format = vertex_format_end();

// If a vertex format is ended but not assigned, then it does nothing and should be removed
vertex_format_begin();
vertex_format_end();