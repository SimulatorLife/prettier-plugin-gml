// Define states
states.add_state(
    "opening",
    function() { // enter
        gml_pragma("forceinline");

        scr_play_sound_at(snd_slot_machine, x, y, z);
        scaler.big_squish();
        image_speed = 1; // start animation

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
    undefined, // step
    function() { // leave 
        audio_stop_sound(snd_slot_machine); // stop sound effect
        pe_general.retire(true); // stop sparkle particles
        time_source_stop(ts_spray_coins); // stop this time source
    }
);