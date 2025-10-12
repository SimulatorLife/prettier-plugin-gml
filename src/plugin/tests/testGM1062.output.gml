/// @function func
/// @param {array[string]} param1 - This is parameter 1
/// @param {string|array[string]} param2 - This is parameter 2
/// @param {Id.Instance} param3 - This is parameter 3
/// @description This is the description for this function. The description JSDoc tag must come
///              after the param tags and before the returns tag.
/// @returns {undefined}
function func(_param1, _param2, _param3) {
    show_debug_message("The parameters are: {0}, {1} and {2}", _param1, _param2, _param3);
}
