/// @description scr_bezier_4(x1, y1, x2, y2, x3, y3, x4, y4, width, steps, color)
/// @param  x1
/// @param  y1
/// @param  x2
/// @param  y2
/// @param  x3
/// @param  y3
/// @param  x4
/// @param  y4
/// @param  width
/// @param  steps
/// @param  color
function scr_bezier_4(argument0, argument1, argument2, argument3, argument4, argument5, argument6, argument7, argument8, argument9, argument10) {
	var x1 = argument0;
	var y1 = argument1;
	var x2 = argument2;
	var y2 = argument3;
	var x3 = argument4;
	var y3 = argument5;
	var x4 = argument6;
	var y4 = argument7;
	var w = argument8;
	var step_size = 1 / argument9;
	var color = argument10;

	var xnet = -1;
	var ynet = -1;
	for (var i = 0; i <= 1; i+= step_size)
	{
	    var x12 = lerp(x1, x2, i);
	    var y12 = lerp(y1, y2, i);
	    var x23 = lerp(x2, x3, i);
	    var y23 = lerp(y2, y3, i);
	    var x34 = lerp(x3, x4, i);
	    var y34 = lerp(y3, y4, i);
    
	    var x123 = lerp(x12, x23, i);
	    var y123 = lerp(y12, y23, i);
	    var x234 = lerp(x23, x34, i);
	    var y234 = lerp(y23, y34, i);
    
	    var xx = lerp(x123, x234, i);
	    var yy = lerp(y123, y234, i);
    
	    if (i > 0 and i < 1)
	        draw_circle_color(xx, yy, w-(i*2), color,color,false);
	    if (i > 0){
			draw_set_colour(color);
			draw_line_width(xnet, ynet, xx, yy, 2*w-(i*4));
		}
	    xnet = xx;
	    ynet = yy;
	}



}


/// @function scr_create_fx
/// @param sprite_index
/// @param {real} fx_x
/// @param {real} fx_y*
/// @param {real} [fx_z=0]
/// @param {Constant.Colour} [colour=c_white]
/// @param {function} *func_fx_callback - A function to call after the animation has completed
/// @description Create an effect
/// @returns {Id.Instance} instance
function scr_create_fx(sprite, fx_x, fx_y = undefined, fx_z = 0, func_fx_callback = undefined, colour = c_white) {
    gml_pragma("forceinline");

    if (!RELEASE) {
        if (!sprite_exists(sprite)) {
            throw "ERROR scr_create_fx: Sprite is required";
        }
    }

    return instance_create_layer(
        fx_x,
        fx_y,
        $"instances",
        obj_fx,
        {z : fx_z, sprite_index : sprite, func_callback : func_fx_callback, image_blend :  colour}
    );
}
