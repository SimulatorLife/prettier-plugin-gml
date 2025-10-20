/// @function scr_bezier_4
/// @param x1
/// @param y1
/// @param x2
/// @param y2
/// @param x3
/// @param y3
/// @param x4
/// @param y4
/// @param width
/// @param steps
/// @param color
/// @returns {undefined}
function scr_bezier_4(x1, y1, x2, y2, x3, y3, x4, y4, width, steps, color) {
    var w         = width;
    var step_size = 1 / steps;
    var xnet      = -1;
    var ynet      = -1;

    for (var i = 0; i <= 1; i+= step_size) {
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
    
        if (i > 0 and i < 1) {
            draw_circle_color(xx, yy, w - (i * 2), color, color, false);
        }
        if (i > 0) {
            draw_set_colour(color);
            draw_line_width(xnet, ynet, xx, yy, (2 * w) - (i * 4));
        }
        xnet = xx;
        ynet = yy;
    }
}
