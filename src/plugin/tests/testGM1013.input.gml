var atk = 1;

with (other)
{
    hp -= atk;
    apply_damage(atk);
}

with (other)
{
    apply_damage(atk);
}
