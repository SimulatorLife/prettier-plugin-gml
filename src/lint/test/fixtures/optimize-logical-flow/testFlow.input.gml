function bool_passthrough(condition) {
    if (!!condition) {
        return true;
    }

    return false;
}
