///Summary
// @description legacy style line
/// @description
/// Keep me
/// @param x
function test(x) {}
function synth_me(_a, b = 1) {
    return _a + b;
}
/// @description Existing docs
function enrich_me(alpha, beta) {
    return alpha + beta;
}
/// @arg _alpha
/// @arg _beta
function enrich_me2(alpha, beta = undefined) {
    return alpha + beta;
}
/// @arg test
/// @returns {undefined}
var build_struct = function (value) {
    return { value: value };
};
/// @function step_once
static step_once = function (_kind, amount = 1) {
    return amount;
};
/// @function func_undefined()
function func_undefined() {
    return undefined;
}
var func_default_callback = function (x = function() { return 1; }) {
    return x();
};

/// @description Updates movement for the active player.
/// @param speed The per-step speed scalar.
/// @customTag keep this custom metadata
/// @param [angle=90] Current heading in degrees.
/// @function update_movement
function update_movement(angle = 90, speed) {
    return;
}

/// @param second second description should stay attached to second.
/// @internal custom annotation users may provide
/// @param first first description should stay attached to first.
/// @param third third description should stay attached to third.
function reorder_with_descriptions(first, second, third) {
    return;
}

/// @function build_packet
/// @deprecated use build_packet_v2
/// @param [beta=4] Existing beta description should stay attached.
/// @custom preserve me
/// @param alpha Existing alpha description should stay attached.
var build_packet = function (alpha, beta = 4) {
    return;
};
