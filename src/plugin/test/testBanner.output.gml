/// @description Test for banner comment slash-count

// Banner comment
var value = 1;

// Comment
var message = "ready";

// Move camera
camUpdateTimer += timeStep;
if (camUpdateTimer >= 1 or fps < 70) { // Only update the mouse movement every 1/60th second
	var whWidth = window_get_width() * 0.5;
	var whHeight = window_get_height() * 0.5;
    var mousedx = window_mouse_get_x() - whWidth;
    var mousedy = window_mouse_get_y() - whHeight;
    window_mouse_set(whWidth, whHeight);
    camUpdateTimer = 0;
    camYaw += mousedx * 0.1;
    camPitch = clamp(camPitch - mousedy * 0.1, -80, -2);
}

// Orthogonalize the P2 direction to the vector from P1 to P3

/* 
 * The idea behind the algorithm is to imagine a sphere placed at P1 with radius of the first bone, and
 * another sphere at P3 with the radius of the second bone. The intersection between these spheres is a
 * circle representing all the possible placements of P2.
 * The first step is to find the middle point of this circle, and the radius of this intersection circle
 */

// eAIState

// Fall state