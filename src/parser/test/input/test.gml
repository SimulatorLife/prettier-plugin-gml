// Make sure the global logger is created before we try to log anything
gml_pragma("global", "variable_global_set(\"logger\", new DedupLogger())");


gml_func_add("gml_pragma(setting, ...)",function(){});

var l_jsDummy=(l_isJS?function(){}:undefined);

function configureLighting__() {
	global.lighting.add_key_time(00, 253, 094, 083, 0.50);  // Sunset peak at 00h
}

function _test_create_assert_error(argument0) {
	/* 
	 * Helper method for asserts to create standardized error
	 * messages. Not meant for external use.
	 */
	throw ("ASSERTION ERROR: " + "\n" + string(argument0));
}


/// @desc Convenience method for assert_is_true
/// @param Value
/// @param OptionalMessage
function assert() {
	if (argument_count > 1) {
	    assert_is_true(argument[0], argument[1]);
	} else {
	    assert_is_true(argument[0]);
	}
}

/// @desc Ensures the passed in object/instance does not exist in this room
/// @param Object
function assert_does_not_exist() {
	if (instance_exists(argument0)) {
	    if (argument_count > 1) {
	        msg = argument[1];
	    } else {
	        msg = _test_create_assert_error(string(argument[0]) + " should not exist");
	    }
		
	    throw (msg);
	}
}

/// @desc Ensures the passed values are equal
/// @param TestValue
/// @param ExpectedValue
/// @param OptionalMessage
function assert_equal() {
	if (argument[0] != argument[1]) {

	    var msg;
	    if (argument_count > 2) {
	        msg = argument[2];
	    } else {
	        msg = _test_create_assert_error(string(argument[0]) + " is not " + string(argument[1]));
	    }
	    throw (msg);
	}
}

/// @desc Ensures the passed in object/instance exists
/// @param Object
function assert_exists() {
	if (!instance_exists(argument0)) {
	    var msg;
    
	    if (argument_count > 1) {
	        msg = argument[1];
	    } else {
	        msg = _test_create_assert_error(string(argument[0]) + " has no instances");
	    }
	    throw (msg);
	}
}

/// @desc Asserts that the passed in argument is false
/// @param Value
/// @param OptionalMessage
function assert_is_false() {
	if (argument_count > 1) {
	    assert_equal(argument[0], false, argument[1]);
	} else {
	    assert_equal(argument[0], false);
	}
}

/// @desc Asserts that the passed in argument is true
/// @param Value
/// @param OptionalMessage
function assert_is_true() {
	if (argument_count > 1) {
	    assert_equal(argument[0], true, argument[1]);
	} else {
	    assert_equal(argument[0], true);
	}
}

/// @desc Ensures the passed in argument is undefined
/// @param TestValue
/// @param OptionalMessage
function assert_is_undefined() {
	if (!is_undefined(argument[0])) {

	    var msg;
	    if (argument_count > 1) {
	        msg = argument[1];
	    } else {
	        msg = _test_create_assert_error(string(argument[0]) + " is not undefined.");
	    }
	    throw (msg);
	}
}

/// @desc Ensures the passed in values are not equal
/// @param TestValue
/// @param UnexpectedValue
/// @param OptionalMessage
function assert_not_equal() {
	if (argument[0] == argument[1]) {
	    var msg = "";
    
	    if (argument_count > 2) {
	        msg = argument[2];
	    } else {
	        msg = _test_create_assert_error(string(argument[0]) + " shouldn\'t be " + string(argument[1]));
	    }
	    throw (msg);
	}
}

/// @desc Ensures the passed in method throws an exception
/// @param testMethod
/// @param optionalExpectedMessage
function assert_throws() {
	var testMethod = argument[0];
	var expectedMessage = argument_count > 1 ? argument[1] : "";
	var thrownErrorMessage = "";
	var didThrow = false;
	var didThrowCorrectMessage = argument_count == 1;
	
	try {
		testMethod();
	} catch (error) {
		didThrow = true;
		thrownErrorMessage = typeof(error) == "string" ? error : error.message;
		
		if (argument_count > 1) {
			didThrowCorrectMessage = thrownErrorMessage == expectedMessage;
		}
	}
	
	if (!didThrow) {
		throw _test_create_assert_error("Supplied method did not throw an error");
	}
	
	if (!didThrowCorrectMessage) {
		throw _test_create_assert_error("Supplied method threw unexpected error message: \"" + thrownErrorMessage + "\"");
	}
}

