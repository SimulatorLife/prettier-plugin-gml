/// @function build_struct
/// @param value
function build_struct(value) {
    var foo = {};
    foo.alpha = 1;
    foo[$ "beta"] = value;
    foo.gamma = call();
    return foo;
}
