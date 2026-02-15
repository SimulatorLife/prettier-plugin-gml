/// @description Draw with colour flash when damaged
var curr_draw_shdr = hp.is_invincible() ? shd_solidcolour : shd_geometry;
shader_set(curr_draw_shdr);
zmodel.draw();
shader_reset();
