var test = 1;

var num = 10;
for (var i = 0; i < num; i++) {
    show_debug_message("Hello World " + string(i + 1));
}

/// @function clearSubdiv
static clearSubdiv = function() {
    // Clears any data structures related to the subdivision of the colmesh
    if (spHash >= 0) {
        var region = ds_map_find_first(spHash);
        while (!is_undefined(region)) {
            ds_list_destroy(spHash[? region]);
            region = ds_map_find_next(spHash, region);
        }
        ds_map_destroy(spHash);
        spHash = -1;
    }
};

var myWidth = 14;
var halfWidth = myWidth * 0.5;

enum eStates {
    STATE_IDLE = 0,
    STATE_WALK = 1,
    STATE_RUN = 2
}

var currState = eStates.STATE_IDLE;

/// @function changeState
/// @param [newState=eStates.STATE_IDLE]
function changeState(newState = eStates.STATE_IDLE) {
    currState = newState;
}

/*
This is a multi-line comment
It continues on this line
Woah, still going
Almost done!
*/

#macro is_debug_mode true

#region Enemy damage

var enemy = argument0;
var damage = argument1;
with (enemy) {
    self.hp -= damage;
    if (self.hp <= 0) {
        instance_destroy(self);
    }
}

#endregion

/// @function func_add
/// @param {real} n1
/// @param {real} n2
/// @description Add 2 numbers
function func_add(n1, n2) {
    return n1 + n2;
}

var myTemplateString = $"5 plus 7 is {func_add(5, 7)}";
show_debug_message(myTemplateString);

/// @function func_sub
/// @param n1
/// @param n2
/// @description Subtract 2 numbers
function func_sub(n1, n2) {
    return n1 - n2;
}

func_sub(0.5, 9);

var testStringShouldNotHaveLeadingZero = ".5";

var testComplicatedString = "This is a string with a \"quote\" in it";

// This is an inline comment without a space after the slashes
if (global.disableDraw) {
    exit;
}

if (
    is_debug_mode  // this is an inline comment
) {
    show_debug_message("Test console message");
}

while (true) {
    show_debug_message("Print statement within while loop");
}

repeat (2) {
    show_debug_message("Print statement within repeat loop");
}
