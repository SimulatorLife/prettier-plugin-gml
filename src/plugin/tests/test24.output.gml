function make_struct(value) {
    var foo = {alpha: 1, "beta": value, gamma: call()};
    return foo;
}

function reuse_struct() {
    instance = {name: "example", "score": 42};
    do_something(instance);
}

function assign_then_extend() {
    data = {label: "ok", "value": 123};
    return data;
}
