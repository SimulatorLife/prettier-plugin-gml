/// @function calculate_damage
/// @description Calculate damage based on attack power and defense
/// @param {real} attack_power - The attacking unit's power
/// @param {real} defense - The defending unit's defense rating
/// @returns {real} The final damage amount
function calculate_damage(attack_power, defense) {
    var base_damage = attack_power;
    var damage_reduction = defense * 0.5;
    var final_damage = max(1, base_damage - damage_reduction);
    
    return final_damage;
}
