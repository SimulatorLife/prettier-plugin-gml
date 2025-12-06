/// @function sample
/// @param first
/// @param second
/// @param argument2
/// @description Function with skipped argument indices
/// @returns {string}
function sample() {
    var first = argument0;
    var second = argument1;
    return $"{first}, {second}, {argument2}";
}

/// @function sample2
/// @param zero
/// @param first
/// @param two
/// @param three
/// @param argument4
/// @description Documented arguments can be inferred from unnamed arguments
function sample2() {
    var first = argument1;
    var three = argument3;
    var zero = argument0;
    var two = argument2;
    return three + argument4;
}

/// @function sample3
/// @param zero
/// @param one
/// @param two
/// @param three
/// @description Unnamed arguments can be safely promoted into named arguments
function sample3(zero, one, two, three) {
    return $"{zero}, {one}, {two}, {three}";
}

/// @function sample4
/// @param argument0
/// @param argument1
/// @param argument2
/// @description Missing argument documentation leaves all arguments unnamed
/// @returns {string}
function sample4() {
    return $"{argument0}, {argument1}, {argument2}";
}