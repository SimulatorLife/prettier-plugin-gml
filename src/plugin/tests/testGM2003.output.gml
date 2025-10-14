/// Draw Event

shader_set(sh_fancy_lighting);

vertex_submit(vb_my_world_model, pr_trianglelist, -1);

shader_reset();

/// Draw GUI Event

draw_text(5, 5, "World 1");
