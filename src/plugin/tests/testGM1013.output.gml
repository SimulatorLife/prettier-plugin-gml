atk = 1;

with (other) {
    hp -= other.atk;
    apply_damage(other.atk);
}

with (other) {
    apply_damage(other.atk);
}
