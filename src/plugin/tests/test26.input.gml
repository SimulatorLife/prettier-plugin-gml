function greet() {
        var name = argument_count > 0 ? argument[0] : "friend";
        var greeting = argument_count > 1 ? argument[1] : "Hello";
        return greeting + ", " + name;
}

var message1 = greet();;;
var message2 = greet("Alice");
var message3 = greet("Bob", "Howdy");
var message4 = greet("Chaz");
var message5 = greet(undefined, "Welcome");