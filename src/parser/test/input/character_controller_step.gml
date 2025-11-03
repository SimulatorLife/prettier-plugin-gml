// Movement
var is_on_ice = place_meeting(x,y,obj_ice);
var is_in_water = place_meeting(x,y, obj_water);
acceleration = orig_acceleration;

if collision_spd <= 0 {
    var _dir = input_direction("default", "left", "right", "up", "down");
    if _dir != "default" {
		if is_on_ice {
			acceleration = orig_acceleration*0.1
		}
		if is_in_water {
			acceleration = orig_acceleration*0.4;
			max_spd = orig_max_spd*0.666;
		} else max_spd = orig_max_spd
        if spd < max_spd {
            spd += acceleration*DELTA_TIME;

        } else spd -= 0.1*DELTA_TIME;
		if !is_on_ice {
        dir = _dir;
		} else {
		
		if dir_opposing(dir, _dir) {
			if spd < 0.4 dir = _dir;
			spd-=(acceleration+0.05)*DELTA_TIME;
		} else {
			var dir_x = (lengthdir_x(1,dir)*spd*8 + lengthdir_x(1,_dir))/(spd*8+1)
			var dir_y = (lengthdir_y(1,dir)*spd*8 + lengthdir_y(1,_dir))/(spd*8+1)
			dir = point_direction(0,0,dir_x, dir_y);
			
		}
		
		}
        if input_check_pressed("dash") and dash and !is_on_ice {
            dash_spd = dash_start_spd;
            dash = false;
            alarm[0] = dash_timeout;
        }
    } else if spd > 0 {
		if is_on_ice {
			spd -= 0.03
		} else {
			spd -= 0.3*DELTA_TIME;
		}
    }
    
    if dash_spd > 0 {
        dash_spd -= 0.4*DELTA_TIME;
    }
    
    if spd > 0 or dash_spd > 0 {
        collision = move(dir, spd + dash_spd);
    }
}

// Collision
if collision != false {
	show_debug_message(collision)
    if dash_spd > 2 {
		collision_spd = 8;
		spd = 0;
		dash_spd = 0;
		// Get the current x and y components of the direction
		var dir_x = lengthdir_x(1, dir);
		var dir_y = lengthdir_y(1, dir);
		
		if collision = "y" {
		// Switch the y component
		dir_y = -dir_y;
		}
		if collision = "x" {
		// Switch the x component
		dir_x = -dir_x;
		}
		if collision = "xy" {
		// Switch the x component
		dir_x = -dir_x;
		dir_y = -dir_y;
		}

		// Calculate the new direction
		var new_dir = point_direction(0, 0, dir_x, dir_y);
		
		collision_dir = new_dir
		collision = false;
		//uncomment this if you own the UC_camera addon
        //uc_shake(5);
    }
}

if collision_spd > 0 {
    move(collision_dir, collision_spd);
    collision_spd -= 0.5*DELTA_TIME;
}