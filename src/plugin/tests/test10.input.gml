function Shape() constructor {
	static print = function() {show_debug_message("I'm a shape")}

		//// @func freeze()
		static freeze = function()
		{
		//This will delete any geometry info contained within the mesh itself. It will not delete any geometry added to a ColMesh.
		//After a mesh has been frozen, it can no longer be added to a colmesh.
		triangles = [];
		ds_list_destroy(shapeList);
		}
}

function Circle(r) : Shape() constructor {
	self.r = r
     }

var myCircle    =     new   Circle(10)
var circle2 = new Circle(myCircle.r)



show_debug_message(myCircle.r)