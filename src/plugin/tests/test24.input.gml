function convert_trig(angleDeg, ratioY, ratioX) {
var sin_radians = sin(degtorad(angleDeg));
var cos_radians = cos( degtorad( angleDeg+90 ) );
var tan_radians = tan(degtorad(-angleDeg));
var asin_degrees = radtodeg(arcsin(ratioY));
var atan_degrees = radtodeg(arctan(ratioY));
var atan2_degrees = radtodeg(arctan2(ratioY,ratioX));
var cos_to_rad = degtorad(dcos(angleDeg));
var sin_to_rad = degtorad(dsin(angleDeg));
var tan_to_rad = degtorad(dtan(angleDeg));
var asin_to_rad = degtorad(darcsin(ratioY));
var acos_degrees = radtodeg(arccos(ratioY));
var acos_to_rad = degtorad(darccos(ratioY));
var atan_to_rad = degtorad(darctan(ratioY));
var atan2_to_rad = degtorad(darctan2(ratioY, ratioX + 1));
return [sin_radians,cos_radians,tan_radians,asin_degrees,atan_degrees,atan2_degrees,cos_to_rad,sin_to_rad,tan_to_rad,asin_to_rad,acos_degrees,acos_to_rad,atan_to_rad,atan2_to_rad];
}
