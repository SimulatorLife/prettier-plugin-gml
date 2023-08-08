function Shape() {
	static print = function() {show_debug_message("I'm a shape")}
}

function Circle(r) : Shape() constructor {
	self.r = r
     }

var myCircle    =     new   Circle(10)
var circle2 = new Circle(myCircle.r)



show_debug_message(myCircle.r)