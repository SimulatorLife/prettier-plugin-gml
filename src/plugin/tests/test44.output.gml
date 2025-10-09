/// Draw Event

gpu_set_alphatestenable(true);

gpu_set_alphatestref(128);

gpu_set_alphatestref(0);

draw_self();

gpu_set_alphatestenable(false);
