some(
    thisArgumentIsQuiteLong,
    function foo(
        cool,
        f = function() {
            ez();
        }
    ) : bar() constructor {
        return cool;
    }
);

call(
    1,
    2,
    3,
    someFunctionCallWithBigArgumentsAndACallback,
    function(aaaaaaaaaaaaaaaaaa) {
        foo();
    }
);

var myBar;
try {
    myBar = new bar();
} catch (e) {
    show_debug_message("Caught exception: " + string(e));
} finally {
    myBar = undefined;
}