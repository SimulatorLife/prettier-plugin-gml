/// Summary
/// @description legacy style line
///              Keep me
/// @param x
/// @returns {undefined}
function test(x) {}
/// @param a
/// @param [b=1]
function synth_me(_a, b = 1) {
    return _a + b;
}
/// @description Existing docs
/// @param alpha
/// @param beta
function enrich_me(alpha, beta) {
    return alpha + beta;
}
/// @param alpha
/// @param [beta]
function enrich_me2(alpha, beta = undefined) {
    return alpha + beta;
}
/// @param value
var build_struct = function (value) {
    return { value: value };
};
/// @param kind
/// @param [amount=1]
static step_once = function (_kind, amount = 1) {
    return amount;
};
/// @returns {undefined}
function func_undefined() {
    return undefined;
}
/// @param {function} [x]
var func_default_callback = function (x = function() { return 1; }) {
    return x();
};
/// @description Updates movement for the active player.
/// @param [angle=90] Current heading in degrees.
/// @customTag keep this custom metadata
/// @param speed The per-step speed scalar.
/// @returns {undefined}
function update_movement(angle = 90, speed) {
    return;
}
/// @param first first description should stay attached to first.
/// @internal custom annotation users may provide
/// @param second second description should stay attached to second.
/// @param third third description should stay attached to third.
/// @returns {undefined}
function reorder_with_descriptions(first, second, third) {
    return;
}
/// @deprecated use build_packet_v2
/// @param alpha Existing alpha description should stay attached.
/// @custom preserve me
/// @param [beta=4] Existing beta description should stay attached.
/// @returns {undefined}
var build_packet = function (alpha, beta = 4) {
    return;
};
/// @param {Struct.MyCustomStruct} custom Struct payload should retain namespaced type.
/// @param {string} name Player display name should retain {string}.
/// @returns {undefined}
function typed_reorder(custom, name) {
    return;
}
/// @param {Struct.MyCustomStruct} custom Main custom struct payload.
/// @param {real} score Numeric score payload.
/// @returns {undefined}
function typed_aliases(custom, score) {
    return;
}
/// @param {Struct.MyCustomStruct} custom Existing type should be preserved.
/// @param count Existing untyped param should remain valid.
/// @returns {undefined}
function typed_and_untyped(custom, count) {
    return;
}

/// @returns {undefined}
function no_returns_no_docs() {
    var x = 1;
    x += 1;
}

/// @returns {undefined}
function bare_return_only() {
    return;
}

/// @returns {undefined}
function explicit_undefined_return_only() {
    return undefined;
}

/// @returns {real}
function returns_concrete_literal() {
    return 42;
}

/// @param flag
function returns_concrete_in_branch(flag) {
    if (flag) {
        return 1;
    }

    return;
}

/// @returns {undefined}
function typed_returns_metadata() {
    return;
}

/// @returns {undefined}
function legacy_typed_return_alias() {
    return;
}

/// @returns {undefined}
function typed_union_return_metadata() {
    return;
}

var assigned_returns_concrete = function () {
    return "ok";
};
