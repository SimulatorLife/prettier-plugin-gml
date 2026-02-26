if (!!ready) {
    show_debug_message("ok");
}

function bool_passthrough(condition) {
    if (!!condition) {
        return true;
    }

    return false;
}
