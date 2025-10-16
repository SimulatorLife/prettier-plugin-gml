/// @function my_custom_struct
/// @param value
function my_custom_struct(_value) constructor {
    value = _value;
}

/// @function child_struct
/// @param foo
/// @param value
function child_struct(_foo, _value) : my_custom_struct(_value) constructor {
    self.foo = _foo;
    value = 0;

    /// @function print
    /// @returns {undefined}
    static print = function() {
        show_debug_message($"My foo is {self.foo}");
    };
}

/// @function grandchild_struct
/// @param foo
/// @param value
/// @param bar
function grandchild_struct(_foo, _value, _bar) : child_struct(_foo, _value) constructor {
    self.foo = _foo;
    value = 0;
    bar = _bar;

    /// @override
    /// @function print
    /// @returns {undefined}
    static print = function() {
        show_debug_message($"I'm a grandchild struct and my foo is {self.foo}");
    };
}

/// @function keep_separate
function keep_separate() {
    var foo = {};
    // the assignments below depend on runtime
    foo.bar = 1;
    foo.baz = 2;
    if (should_apply()) {
        foo.qux = 3;
    }
    return foo;
}

/// @function trailing_comment
function trailing_comment() {
    var stats = {
        hp: 100, // base health
        mp: 50
    };
    return stats;
}

/// @function dynamic_index
/// @param value
function dynamic_index(value) {
    var obj = {static_key: value};
    obj[$ get_key()] = value;
    return obj;
}

/// @function make_struct
/// @param value
function make_struct(value) {
    var foo = {alpha: 1, beta: value, gamma: call()};
    return foo;
}

/// @function reuse_struct
/// @returns {undefined}
function reuse_struct() {
    instance = {name: "example", score: 42};
    do_something(instance);
}

/// @function assign_then_extend
function assign_then_extend() {
    data = {label: "ok", value: 123};
    return data;
}
