/// @function player_movement
/// @description Handle player movement input and update position
/// @returns {undefined}
function player_movement() {
    var move_speed = 5;
    var move_x = 0;
    var move_y = 0;
    
    if (keyboard_check(vk_left)) {
        move_x = -move_speed;
    }
    
    if (keyboard_check(vk_right)) {
        move_x = move_speed;
    }
    
    if (keyboard_check(vk_up)) {
        move_y = -move_speed;
    }
    
    if (keyboard_check(vk_down)) {
        move_y = move_speed;
    }
    
    x += move_x;
    y += move_y;
}
