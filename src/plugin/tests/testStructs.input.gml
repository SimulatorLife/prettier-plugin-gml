function my_custom_struct(_value) constructor
{
	value = _value;
}

function child_struct(_foo, _value) : my_custom_struct(_value) constructor {
	self.foo = _foo;
	value = 0;

    /// @method print
    /// @returns {void}
    static print = function() {
        show_debug_message($"My foo is {self.foo}");
    }

    /// @function generate
    /// @returns {undefined}
    /// @description Each time this is called, create new map
    static generate = function() {
        points = poisson_disk_sample(width, height, point_space);
        create_nodes_from_points();
        remove_ellipse();
    };

    /// @function remove_ellipse
	/// @description Remove all nodes outside of ellipse
	static remove_ellipse = function(){
		for (var i = 0; i < array_length(nodes); i++) {
		    if !collision_ellipse(0, 0, width, height, nodes[i], false, true) {
				instance_destroy(nodes[i]);
			}
		}
	}


    /// @function draw_points
    /// @returns {undefined}
    /// @description Draw points in array for debugging
    /// @returns {undefined}
    /// @description
    static draw_points = function() {
        var num_points = array_length(points);
        for (var i = 0; i < num_points; i++) {
            draw_circle(points[i].x, points[i].y, 2, false);
        }
    };




}

/// @function
/// @param [_bar=0]
function grandchild_struct(_foo, _value, _bar) : child_struct(_foo, _value) constructor {
	self.foo = _foo;
	value = 0;
	bar = _bar;

    static print = function() {
        show_debug_message($"I'm a grandchild struct and my foo is {self.foo}");
    }
}

// Print function with different scope 
var print = function() {
    show_debug_message("This is a different print function");
};
function keep_separate() {
    var foo = {};
    // the assignments below depend on runtime
    foo.bar = 1;
    foo.baz = 2;
    if (should_apply()) {
        foo.qux = 3;
    }
    return foo;
}

function trailing_comment() {
    var stats = {};
    stats.hp = 100; // base health
    stats.mp = 50;
    return stats;
}

function dynamic_index(value) {
    var obj = {};
    obj[$ "static_key"] = value;
    obj[$ get_key()] = value;
    return obj;
}


/// @function make_struct(value)
function make_struct(value) {
var foo = {};
foo.alpha = 1;
foo[$ "beta"] = value;
foo.gamma = call();
return foo;
}

function reuse_struct() {
instance = {};
instance.name = "example";
instance[$ "score"] = 42;
do_something(instance);
}

function assign_then_extend() {
data = {};
data.label = "ok";
data[$ "value"] = 123;
return data;
}
