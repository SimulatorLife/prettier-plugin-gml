import type { RegisteredCodemod } from "./types.js";

const REGISTERED_CODEMODS: ReadonlyArray<RegisteredCodemod> = Object.freeze([
    Object.freeze({
        id: "loopLengthHoisting",
        description: "Hoist repeated loop-length helper calls out of for-loop test expressions."
    }),
    Object.freeze({
        id: "namingConvention",
        description: "Plan and apply naming-policy-driven renames using namingConventionPolicy."
    })
]);

export function listRegisteredCodemods(): Array<RegisteredCodemod> {
    return [...REGISTERED_CODEMODS];
}
