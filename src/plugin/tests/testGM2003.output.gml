/// Draw Event

shader_set(sh_fancy_lighting);

shader_reset();

vertex_submit(vb_my_world_model, pr_trianglelist, -1);

/// Draw GUI Event

draw_text(5, 5, "World 1");
