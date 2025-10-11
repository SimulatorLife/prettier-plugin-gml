some(
    thisArgumentIsQuiteLong,
    function foo(cool, f=function(){ez()}) : bar() constructor {
        return cool
    }
)

call(1,2,3, someFunctionCallWithBigArgumentsAndACallback, function(aaaaaaaaaaaaaaaaaa){foo()})

var myBar;
try{
myBar = new bar();
}catch(e){
show_debug_message("Caught exception: " + string(e));
}finally{myBar = undefined}


my_func();
my_func(undefined);
my_func2(1,);
my_func3(3,,,,,5);
my_func4(,);

function func_coords(x = 0, y = 0, z = 0) {
	return [x, y, z]
}

var myCoords = func_coords(10,,20);

/// @private
/// @function Shape
/// @description Base class for all shapes. Shapes can be solid or not solid.
///              Solid shapes will collide with other solid shapes, and
///              non-solid shapes will not collide with anything.
function Shape(color = undefined) constructor {
	self.color = color;
	static print = function() {show_debug_message("I'm a shape")}

		//// @func freeze()
		/// @return {void}
		static freeze = function()
		{
		//This will delete any geometry info contained within the mesh itself. It will not delete any geometry added to a ColMesh.
		//After a mesh has been frozen, it can no longer be added to a colmesh.
		triangles = [];
		ds_list_destroy(shapeList);
		}

	static setSolid = function(solid) {
		if solid {
			group |= cmGroupSolid // Flag as solid
		} else {
			group &= ~cmGroupSolid // Remove solid flag
		}
	};
	
}

/// @param {real} r -  The radius of the circle
function Circle(r) : Shape() constructor {
	self.r = r
     }

var myCircle    =     new   Circle(10)
var circle2 = new Circle(myCircle.r)



show_debug_message(myCircle.r)

/// @param {real} r1 - The horizontal radius of the oval
function Oval(r1 = 1, r2 = 1) : Shape() constructor {
   self.r1 = r1
    self.r2 = r2
	 }

function choose_profile(settings, fallback = undefined){
var config=settings??global.default_settings
var themeCandidate=config.theme_override??fallback.theme_override;
var finalTheme=themeCandidate??global.theme_defaults
if((config??fallback)==undefined){ return "guest" }
return (config.profile??fallback.profile)??"guest"
}
var best = choose_profile(undefined , {   profile:"dev"});


// Feather disable all
// / .__Destroy()
///
// / .__FromBuffer(buffer)
///
// / .__CopyFromBuffer(buffer)
// / 
// / .__FromString(string, ...)
/// 
/// .__Delete(position, count)
/// 
//  / .__Insert(position, string, ...)
/// 
/// .__Overwrite(position, string, ...)
/// 
/// .__Prefix(string, ...)
/// 
/// .__Suffix(string, ...)
/// 
/// .__GetString()
/// 
/// .__GetBuffer()

function __ChatterboxBufferBatch() constructor
{
    __destroyed = false;
    __inBuffer = undefined;
    __workBuffer = undefined;
    __outBuffer = undefined;
    __commands = [];
    
    
    
    static __Destroy = function()
    {
        if (__destroyed) return;
        __destroyed = true;
        
        if (__inBuffer != undefined)
        {
            buffer_delete(__inBuffer);
            __inBuffer = undefined;
        }

        if (__inBuffer == undefined)
        {
            __destroyed = true;
        }
    }
}

function greet() {
        var name = argument_count > 0 ? argument[0] : "friend";
        var greeting = argument_count > 1 ? argument[1] : "Hello";
        return greeting + ", " + name;
}

var message1 = greet();;;
var message2 = greet("Alice");
var message3 = greet("Bob", "Howdy");
var message4 = greet("Chaz");
var message5 = greet(undefined, "Welcome");




/// @param {real} [multiplier] - The multiplier to apply to the light direction
/// @param {array<real>} [light_dir=[0, 0, -1]] - The direction of the light
function handle_lighting(multiplier = undefined, light_dir = [0, 0, -1]) {
    var dir = light_dir;
    var length = sqrt(dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]);
    if (!is_undefined(multiplier)) {
        length *= multiplier;
    }
    if (length != 0) {
        dir[0] /= length;
        dir[1] /= length;
        dir[2] /= length;
    }
    return dir;
}