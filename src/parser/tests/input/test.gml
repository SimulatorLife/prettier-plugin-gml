// Make sure the global logger is created before we try to log anything
gml_pragma("global", "variable_global_set(\"logger\", new DedupLogger())");

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