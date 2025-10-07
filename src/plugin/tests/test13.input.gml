function my_custom_struct(_value) constructor
{
	value = _value;
}

function child_struct(_foo, _value) : my_custom_struct(_value) constructor {
	self.foo = _foo;
	value = 0;
}

/// @function
/// @param [_bar=0]
function grandchild_struct(_foo, _value, _bar) : child_struct(_foo, _value) constructor {
	self.foo = _foo;
	value = 0;
	bar = _bar;
}