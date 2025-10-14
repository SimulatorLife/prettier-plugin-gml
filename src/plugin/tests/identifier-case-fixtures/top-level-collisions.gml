globalvar globalValue;
globalValue = 1;

function global_value() {
    return globalValue;
}

var alias = global_value();
