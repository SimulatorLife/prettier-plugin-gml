lst_instances = ds_list_create();

if (instance_place_list(x, y, obj_enemy, lst_instances, true))
{
    var _ins = lst_instances[? 0];
    show_debug_message(_ins);
}
