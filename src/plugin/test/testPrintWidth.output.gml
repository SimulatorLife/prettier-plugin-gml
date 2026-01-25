collider = new ColmeshColliderCapsule(x, y, z, 0, 0, 1, radius, radius * 2, 0, function(o) {
    if (
        instance_exists(o) &&
        o.actor_take_damage_type(damage_type, bonus_damage) &&
        is_destroyed_on_hit
    ) {
        instance_destroy();
    }
});
