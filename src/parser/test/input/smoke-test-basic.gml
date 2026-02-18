// Basic smoke test fixture for fast parser validation
// Covers key GML constructs without the size of real-world files

function simple_function(a, b) {
    return a + b;
}

function with_variables() {
    var x = 10;
    var y = 20;
    var sum = x + y;
    return sum;
}

function control_flow(condition) {
    if (condition) {
        return true;
    } else {
        return false;
    }
}

function loops() {
    for (var i = 0; i < 10; i++) {
        show_debug_message(i);
    }
    
    var j = 0;
    while (j < 5) {
        j++;
    }
}

function switch_statement(value) {
    switch (value) {
        case 1:
            return "one";
        case 2:
            return "two";
        default:
            return "other";
    }
}

enum TestEnum {
    VALUE_A,
    VALUE_B,
    VALUE_C
}

globalvar global_value;
global_value = 42;

// Constructor
function TestConstructor(_param) constructor {
    value = _param;
    
    static method = function() {
        return value * 2;
    };
}

// Array and struct literals
var arr = [1, 2, 3, 4, 5];
var obj = {
    prop1: "hello",
    prop2: 123,
    nested: {
        deep: true
    }
};

// String operations
var str = "test string";
var template = $"Value: {global_value}";

// Binary operations
var result = (10 + 20) * 30 / 5;
var logical = (true && false) || true;
var bitwise = (0xFF & 0x0F) | 0x10;
