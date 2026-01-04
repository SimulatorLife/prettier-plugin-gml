// Set foot movement speed according to character rotation and movement speeds (this is so the legs don't end up trailing when the character is moving too fast)
//try { // TODO this sometimes throws NaN error, try catch is band-aid
//    foot_spd = min(0.5 * sqrt(sqr(x - xprevious) + sqr(y - yprevious)) + abs(last_crab_dir) * 0.1 + 0.2, 1);
//} catch(ex) {
//    show_debug_message("Caught exception while trying to update crab foot speed: " + string(ex));
//}

// Make body wobble up and down
// This is a trailing comment
z_wobble = ((sin(current_time * 0.004) + 1) * 2) + 2; // value between 0 and 2, this is subtracted from crabs height

/// @description Emulation of string_height(), but using Scribble for calculating the width
///              **Please do not use this function in conjunction with string_copy()**
/// @param string The string to draw
function string_height_scribble(_string) {
    static _scribble_state = __scribble_get_state();

    var _font = draw_get_font();
    _font = (!font_exists(_font) ? _scribble_state.__default_font : font_get_name(_font));

    return scribble(_string).starting_format(_font, c_white).get_height();
}

// This is an unrelated comment

/// @description Tests to see if a font has the given character
/// @param font_name The target font, as a string
/// @param character Character to test for, as a string
/// @returns {bool} Indicating whether the given character is found in the font
function scribble_font_has_character(_font_name, _character) {
    return ds_map_exists(__scribble_get_font_data(_font_name).__glyphs_map, ord(_character));
}

/// @param x1
/// @param y1
/// @param z1
/// @param x2dir
/// @param y2dir
/// @param z2dir
/// @param x3
/// @param y3
/// @param z3
/// @param length1
/// @param length2
function twojointik(x1, y1, z1, x2dir, y2dir, z2dir, x3, y3, z3, length1, length2) {

    // Return an array
     return [x2, y2, z2, x3, y3, z3];
}

alarm[1] = 10; // not everything loaded yet, check again in a bit
