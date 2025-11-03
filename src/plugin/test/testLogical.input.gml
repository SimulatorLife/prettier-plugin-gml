/// @function scr_logic_absorption_or
/// @param {bool} foo
/// @param {bool} bar
/// @description Absorption law: (foo or (foo and bar)) == foo.
/// @returns {bool}
function scr_logic_absorption_or(foo, bar){
    if (foo or (foo and bar)) {
        return true;
    }
    return false;
}

/// @function bool_with_extra
/// @param condition
function bool_with_extra(condition) {
    if (condition) {
        return true;
        condition += 1;
    } else {
        return false;
    }
}

/// @function scr_logic_absorption_and
/// @param {bool} foo
/// @param {bool} bar
/// @description Absorption law: (foo and (foo or bar)) == foo.
/// @returns {bool}
function scr_logic_absorption_and(foo, bar){
    if (foo and (foo or bar)) {
        return true;
    }
    return false;
}

/// @function scr_logic_factor_shared_and
/// @param {bool} foo
/// @param {bool} bar
/// @param {bool} baz
/// @description Distributive factoring: (foo and bar) or (foo and baz) == foo and (bar or baz).
/// @returns {bool}
function scr_logic_factor_shared_and(foo, bar, baz){
    if ((foo and bar) or (foo and baz)) {
        return true;
    }
    return false;
}

/// @function scr_logic_factor_shared_or
/// @param {bool} foo
/// @param {bool} bar
/// @description Consensus simplification: (foo and bar) or (!foo and bar) == bar.
/// @returns {bool}
function scr_logic_factor_shared_or(foo, bar){
    if ((foo and bar) or (!foo and bar)) {
        return true;
    }
    return false;
}

/// @function scr_logic_xor_equivalent
/// @param {bool} foo
/// @param {bool} bar
/// @description XOR equivalence: (foo and !bar) or (!foo and bar).
/// @returns {bool}
function scr_logic_xor_equivalent(foo, bar){
    if ((foo and !bar) or (!foo and bar)) {
        return true;
    }
    return false;
}

/// @function scr_logic_guard_extraction
/// @param {bool} foo
/// @param {bool} bar
/// @param {bool} baz
/// @param {bool} qux
/// @description Guard extraction: (foo and qux) or (bar and qux) or (baz and qux).
/// @returns {bool}
function scr_logic_guard_extraction(foo, bar, baz, qux){
    if ((foo and qux) or (bar and qux) or (baz and qux)) {
        return true;
    }
    return false;
}

/// @function scr_logic_implication_form
/// @param {bool} foo
/// @param {bool} bar
/// @description Implication: if (foo) return bar; else return true.
/// @returns {bool}
function scr_logic_implication_form(foo, bar){
    if (foo) {
        return bar;
    }
    return true;
}

/// @function scr_logic_demorgan_and
/// @param {bool} foo
/// @param {bool} bar
/// @description De Morgan’s law: !(foo or bar) == !foo and !bar.
/// @returns {bool}
function scr_logic_demorgan_and(foo, bar){
    if (!(foo || bar)) {
        return true;
    }
    return false;
}

/// @function scr_logic_demorgan_or
/// @param {bool} foo
/// @param {bool} bar
/// @description De Morgan’s law: !(foo and bar) == !foo or !bar.
/// @returns {bool}
function scr_logic_demorgan_or(foo, bar){
    if (!(foo && bar)) {
        return true;
    }
    return false;
}

/// @function scr_logic_branch_collapse
/// @param {bool} foo
/// @param {bool} bar
/// @param {bool} baz
/// @description Original multi-branch: if (foo and bar or baz) return (foo and bar); else return (foo or baz).
/// @returns {bool}
function scr_logic_branch_collapse(foo, bar, baz){
    if (foo and bar or baz) {
        return foo and bar;
    }
    return foo or baz;
}

/// @function scr_logic_mixed_reduction
/// @param {bool} foo
/// @param {bool} bar
/// @param {bool} baz
/// @description Multi-clause reduction: (foo or bar) and (!foo or baz) and (!bar or baz).
/// @returns {bool}
function scr_logic_mixed_reduction(foo, bar, baz){
    if ((foo or bar) and (!foo or baz) and (!bar or baz)) {
        return true;
    }
    return false;
}


function logical_example(foo , bar, baz) {
    if(foo&&bar||baz){
        return foo && bar;
    }
    return foo || baz;
}

/// @function scr_nearest_power_of_2
/// @param {real} value - The real number to find the nearest power of 2 for.
/// @description Takes a real number and returns the nearest power of 2, including negative powers for negative values.
/// @returns {real} The nearest power of 2
function scr_nearest_power_of_2(value) {
    // Ensure the value is not zero, as log2(0) is undefined
    if (value == 0) { return 0; }

    // Find the nearest power of 2 by rounding the logarithm base 2 of the absolute value
    // Use sign to handle both positive and negative values
    return power(2, round(log2(abs(value)))) * sign(value);
}
