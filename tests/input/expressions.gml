a = {
	b: function () {
		return {
            c: [
                function() {return "bro"}, 
                {d: "foo"}
            ],
        }
	}
};

((a.b)().c[1].d) = "bar"; 
((a.b)().c[1].d)++; 

show_debug_message(
	(a.b().c[0])()
);

function foo(a) : bar(b = a) constructor {}

(function thing() constructor {
	show_debug_message("hello!");
})();