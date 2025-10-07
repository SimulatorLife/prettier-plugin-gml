/// @function convert_trig
/// @param angleDeg
/// @param ratioY
/// @param ratioX
function convert_trig(angleDeg, ratioY, ratioX) {
    var sin_radians = dsin(angleDeg);
    var cos_radians = dcos(angleDeg + 90);
    var tan_radians = dtan(-angleDeg);
    var asin_degrees = darcsin(ratioY);
    var atan_degrees = darctan(ratioY);
    var atan2_degrees = darctan2(ratioY, ratioX);
    var cos_to_rad = cos(angleDeg);
    var sin_to_rad = sin(angleDeg);
    var tan_to_rad = tan(angleDeg);
    var asin_to_rad = arcsin(ratioY);
    var acos_degrees = darccos(ratioY);
    var acos_to_rad = arccos(ratioY);
    var atan_to_rad = arctan(ratioY);
    var atan2_to_rad = arctan2(ratioY, ratioX + 1);
    return [
        sin_radians,
        cos_radians,
        tan_radians,
        asin_degrees,
        atan_degrees,
        atan2_degrees,
        cos_to_rad,
        sin_to_rad,
        tan_to_rad,
        asin_to_rad,
        acos_degrees,
        acos_to_rad,
        atan_to_rad,
        atan2_to_rad
    ];
}
