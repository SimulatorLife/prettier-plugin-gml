// Minimal runtime stub for the SemOracle surface so imports that expect
// a runtime module exist. The authoritative shape lives elsewhere during the
// migration; this shim provides safe defaults so test runs fail later in a
// more actionable place rather than an early module-not-found.
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
//# sourceMappingURL=sem-oracle.js.map