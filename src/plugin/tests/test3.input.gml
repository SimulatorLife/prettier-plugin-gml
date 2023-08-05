#macro is_debug_mode true

#region Enemy damage

var enemy = argument0; var damage = argument1

with(enemy)
{

	  self.hp-=damage
	if self.hp<=0 {instance_destroy(self)}
}

#endregion

///@func func_add
/// @Arg {Real} n1
/// @Arg {Real} n2
/// @description Add 2 numbers
function func_add(n1, n2) {
    return n1 + n2;
}

var myTemplateString = $"5 plus 7 is {func_add(5, 7)}";
show_debug_message(myTemplateString);

/// @function func_sub(n1, n2)
/// @desc Subtract 2 numbers
function func_sub(n1, n2) {
    return n1 - n2;
}
func_sub(.5, 9);

var testStringShouldNotHaveLeadingZero = ".5";

var testComplicatedString = "This is a string with a \"quote\" in it";

//This is an inline comment without a space after the slashes
if global.disableDraw{exit;}

if is_debug_mode//this is an inline comment
{
show_debug_message("Test console message");
}

while true
{show_debug_message("Print statement within while loop");
    
}

repeat 2 {
    show_debug_message("Print statement within repeat loop");
}