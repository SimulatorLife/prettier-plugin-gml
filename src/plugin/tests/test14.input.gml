if (headerText != "ColMesh v4")
{
    return false;
}

switch(cannonball_type)
{
case obj_cannonball_beachball:
sprite_index = spr_cannonball_beachball;
break;
case obj_cannonball_bomb:
sprite_index = spr_cannonball_bomb;
break;
default:
sprite_index = noone;
break;
}