/// @description Set zmodel

image_yscale = BILLBOARD_PROP_YSCALE;

// Inherit the parent event
event_inherited();

// Define zmodel
var mat = scr_matrix_build(x, y, z, xrotation, yrotation, image_angle, image_xscale, image_yscale, image_zscale);
zmodel = new ZModelBufferSprite(sprite_index, undefined, mat, image_blend, image_alpha);
