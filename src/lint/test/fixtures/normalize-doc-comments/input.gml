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
/// @description
function enrich_me2(alpha, beta = undefined) {
    return alpha + beta;
}

/// @arg test
/// @desc
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

/// @param {string} name Player display name should retain {string}.
/// @param {Struct.MyCustomStruct} custom Struct payload should retain namespaced type.
function typed_reorder(custom, name) {
    return;
}

/// @arg {Struct.MyCustomStruct} custom Main custom struct payload.
/// @argument {real} score Numeric score payload.
function typed_aliases(custom, score) {
    return;
}

/// @param {Struct.MyCustomStruct} custom Existing type should be preserved.
/// @param count Existing untyped param should remain valid.
function typed_and_untyped(custom, count) {
    return;
}

function no_returns_no_docs() {
    var x = 1;
    x += 1;
}

function bare_return_only() {
    return;
}

function explicit_undefined_return_only() {
    return undefined;
}

function returns_concrete_literal() {
    return 42;
}

function returns_concrete_in_branch(flag) {
    if (flag) {
        return 1;
    }

    return;
}

/// @returns {real}
function typed_returns_metadata() {
    return;
}

/// @return {Struct.MyCustomStruct}
function legacy_typed_return_alias() {
    return;
}

/// @returns {Struct.MyCustomStruct|undefined}
function typed_union_return_metadata() {
    return;
}

/// @param {real} [angle=90]
function update_movement_typed_return(angle = 90) {
    return angle;
}

/// @param [angle=90]
function update_movement_untyped_return(angle = 90) {
    return angle;
}

var assigned_returns_concrete = function () {
    return "ok";
};

function local_assignment_container(seed) {
    var assigned_returns_concrete_local = function () {
        return "ok";
    };

    var assigned_returns_undefined_local = function () {
        return;
    };

    var assigned_no_return_with_params = function (value, count = 2) {
        var total = value + count;
    };

    /// @function local_documented_alias
    /// @arg _value Local documented param should normalize.
    /// @return {real}
    var local_documented_alias = function (_value) {
        return _value;
    };

    /// @param second second description should remain.
    /// @custom local annotations should stay.
    /// @param {Struct.MyCustomStruct} [first=undefined] first typed description should remain.
    var local_documented_reorder = function (first = undefined, second) {
        return;
    };

    // @description local legacy docs should canonicalize
    // @arg amount
    var local_legacy_double_slash = function (amount) {
        return;
    };

    return seed;
}

var assigned_local_with_params = function (left, right = 10) {
    var total = left + right;
};

var assigned_local_with_explicit_undefined = function () {
    return undefined;
};

function build_enemy_struct(name, hp = 100) {
    return {
        name: name,
        hp: hp,
        heal: function (amount) {
            hp += amount;
        },
        label: function () {
            return string(name);
        }
    };
}

function EnemyConfig(_type, _speed = 4) : EntityConfig(_speed) constructor {
    type = _type;
    speed = _speed;
    setup = function (state) {
        current_state = state;
    };

    /// @override
    /// @function step
    /// @return {void}
    static step = function() {}
}
