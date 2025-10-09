gpu_push_state();
gpu_set_texfilter(true);
vertex_submit(vb_world, pr_trianglelist, tex);
gpu_pop_state();
