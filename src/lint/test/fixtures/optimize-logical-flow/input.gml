if (!!ready) {
    show_debug_message("ok");
}

function bool_passthrough(condition) {
    if (!!condition) {
        return true;
    }

    return false;
}

if (!!is_admin) {
    enable_admin_tools();
} else if (!!is_moderator) {
    enable_moderation_tools();
} else if (!!is_member) {
    enable_member_tools();
} else {
    enable_guest_tools();
}

function resolve_priority(flag_a, flag_b) {
    if (!!flag_a) {
        return true;
    } else if (!!flag_b) {
        return false;
    } else {
        return true;
    }
}

function resolve_enabled_state(can_edit, is_locked) {
    if (!!can_edit) {
        return true;
    } else {
        return !!is_locked;
    }
}

function choose_channel(use_primary, fallback_ready) {
    if (!!use_primary) {
        channel = channel_primary;
    } else {
        channel = fallback_ready;
    }
}

function ensure_cache(cache_entry) {
    if (is_undefined(cache_entry)) {
        cache_entry = ds_map_create();
    }

    if (cache_entry == undefined) {
        cache_entry = ds_map_create();
    }
}

function should_alert(has_key, door_unlocked) {
    if (!((!!has_key) && (!!door_unlocked))) {
        return true;
    }

    return false;
}

if (can_dash || (can_dash && has_stamina)) {
    dash();
}

if ((is_open && can_read) || (is_open && can_write)) {
    show_debug_message("access allowed");
}

if (!!state_running && true) {
    process_step();
}


