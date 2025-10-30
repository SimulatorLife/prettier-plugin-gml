// Set foot movement speed according to character rotation and movement speeds (this is so the legs don't end up trailing when the character is moving too fast)
// try { // TODO this sometimes throws NaN error, try catch is band-aid
// 	// foot_spd = min(0.5 * sqrt(sqr(x - xprevious) + sqr(y - yprevious)) + abs(last_crab_dir) * 0.1 + 0.2, 1);
// } catch(ex) {
// 	show_debug_message("Caught exception while trying to update crab foot speed: " + string(ex));
// }

// Make body wobble up and down
z_wobble = ((sin(current_time * 0.004) + 1) * 2) + 2;  // value between 0 and 2, this is subtracted from crabs height

// / Emulation of string_height(), but using Scribble for calculating the width
// /
// / **Please do not use this function in conjunction with string_copy()**
// /
/// @param string    The string to draw

function string_height_scribble(_string) {
    static _scribble_state = __scribble_get_state();

    var _font = draw_get_font();
    _font = !font_exists(_font) ? _scribble_state.__default_font : font_get_name(_font);

    return scribble(_string).starting_format(_font, c_white).get_height();
}
