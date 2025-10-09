/// @function example
/// @param foo
/// @param [bar=0]
/// @param baz
function example(_foo, _bar = 0, _baz) {
    var sum = _foo + _bar;

    function inner(_value, _other) {
        return _value + _other;
    }

    return (_baz + sum) + _foo;
}
