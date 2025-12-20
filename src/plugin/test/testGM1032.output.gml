/// @description Function with skipped argument indices
/// @param first
/// @param second
/// @param argument2
/// @returns {string}
function sample() {
    var first = argument0;
    var second = argument1;
    return $"{first}, {second}, {argument2}";
}

/// @description Documented arguments can be inferred from unnamed arguments
/// @param zero
/// @param first
/// @param two
/// @param three
/// @param argument4
function sample2() {
    var first = argument1;
    var three = argument3;
    var zero  = argument0;
    var two   = argument2;
    return three + argument4;
}

/// @description Unnamed arguments can be safely promoted into named arguments
/// @param zero
/// @param one
/// @param two
/// @param three
function sample3(zero, one, two, three) {
    return $"{zero}, {one}, {two}, {three}";
}

/// @description Missing argument documentation leaves all arguments unnamed
/// @param argument0
/// @param argument1
/// @param argument2
/// @returns {string}
function sample4() {
    return $"{argument0}, {argument1}, {argument2}";
}
