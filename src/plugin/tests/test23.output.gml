/// @function greet
/// @param [name="friend"]
/// @param [greeting="Hello"]
function greet(name = "friend", greeting = "Hello") {
    return (greeting + ", ") + name;
}

var message1 = greet();
var message2 = greet("Alice");
var message3 = greet("Bob", "Howdy");
var message4 = greet("Chaz");
var message5 = greet(undefined, "Welcome");
