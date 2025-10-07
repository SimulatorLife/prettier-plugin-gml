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

function trailing_comment() {
    var stats = {};
    stats.hp = 100; // base health
    stats.mp = 50;
    return stats;
}

function dynamic_index(value) {
    var obj = {};
    obj[$ "static_key"] = value;
    obj[$ get_key()] = value;
    return obj;
}
