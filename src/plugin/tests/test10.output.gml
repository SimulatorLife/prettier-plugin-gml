/// @function Shape
/// @param [color]
function Shape(color = undefined) constructor {
    self.color = color;

    /// @function print
    static print = function() {
        show_debug_message("I'm a shape");
    };

    /// @function freeze
    static freeze = function() {
        // This will delete any geometry info contained within the mesh itself.
        // It will not delete any geometry added to a ColMesh.
        // After a mesh has been frozen, it can no longer be added to a colmesh.
        triangles = [];
        ds_list_destroy(shapeList);
    };

    /// @function setSolid
    /// @param solid
    static setSolid = function(solid) {
        if (solid) {
            group |= cmGroupSolid; // Flag as solid
        } else {
            group &= ~cmGroupSolid; // Remove solid flag
        }
    };
}

/// @function Circle
/// @param {real} r -  The radius of the circle
function Circle(r) : Shape() constructor {
    self.r = r;
}

var myCircle = new Circle(10);
var circle2 = new Circle(myCircle.r);

show_debug_message(myCircle.r);

/// @param {real} [r1=1] - The horizontal radius of the oval
/// @param [r2=1]
function Oval(r1 = 1, r2 = 1) : Shape() constructor {
	self.r1 = r1
	self.r2 = r2
	 }
