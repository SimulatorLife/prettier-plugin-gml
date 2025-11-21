export function kindOfIdent() {
    return "local"; // sensible default
}

export function nameOfIdent() {
    return "";
}

export function qualifiedSymbol() {
    return null;
}

export function callTargetKind() {
    return "unknown"; // matches expected union used by callers
}

export function callTargetSymbol() {
    return null;
}

export default {
    kindOfIdent,
    nameOfIdent,
    qualifiedSymbol,
    callTargetKind,
    callTargetSymbol
};
