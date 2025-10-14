// If a vertex format is begun but not ended, then it should be removed
vertex_format_begin();
vertex_format_add_position_3d();
vertex_format_begin();
vertex_format_add_texcoord();
format = vertex_format_end();
