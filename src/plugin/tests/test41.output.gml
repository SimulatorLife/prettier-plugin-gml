/// @function logical_example
function logical_example() {
    if ((foo && bar) || baz) {
        return foo && bar;
    }
    return foo || baz;
}
