/// @description Adds a custom function that can be called by expressions

// /              Custom functions can return values, but they should be numbers or strings.
// /                  GML:    ChatterboxLoadFromFile("example.json");
///                          ChatterboxAddFunction("AmIDead", am_i_dead);

// /                  Yarn:   Am I dead?
// / if AmIDead("player")
///                              Yup. Definitely dead.

// / else
// /                              No, not yet!
// / endif
// /              This example shows how the script am_i_dead() is called by Chatterbox in an if statement. The value
// /              returned from am_i_dead() determines which text is displayed.
// /              Parameters for custom functions executed by Yarn script should be separated by spaces. The parameters
// /              are passed into the given function as an array of values as argument0.
// /              Custom functions can be added at any point but should be added before loading in any source files.
/// @param name Script name; as a string
/// @param function Function to call
///
/// @returns {undefined}
function ChatterboxAddFunction(_name, _function) {
        // Implementation goes here
}
