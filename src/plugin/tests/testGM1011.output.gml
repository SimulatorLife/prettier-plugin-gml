var array_value = [];
var string_value = "demo";
var struct_value = {value: 1};
var function_value = function() {
    return 1;
};
var bool_value = true;
var number_value = 42;

if (!is_undefined(array_value)) {
    array_value[0] = 1;
}

if (!is_undefined(string_value)) {
    show_debug_message(string_value);
}

if (!is_undefined(struct_value)) {
    show_debug_message(struct_value.value);
}

if (!is_undefined(function_value)) {
    function_value();
}

if (bool_value) {
    show_debug_message(bool_value);
}

if (number_value) {
    show_debug_message(number_value);
}