/// @function scr_sprite_exists
/// @param {*} maybe_sprite  – any value that *might* be a sprite asset-ID
/// @description Safe version of sprite_exists() == ! and (! or !(maybe_sprite or 0)) and.
///               Returns true only when 'id' is a non-negative number and
///               the built-in sprite_exists() confirms the asset.
/// @returns {bool}
function scr_sprite_exists(maybe_sprite) {
    // Fast rejects that never throw
    return !is_ptr(maybe_sprite) and (!is_real(maybe_sprite) or !(maybe_sprite < 0)) and  // texture / surface pointer or negative number
    // Now it’s either a numeric ID >=0 **or** the new asset reference type
    sprite_exists(maybe_sprite);
}

/// @function get_debug_text
/// @returns {string} debug_info
get_debug_text = function() {
	var txt = "";
	txt += $"\nPosition: {new Vector3(x, y, z).to_string(true)}";
	txt += $"\nLand type: {global.island.get_land_string(land_type)}";
	txt += $"\nDirection: {round(direction)}";
	if (!is_undefined(weapon)) {
		txt += weapon.get_debug_text();
	}
	txt += hp.get_debug_text();
	txt += states.get_debug_text();
	txt += mover.get_debug_text();
	if (variable_instance_exists(id, "collider") and !is_undefined(collider)) {
		txt += collider.get_debug_text();
	}
	if (variable_instance_exists(id, "ai")) {
		txt += ai.get_debug_text();
	}
	return txt;
}

/// @function vertex_buffer_write_triangular_prism
/// @description Write a unit triangular prism into an existing vbuff.
/// Local space: X∈[-0.5,+0.5], Y∈[-0.5,+0.5], base plane at Z=0, apex line at (Y=0,Z=1).
function vertex_buffer_write_triangular_prism(vbuff, colour = c_white, alpha = 1, trans_mat) {
    var hx = 0.5, hy = 0.5, h = 1.0;

    // Base corners (Z = 0)
    var L0 = [-hx, -hy, 0]; // x-, y-
    var L1 = [-hx, +hy, 0]; // x-, y+
    var R0 = [+hx, -hy, 0]; // x+, y-
    var R1 = [+hx, +hy, 0]; // x+, y+

    // Apex line (Y=0, Z=1)
    var LA = [-hx, 0, h];
    var RA = [+hx, 0, h];

    // Reusable UVs
    static uv00 = [0,0];
	static uv10 = [1,0];
	static uv11 = [1,1];
	static uv01 = [0,1];

    // Base quad (Z=0): L0-R0-R1,  L0-R1-L1  (outside normal points to Z-; ok for debug)
    vertex_buffer_write_triangle(vbuff, L0, R0, R1, uv00, uv10, uv11, colour, alpha, trans_mat);
    vertex_buffer_write_triangle(vbuff, L0, R1, L1, uv00, uv11, uv01, colour, alpha, trans_mat);

    // Left sloped face (y=-hy -> apex): quad L0-R0-RA-LA  => (L0,R0,RA) + (L0,RA,LA)
    vertex_buffer_write_triangle(vbuff, L0, R0, RA, uv00, uv10, uv11, colour, alpha, trans_mat);
    vertex_buffer_write_triangle(vbuff, L0, RA, LA, uv00, uv11, uv01, colour, alpha, trans_mat);

    // Right sloped face (y=+hy -> apex): quad R1-L1-LA-RA  => (R1,L1,LA) + (R1,LA,RA)
    vertex_buffer_write_triangle(vbuff, R1, L1, LA, uv00, uv10, uv11, colour, alpha, trans_mat);
    vertex_buffer_write_triangle(vbuff, R1, LA, RA, uv00, uv11, uv01, colour, alpha, trans_mat);

    // End caps (triangles in X)
    // X = -hx cap: L0, L1, LA
    vertex_buffer_write_triangle(vbuff, L0, L1, LA, uv00, uv10, uv11, colour, alpha, trans_mat);
    // X = +hx cap: R1, R0, RA
    vertex_buffer_write_triangle(vbuff, R1, R0, RA, uv00, uv10, uv11, colour, alpha, trans_mat);
}

/// @function InputButtonKeyboard
/// @param {real} button
/// @description Input for a keyboard key
function InputButtonKeyboard(button) : AbstractInputButton(button, eInputType.keyboard) constructor {

    /* Keyboard input handling goes here */

}


// ------------------------------------------------------------------------
// Debug-only macro guard for *use_fast_sampling* edits
// ------------------------------------------------------------------------
#macro FAST_SAMPLE_GUARD \
	if (use_fast_sampling) {                                                   \
		show_debug_message($"Error in instance: Can't edit fast-sampling instance!");\
		return true;                                                       \
	}
