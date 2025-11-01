/// @description Test for banner comment slash-count

//////////// Banner comment ////////////
var value = 1;

// Comment that is under the banner threshold
var message = "ready";

///////////// Move camera //////////////
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
