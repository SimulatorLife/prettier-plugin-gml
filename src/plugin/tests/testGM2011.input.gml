/// Create Event

vb = vertex_create_buffer();

vertex_begin(vb, format);
vertex_position_3d(vb, 0, 0, 0);

/// Draw Event

vertex_submit(vb, pr_pointlist, -1);
