var _condition = false;

/// @function check
/// @param localValue
function check(localValue) {
    var counter = 0;
    if (localValue) {
        localValue = counter + 1;
    }

    counter = counter + localValue;
    return localValue + counter;
}

if (_condition) {
    _condition = true;
}
