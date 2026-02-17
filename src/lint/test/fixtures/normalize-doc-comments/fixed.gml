/// Summary
/// @description legacy style line
/// Keep me
/// @param x
/// @returns {undefined}
function test(x) {}
/// @description synth_me
/// @param a
/// @param b
/// @returns {undefined}
function synth_me(_a, b = 1) {
    return _a + b;
}
/// @description Existing docs
/// @param alpha
/// @param beta
/// @returns {undefined}
function enrich_me(alpha, beta) {
    return alpha + beta;
}
/// @description build_struct
/// @param value
/// @returns {undefined}
var build_struct = function (value) {
    return { value: value };
};
/// @description step_once
/// @param kind
/// @param amount
/// @returns {undefined}
static step_once = function (_kind, amount = 1) {
    return amount;
};
