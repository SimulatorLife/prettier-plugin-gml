/// Draw Event

gpu_set_cullmode(cull_clockwise);
vertex_submit(vb, pr_trianglelist, tex);
gpu_set_cullmode(cull_noculling);
