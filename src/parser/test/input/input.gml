    #region Tick functions
    
    static tick = function()
    {
        //Update our "connected" variable
        if (__ghost)
        {
            __connected = true;
            __post_disconnection_tick = false;
        }
        else
        {
            __connected = false;
            
            var _i = 0;
            repeat(array_length(__source_array))
            {
                if (__source_array[_i].__is_connected())
                {
                    __connected = true;
                    __post_disconnection_tick = false;
                    break;
                }
                
                ++_i;
            }
        }
        
        //Do one tick after disconnection to clear out verb state
        if (!__post_disconnection_tick)
        {
            //Make sure to tick binding scan first
            //This'll catch disconnection if and when it happens
            if (__rebind_state > 0) __tick_binding_scan();
            
            //Clear the momentary state for all verbs
            var _v = 0;
            repeat(array_length(__global.__all_verb_array))
            {
                __verb_state_dict[$ __global.__all_verb_array[_v]].__clear();
                ++_v;
            }
            
            __input_player_tick_sources(self);
            
            //Update our basic verbs first
            tick_basic_verbs();
            
            //Update our chords
            //We directly access verb values to detect state here
            tick_chord_verbs();
            
            __cursor.__tick();
            
            __tick_vibration();
            
            if (!__connected) __post_disconnection_tick = true;
        }
    }
    
    static tick_basic_verbs = function()
    {
        var _v = 0;
        repeat(array_length(__global.__basic_verb_array))
        {
            __verb_state_dict[$ __global.__basic_verb_array[_v]].tick(__verb_group_state_dict, __active);
            ++_v;
        }
    }
    
    static tick_chord_verbs = function()
    {
        var _i = 0;
        repeat(array_length(__global.__chord_verb_array))
        {
            var _chord_name = __global.__chord_verb_array[_i];
            if (__chord_state_dict[$ _chord_name].__evaluate(__verb_state_dict))
            {
                with(__verb_state_dict[$ _chord_name])
                {
                    value = 1;
                    raw   = 1;
                    tick();
                }
            }
            else
            {
                __verb_state_dict[$ _chord_name].tick();
            }
            
            ++_i;
        }
    }
    
    static __tick_vibration = function()
    {
        if (__connected && (__global.__source_mode != INPUT_SOURCE_MODE.MIXED) && (__global.__source_mode != INPUT_SOURCE_MODE.MULTIDEVICE)) //Don't vibrate if we're likely to have multiple gamepads assigned
        {
            var _gamepad_index = __source_get_gamepad();
            if (_gamepad_index < 0) return;
            
            var _not_paused = !__vibration_paused;
            var _left  = 0;
            var _right = 0;
            
            var _time_step = __input_get_time() - __input_get_previous_time();
            var _array = __vibration_event_array;
            var _i = 0;
            repeat(array_length(_array))
            {
                with(_array[_i])
                {
                    if (_not_paused || __force)
                    {
                        var _result = __tick(_time_step);
                        _left  += __output_left;
                        _right += __output_right;
                    }
                    else
                    {
                        var _result = true;
                    }
                }
                
                if (_result)
                {
                    ++_i;
                }
                else
                {
                    array_delete(_array, _i, 1);
                }
            }
            
            __global.__gamepads[_gamepad_index].__vibration_set(__vibration_strength*_left, __vibration_strength*_right);
        }
    }
    
    static __color_set = function(_color)
    {        
        var _i = 0;
        repeat(array_length(__source_array))
        {
            if (__source_array[_i].__source == __INPUT_SOURCE.GAMEPAD)
            {
                with __global.__gamepads[__source_array[_i].__gamepad] __color_set(_color);
            }   
            
            ++_i;
        }
        
        __color = _color;
    }
    
    static __tick_binding_scan = function()
    {
        #region Error checking
        
        //if (!input_window_has_focus())
        //{
        //    __input_trace("Binding scan failed: Game lost focus");
        //    __binding_scan_failure(INPUT_BINDING_SCAN_EVENT.LOST_FOCUS);
        //    return ;
        //}
        
        var _source_filter = __rebind_source_filter ?? __source_array;
        
        if (__source_contains(INPUT_TOUCH, false))
        {
            __input_trace("Binding scan failed: Player ", __index, " is using INPUT_TOUCH which cannot be rebound");
            __binding_scan_failure(INPUT_BINDING_SCAN_EVENT.SOURCE_INVALID);
            return;
        }
        
        if (array_length(__source_array) <= 0)
        {
            __input_trace("Binding scan failed: Source array for player ", __index, " is empty (the player has no source assigned)");
            __binding_scan_failure(INPUT_BINDING_SCAN_EVENT.SOURCE_INVALID);
            return;
        }
        
        if (array_length(_source_filter) <= 0)
        {
            __input_trace("Binding scan failed: Source filter array for player ", __index, " is empty (no sources are permitted)");
            __binding_scan_failure(INPUT_BINDING_SCAN_EVENT.SOURCE_FILTER_EMPTY);
            return;
        }
        
        if (__ghost)
        {
            __input_trace("Binding scan failed: Player ", __index, " is a ghost");
            __binding_scan_failure(INPUT_BINDING_SCAN_EVENT.PLAYER_IS_GHOST);
            return;
        }
        
        if (!__active)
        {
            __input_trace("Binding scan failed: Player ", __index, " is inactive");
            __binding_scan_failure(INPUT_BINDING_SCAN_EVENT.PLAYER_IS_INACTIVE);
            return;
        }
        
        if (!__connected)
        {
            __input_trace("Binding scan failed: Player ", __index, " disconnected");
            __binding_scan_failure(INPUT_BINDING_SCAN_EVENT.PLAYER_DISCONNECTED);
            return;
        }
        
        if (__global.__current_time - __rebind_start_time > INPUT_BINDING_SCAN_TIMEOUT)
        {
            __input_trace("Binding scan failed: Timed out");
            __binding_scan_failure(INPUT_BINDING_SCAN_EVENT.SCAN_TIMEOUT);
            return;
        }
        
        #endregion
        
        if (__rebind_state == 1) //Waiting for the player to release all buttons
        {
            if (!__sources_any_input())
            {
                __input_trace("Now scanning for a new binding from player ", __index);
                __rebind_state = 2;
            }
        }
        else if (__rebind_state == 2) //Now grab the first button pressed
        {
            var _new_binding    = undefined;
            var _binding_source = undefined;
                
            var _i = 0;
            repeat(array_length(_source_filter))
            {
                if (__global.__use_is_instanceof)
                {
                    if (!is_instanceof(_source_filter[_i], __input_class_source))
                    {
                        __input_error("Value in filter array is not a source (index ", _i, ", ", _source_filter[_i], ")");
                    }
                }
                else
                {
                    if (instanceof(_source_filter[_i]) != "__input_class_source")
                    {
                        __input_error("Value in filter array is not a source (index ", _i, ", ", _source_filter[_i], ")");
                    }
                }
                
                var _source_binding = _source_filter[_i].__scan_for_binding(__index, false, __rebind_ignore_struct, __rebind_allow_struct);
                if (_source_binding != undefined)
                {
                    var _new_binding    = _source_binding;
                    var _binding_source = _source_filter[_i];
                }
                    
                ++_i;
            }
            
            if (input_value_is_binding(_new_binding)) __binding_scan_success(_new_binding);
        }
    }
    
    static __binding_scan_success = function(_binding)
    {
        __input_trace("Binding found for player ", __index, ": \"", _binding, "\"");
        __rebind_state = 0;
        
        if (is_method(__rebind_success_callback))
        {
            __rebind_success_callback(_binding);
        }
        else if (is_numeric(__rebind_success_callback) && script_exists(__rebind_success_callback))
        {
            script_execute(__rebind_success_callback, _binding);
        }
        else if (__rebind_success_callback != undefined)
        {
            __input_error("Binding scan success callback set to an illegal value (typeof=", typeof(__rebind_success_callback), ")");
        }
    }
    
    static __binding_scan_failure = function(_error_code)
    {
        __input_trace("Binding scan for player ", __index, " failed (error=", _error_code, ")");
        __rebind_state = 0;
        
        if (is_method(__rebind_failure_callback))
        {
            __rebind_failure_callback(_error_code);
        }
        else if (is_numeric(__rebind_failure_callback) && script_exists(__rebind_failure_callback))
        {
            script_execute(__rebind_failure_callback, _error_code);
        }
        else if (__rebind_failure_callback != undefined)
        {
            __input_error("Binding scan failure callback set to an illegal value (typeof=", typeof(__rebind_failure_callback), ")");
        }
    }
    
    #endregion


