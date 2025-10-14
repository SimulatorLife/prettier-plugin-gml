draw_primitive_begin(pr_trianglelist);
/// Draw Event

draw_vertex(room_width / 4, room_height / 4);
draw_vertex(room_width * 0.5, room_height / 4);
draw_vertex(room_width / 4, room_height * 0.5);

draw_primitive_end();
