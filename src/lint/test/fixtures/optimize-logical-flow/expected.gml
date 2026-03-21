if (ready) {
    show_debug_message("ok");
}

function bool_passthrough(condition) {
    return condition;
}

if (is_admin) {
    enable_admin_tools();
} else if (is_moderator) {
    enable_moderation_tools();
} else if (is_member) {
    enable_member_tools();
} else {
    enable_guest_tools();
}

function resolve_priority(flag_a, flag_b) {
    if (flag_a) {
        return true;
    } else {
        return !flag_b;
    }
}

function resolve_enabled_state(can_edit, is_locked) {
    if (can_edit) {
        return true;
    } else {
        return is_locked;
    }
}

function choose_channel(use_primary, fallback_ready) {
    channel = use_primary ? channel_primary : fallback_ready;
}

function ensure_cache(cache_entry) {
    cache_entry ??= ds_map_create();

    cache_entry ??= ds_map_create();
}

function should_alert(has_key, door_unlocked) {
    return !has_key || !door_unlocked;
}

if (can_dash) {
    dash();
}

if (is_open && (can_read || can_write)) {
    show_debug_message("access allowed");
}

if (state_running) {
    process_step();
}
