var my_val = (2 + 3) * 4;
var b = (x > y) ? (a + b) : (a - b);

/// @description States

// Define states
states.add_state(
    "opening",
    function() {  // enter
        gml_pragma("forceinline");

        scr_play_sound_at(snd_slot_machine, x, y, z);
        scaler.big_squish();
        image_speed = 1;  // start animation

        // Start spraying coins
        time_source_start(ts_spray_coins);

        // Start checking if we should destroy the open chest
        call_later(
            1800,
            time_source_units_frames,
            function() {
                gml_pragma("forceinline");
                if (!(global.camera.is_in_view(x, y, z))) {
                    instance_destroy();
                }
            },
            true
        );
    },
    undefined,  // step
    function() {  // leave
        audio_stop_sound(snd_slot_machine);  // stop sound effect
        pe_general.retire(true);  // stop sparkle particles
        time_source_stop(ts_spray_coins);  // stop this time source
    }
);

//global.rain_controller.draw();
//if (room == rm_island) {
//	//global.spart_controller.draw();
//}
//global.part_controller.draw();

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

 // Particle system
 //if (!variable_instance_exists(id, "pt_colour")) {
 //	pt_colour = choose(
 //		eParticleType.fire_red,
 //		eParticleType.fire_blue,
 //		eParticleType.fire_green,
 //		eParticleType.fire_orange,
 //		eParticleType.fire_gold
 //	); // choose fire colour
 //}

// The following should be preserved; math-expression parentheses should not be applied to string concatenation
var item_txt = (item_id.name + "\n" + item_id.description + "\n$" + string(item_id.price));
