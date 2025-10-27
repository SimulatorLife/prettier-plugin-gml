function demo(target) {
    var counter_value = 1;
    var preserve_me = 2;
    var ignore_temp = 3;
    var foo_bar = target;
    var fooBar = target + counter_value;

    counter_value += preserve_me;
    counter_value += ignore_temp;
    counter_value += foo_bar;
    counter_value += fooBar;

    return counter_value;
}
