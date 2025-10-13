/// Draw Event

gpu_set_cullmode(cull_clockwise);

gpu_set_cullmode(cull_noculling);

vertex_submit(vb, pr_trianglelist, tex);