// Feather disable all
/// This function should be called in the scope of a gamepad class

function __input_gamepad_find_in_sdl2_database()
{
    __INPUT_GLOBAL_STATIC_LOCAL  //Set static _global
    
    if (!__INPUT_SDL2_SUPPORT || !INPUT_SDL2_REMAPPING || blacklisted || xinput) return;
  
    //Check to see if our device GUID matches the SDL2 database perfectly somewhere
    var _guid_dict = _global.__sdl2_database.by_guid;
    if (variable_struct_exists(_guid_dict, guid))
    {
        var _definition = _guid_dict[$ guid];
        sdl2_definition = _definition;
        description     = _definition[1];
        return;
    }
    
    var _definition = undefined;
    
    //Otherwise search through our GUID-based description IDs
    var _description_array = _global.__sdl2_database.by_description[$ string_copy(guid, 1, 20)];
    if (is_array(_description_array))
    {
        if (array_length(_description_array) > 0) //Get the first binding for this description and OS
        {
            var _definition = _description_array[0];
        }
    }
    else
    {    
        //Otherwise search through our vendor+product IDs
        var _vp_array = _global.__sdl2_database.by_vendor_product[$ vendor + product];
        if (is_array(_vp_array))
        {
            if (array_length(_vp_array) > 0) //Get the first binding for this vendor+product and OS
            {
                var _definition = _vp_array[0];
            }
        }
    }
    
    if (is_array(_definition))
    {
        sdl2_definition = _definition;
        description     = _definition[1];
    }
    else
    {
        if (!__INPUT_SILENT) __input_trace("Warning! No SDL definition found for ", guid, " (vendor=", vendor, ", product=", product, ")");
        sdl2_definition = undefined;
    }
}

