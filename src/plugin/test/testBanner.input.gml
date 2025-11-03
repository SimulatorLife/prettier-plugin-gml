// @description Test for banner comment slash-count

//////// Banner comment
var value = 1


// Comment that is under the banner threshold
var message = "ready";

////////////////////////////////////////
//-------------------Move camera-----------------------//
////////////////////////////////////
camUpdateTimer += timeStep;
if (camUpdateTimer >= 1 || fps < 70) //Only update the mouse movement every 1/60th second
{
	var mousedx = window_mouse_get_x() - window_get_width() / 2;
	var mousedy = window_mouse_get_y() - window_get_height() / 2;
	window_mouse_set(window_get_width() / 2, window_get_height() / 2);
	camUpdateTimer = 0;
	camYaw += mousedx * .1;
	camPitch = clamp(camPitch - mousedy * .1, -80, -2);
}