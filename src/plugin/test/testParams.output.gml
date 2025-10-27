pe_fire.set_region(
    matrix_build(
        x, y - 7, sprite_top,
        0, 0, 0,
        1, 1, 1
    ),
    2, 2, 1,
    eSpartShape.Cylinder, ps_distr_gaussian
);

// Function call with an embedded function call with params
draw_custom_3d_model(
    undefined,
    buffer_from_vertex_buffer(
        vertex_buffer_create_triangular_prism(undefined, undefined, false)
    ),
    scr_matrix_build(
        round(x), round(y), round(z - 2),
        0, 0, 0,
        ceil(sprite_width), 8, max(ceil(sprite_height) * 2, 128) + 2
    )
);