// Feather disable all
/// This function should be called in the scope of a gamepad class

function __input_gamepad_set_blacklist()
{
    __INPUT_GLOBAL_STATIC_LOCAL  //Set static _global
    
    //Don't blacklist on preconfigured platforms
    if (!__INPUT_SDL2_SUPPORT) return;

    if ((axis_count == 0) && (button_count == 0) && (hat_count == 0))
    {
        //Smoke check invalid devices
        __input_trace("Warning! Controller ", index, " (VID+PID \"", vendor + product, "\") blacklisted: no button or axis");
        blacklisted = true;
        return;
    }
    
    if ((raw_type == "SDLWheel") || (raw_type == "SDLFlightstick") || (raw_type == "SDLThrottle"))
    {
        //Filter non-gamepad joystick devices
        if (!__INPUT_SILENT) __input_trace("Warning! Device ", index, " is blacklisted (Not a gamepad)");
        blacklisted = true;
        return;
    }
    
    var _description_lower = string_replace_all(string_lower(gamepad_get_description(index)), " ", "");
    
    switch (os_type)
    {
        case os_windows:
            if ((vendor == "7e05") && (product == "0920") && (button_count > 21))
            {
                //Switch Pro Controller over USB. Normally does not operate, runs haywire with Steam open
                if (!__INPUT_SILENT) __input_trace("Warning! Controller ", index, " is blacklisted (Switch Pro Controller over USB)");
                blacklisted = true;
                return;
            }
        
            if (((vendor == "4c05") && (product == "6802"))    //PS3 controller
            && (((axis_count ==  4) && (button_count == 19))   //Bad driver
             || ((axis_count ==  8) && (button_count == 0))))  //DsHidMini gyro
            {
                //Unsupported configuration for PS3 controller
                if (!__INPUT_SILENT) __input_trace("Warning! Controller ", index, " is blacklisted (Incorrectly configured PS3 controller)");
                blacklisted = true;
                return;
            }
        break;
        
        case os_linux:
            if (_global.__on_steam_deck)
            {
                if ((button_count == 144) && (axis_count == 0))
                {
                    //Unsupported virtual keyboard device 
                    if (!__INPUT_SILENT) __input_trace("Warning! Controller ", index, " is blacklisted (Steam Deck virtual keyboard)");
                    blacklisted = true;
                    return;
                }

                if (raw_type == "CommunitySteamDeck")
                {
                    //Do not blacklist built-in gamepad
                    return;
                }
            }
        
            var _joycon_imu_axis_count = 6;
            if ((button_count == 0) && (axis_count == _joycon_imu_axis_count) && (hat_count == 0))
            {
                var _i = 0;
                repeat(_joycon_imu_axis_count)
                {
                    //Joy-Con IMU and gyro axes rest above zero
                    if (gamepad_axis_value(index, _i) <= 0) break;        
                    ++_i;
                }
        
                if (_i == _joycon_imu_axis_count)
                {
                    //Unsupported hid-nintendo module motion device
                    if (!__INPUT_SILENT) __input_trace("Warning! Controller ", index, " blacklisted (matches Joy-Con motion unit)");
                    blacklisted = true;
                    return;
                }
            }
        
            if ((raw_type == "HIDWiiMotionPlus") || (raw_type == "HIDWiiRemoteNunchuk")
            ||  (raw_type == "HIDWiiRemoteIMU")  || (raw_type == "HIDWiiRemoteIRSensor"))
            {
                //Unsupported hid-wiimote module motion device 
                if (!__INPUT_SILENT) __input_trace("Warning! Controller ", index, " is blacklisted, type (\"", raw_type, "\")");
                blacklisted = true;
                return;
            }
        break;
        
        case os_android:
            if (__input_string_contains(_description_lower, "keyboard", "mouse") 
            && !__input_string_contains(_description_lower, "joystick", "pg-9167", "harmonix"))
            {
                //Misidentified keyboard or mouse on Android
                if (!__INPUT_SILENT) __input_trace("Warning! Controller ", index, " is blacklisted, type (matches mouse or keyboard)");
                blacklisted = true;
                return;
            }
        break;
    }

    
    if ((vendor != "de28") && variable_struct_exists(_global.__ignore_gamepad_types, simple_type))
    {
        //Block device types indicated by Steam Input
        if (!__INPUT_SILENT) __input_trace("Warning! Controller type is blacklisted by Steam Input (\"", simple_type, "\")");
        blacklisted = true;
        return;
    }
    
    //Figure out which string to use to find the correct blacklist for the current OS
    var _os = undefined;
    switch(os_type)
    {
        case os_windows: _os = "windows"; break;
        case os_linux:   _os = "linux";   break;
        case os_macosx:  _os = "macos";   break;
        case os_android: _os = "android"; break;
        
        default:
            __input_error("OS not supported");
        break;
    }
    
    //Check the platform blacklists to see if this gamepad is banned
    var _os_filter_dict  = _global.__blacklist_dictionary[$ _os];
    var _os_guid_dict    = is_struct(_os_filter_dict)? _os_filter_dict[$ "guid"                ] : undefined;
    var _os_vidpid_dict  = is_struct(_os_filter_dict)? _os_filter_dict[$ "vid+pid"             ] : undefined;
    var _os_desc_array   = is_struct(_os_filter_dict)? _os_filter_dict[$ "description contains"] : undefined;
    
    if (is_struct(_os_guid_dict) && variable_struct_exists(_os_guid_dict, guid))
    {
        if (!__INPUT_SILENT) __input_trace("Warning! Controller is blacklisted (found by GUID \"", guid, "\")");
        blacklisted = true;
        return;
    }
    else if (is_struct(_os_vidpid_dict) && variable_struct_exists(_os_vidpid_dict, string(vendor) + string(product)))
    {
        if (!__INPUT_SILENT) __input_trace("Warning! Controller is blacklisted (found by VID+PID \"", vendor, product, "\")");
        blacklisted = true;
        return;
    }
    else if (is_array(_os_desc_array))
    {
        var _i = 0;
        repeat(array_length(_os_desc_array))
        {
            if (string_pos(_os_desc_array[_i], _description_lower) > 0)
            {
                if (!__INPUT_SILENT) __input_trace("Warning! Controller is blacklisted (banned substring \"", _os_desc_array[_i], "\" found in description)");
                blacklisted = true;
                return;
            }
            
            ++_i;
        }
    }
}
