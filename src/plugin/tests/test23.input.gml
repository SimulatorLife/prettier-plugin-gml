function bool_passthrough(condition) {
if(condition){
return true;
}else{
return false;
}
}

function bool_negated(a, b) {
    if (a && b) {
        return false;
    } else {
        return true;
    }
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
