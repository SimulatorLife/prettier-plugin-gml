/// Draw Event

gpu_set_ztestenable(true);

gpu_set_zfunc(cmpfunc_greater);

vertex_submit(vb, pr_trianglelist, tex);

gpu_set_ztestenable(false);
