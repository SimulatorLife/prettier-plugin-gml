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

/**
 * List codemods that can be configured and executed by the refactor workspace.
 */
export function listRegisteredCodemods(): Array<RegisteredCodemod> {
    return [...REGISTERED_CODEMODS];
}
