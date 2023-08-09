function my_custom_struct(_value) constructor {
	value = _value;
}

function child_struct(_foo, _value) : my_custom_struct(_value) constructor {
	self.foo = _foo;
	value = 0;
}