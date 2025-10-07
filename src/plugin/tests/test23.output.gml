function bool_passthrough(condition) {
    return condition;
}

function bool_negated(a, b) {
    return !(a and b);
}

function bool_with_comment(condition) {
    if (condition) {
        // comment should stop simplification
        return true;
    } else {
        return false;
    }
}

function bool_with_extra(condition) {
    if (condition) {
        return true;
        condition += 1;
    } else {
        return false;
    }
}
