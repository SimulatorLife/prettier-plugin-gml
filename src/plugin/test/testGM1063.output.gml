/// Create Event

tex = (texture_defined ? sprite_get_texture(sprite_index, 0) : pointer_null);

/// Draw Event

vertex_submit(vb, pr_trianglelist, tex);
