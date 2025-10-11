some(
    thisArgumentIsQuiteLong,
    function foo(
        cool,
        f = function() {
            ez();
        }
    ) : bar() constructor {
        return cool;
    }
);

call(1, 2, 3, someFunctionCallWithBigArgumentsAndACallback, function(aaaaaaaaaaaaaaaaaa) {
    foo();
});

var myBar;
try {
    myBar = new bar();
} catch (e) {
    show_debug_message("Caught exception: " + string(e));
} finally {
    myBar = undefined;
}

my_func();
my_func(undefined);
my_func2(1, undefined);
my_func3(3, undefined, undefined, undefined, undefined, 5);
my_func4(undefined);

/// @function func_coords
/// @param [x=0]
/// @param [y=0]
/// @param [z=0]
function func_coords(x = 0, y = 0, z = 0) {
    return [x, y, z];
}

var myCoords = func_coords(10, undefined, 20);

/// @function Shape
/// @param [color]
function Shape(color = undefined) constructor {
    self.color = color;

    /// @function print
    static print = function() {
        show_debug_message("I'm a shape");
    };

    /// @function freeze
    /// @returns {undefined}
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
            group |= cmGroupSolid;  // Flag as solid
        } else {
            group &= ~cmGroupSolid;  // Remove solid flag
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

/// @function Oval
/// @param {real} [r1=1] - The horizontal radius of the oval
/// @param [r2=1]
function Oval(r1 = 1, r2 = 1) : Shape() constructor {
    self.r1 = r1;
    self.r2 = r2;
}

/// @function choose_profile
/// @param settings
/// @param fallback
function choose_profile(settings, fallback) {
    var config = settings ?? global.default_settings;
    var themeCandidate = config.theme_override ?? fallback.theme_override;
    var finalTheme = themeCandidate ?? global.theme_defaults;
    if (is_undefined(config ?? fallback)) {
        return "guest";
    }
    return (config.profile ?? fallback.profile) ?? "guest";
}

var best = choose_profile(undefined, {profile: "dev"});

// Feather disable all
/// .__Destroy()
///
/// .__FromBuffer(buffer)
///
/// .__CopyFromBuffer(buffer)
///
/// .__FromString(string, ...)
///
/// .__Delete(position, count)
///
/// .__Insert(position, string, ...)
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

/// @function __ChatterboxBufferBatch
function __ChatterboxBufferBatch() constructor {
    __destroyed  = false;
    __inBuffer   = undefined;
    __workBuffer = undefined;
    __outBuffer  = undefined;
    __commands   = [];

    /// @function __Destroy
    static __Destroy = function() {
        if (__destroyed) { return; }
        __destroyed = true;

        if (!is_undefined(__inBuffer)) {
            buffer_delete(__inBuffer);
            __inBuffer = undefined;
        }

        if (is_undefined(__inBuffer)) {
            __destroyed = true;
        }
    }
}

/// @function greet
/// @param [name="friend"]
/// @param [greeting="Hello"]
function greet(name = "friend", greeting = "Hello") {
    return (greeting + ", ") + name;
}

var message1 = greet();
var message2 = greet("Alice");
var message3 = greet("Bob", "Howdy");
var message4 = greet("Chaz");
var message5 = greet(undefined, "Welcome");
