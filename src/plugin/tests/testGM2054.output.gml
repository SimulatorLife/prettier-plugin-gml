/// Draw Event

gpu_set_alphatestenable(true);

gpu_set_alphatestref(128);

draw_self();

gpu_set_alphatestref(0);

gpu_set_alphatestenable(false);
