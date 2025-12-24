/// @function spawn_enemy
/// @description Spawn an enemy at a random position
/// @returns {Id.Instance} The created enemy instance
function spawn_enemy() {
    var spawn_x = irandom_range(50, room_width - 50);
    var spawn_y = irandom_range(50, room_height - 50);
    
    var enemy = instance_create_depth(spawn_x, spawn_y, 0, obj_enemy);
    enemy.hp = 100;
    enemy.speed_base = 2;
    
    return enemy;
}
