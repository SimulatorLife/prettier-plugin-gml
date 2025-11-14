//// Set foot movement speed according to character rotation and movement speeds (this is so the legs don't end up trailing when the character is moving too fast)
//try { // TODO this sometimes throws NaN error, try catch is band-aid
//	foot_spd = min(0.5 * sqrt(sqr(x - xprevious) + sqr(y - yprevious)) + abs(last_crab_dir) * 0.1 + 0.2, 1);
//} catch(ex) {
//	show_debug_message("Caught exception while trying to update crab foot speed: " + string(ex));
//}

// Make body wobble up and down
// This is a trailing comment
z_wobble = ((sin(current_time * 0.004) + 1) * 2) + 2; // value between 0 and 2, this is subtracted from crabs height

/// @function string_height_scribble
/// @param string - The string to draw
/// @description Emulation of string_height(), but using Scribble for calculating the width
///              **Please do not use this function in conjunction with string_copy()**
function string_height_scribble(_string) {
    static _scribble_state = __scribble_get_state();

    var _font = draw_get_font();
    _font = (!font_exists(_font) ? _scribble_state.__default_font : font_get_name(_font));

    return scribble(_string).starting_format(_font, c_white).get_height();
}

// This is an unrelated comment

/// @function scribble_font_has_character
/// @param fontName - The target font, as a string
/// @param character - Character to test for, as a string
/// @description Tests to see if a font has the given character
/// @returns {bool} Indicating whether the given character is found in the font
function scribble_font_has_character(_font_name, _character) {
    return ds_map_exists(__scribble_get_font_data(_font_name).__glyphs_map, ord(_character));
}

/// @function twojointik
/// @param x1 - The position of the root of the chain
/// @param y1 - The position of the root of the chain
/// @param z1 - The position of the root of the chain
/// @param x2dir - The direction the first joint should face
/// @param y2dir - The direction the first joint should face
/// @param z2dir - The direction the first joint should face
/// @param x3 - The target position of the end effector
/// @param y3 - The target position of the end effector
/// @param z3 - The target position of the end effector
/// @param length1 - The length of the first bone
/// @param length2 - The length of the second bone
/// @description This function calculates the position of a two jointed IK chain.
/// @returns It returns an array with the position of the joint and the end effector.
function twojointik(x1, y1, z1, x2dir, y2dir, z2dir, x3, y3, z3, length1, length2) {
    // Return an array
    return [x2, y2, z2, x3, y3, z3];
}
