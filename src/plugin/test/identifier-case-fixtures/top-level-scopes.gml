#macro MACRO_VALUE 1

globalvar global_value;
global_value = MACRO_VALUE;

function sample_function(initial_value) {
    return global_value + initial_value + MACRO_VALUE;
}

var function_result = sample_function(global_value);
var created_struct = new sample_struct(function_result);
