/// @function update_state
/// @param flag
function update_state(flag) {
    var state = 0;

    if (flag) {
        state = "ready";
    }

    return state;
}
