/// @description Draws the vertex buffer to screen

matrix_set(matrix_world, matrix);
shader_set(shd_flag);
    shader_set_uniform_f(u_time, time);
    shader_set_uniform_f(u_uvs, uvs.x, uvs.y, uvs.z, uvs.w);
    shader_set_uniform_f(u_precalculated_0, precalculated_0.x, precalculated_0.y, precalculated_0.z, precalculated_0.w);
    shader_set_uniform_f(u_precalculated_1, precalculated_1.x, precalculated_1.y, precalculated_1.z, precalculated_1.w);
    shader_set_uniform_f(u_precalculated_2, precalculated_2);
    vertex_submit(vertex_buffer, pr_trianglelist, texture);
shader_reset();
scr_matrix_reset();

global.settings = {
	master_volume : scr_ini_read_real("settings", "master_volume", 0.5, 0, 1),
	music_volume  : scr_ini_read_real("settings", "music_volume", 0.6, 0, 1),
	sound_volume  : scr_ini_read_real("settings", "sound_volume", 1, 0, 1),
	zoom_level    : scr_ini_read_real("settings", "zoom", 3, 0, 1),
	show_hud      : scr_ini_read_real("settings", "hud", 1, 0, 1),
	nice_graphics : scr_ini_read_real("settings", "nice_graphics", 1, 0, 1),
	wavy_menu     : scr_ini_read_real("settings", "wavy_menu", 1, 0, 1),
	screen_shake  : scr_ini_read_real("settings", "screen_shake", 1, 0, 1),
	fullscreen    : scr_ini_read_real("settings", "fullscreen", window_get_fullscreen(), 0, 1)
};