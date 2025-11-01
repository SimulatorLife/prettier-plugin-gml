import { ensureWorkflowPathsAllowed } from "../../workflow/path-filter.js";
import { isNonEmptyString } from "../dependencies.js";

/**
 * Manual module facade for workflow path validation.
 *
 * Wrapping the workflow module shields manual utilities from
 * path-layout details and enables future substitution in tests.
 *
 * @param {ReturnType<import("../../workflow/path-filter.js").createWorkflowPathFilter>} filter
 * Workflow path filter instance.
 * @param {Parameters<typeof ensureWorkflowPathsAllowed>[1]} entries
 * Manual workflow entries to validate.
 * @returns {void}
 */
export function ensureManualWorkflowPathsAllowed(filter, entries) {
    ensureWorkflowPathsAllowed(filter, entries);
}

const DEFAULT_MANUAL_CACHE_LABEL = "Manual cache root";
const DEFAULT_MANUAL_OUTPUT_LABEL = "Manual output path";

/**
 * Ensure core manual workflow directories and files comply with the provided
 * path filter. Commands routinely validate the cache root and output artefact
 * paths before kicking off manual downloads. The shared helper keeps the
 * labels and entry construction consistent across call sites so downstream
 * extensions receive the same error messaging and enforcement regardless of
 * which command they invoke.
 *
 * @param {ReturnType<import("../../workflow/path-filter.js").createWorkflowPathFilter>} filter
 * @param {{
 *   cacheRoot?: string | null | undefined,
 *   cacheLabel?: string | null | undefined,
 *   outputPath?: string | null | undefined,
 *   outputLabel?: string | null | undefined
 * }} [entries]
 * @returns {void}
 */
export function ensureManualWorkflowEnvironmentAllowed(
    filter,
    {
        cacheRoot,
        cacheLabel = DEFAULT_MANUAL_CACHE_LABEL,
        outputPath,
        outputLabel = DEFAULT_MANUAL_OUTPUT_LABEL
    } = {}
) {
    const workflowEntries = [];

    if (isNonEmptyString(cacheRoot)) {
        workflowEntries.push({
            type: "directory",
            target: cacheRoot,
            label: cacheLabel ?? DEFAULT_MANUAL_CACHE_LABEL
        });
    }

    if (isNonEmptyString(outputPath)) {
        workflowEntries.push({
            type: "path",
            target: outputPath,
            label: outputLabel ?? DEFAULT_MANUAL_OUTPUT_LABEL
        });
    }

    if (workflowEntries.length > 0) {
        ensureManualWorkflowPathsAllowed(filter, workflowEntries);
    }
}

export { ensureWorkflowPathsAllowed as default } from "../../workflow/path-filter.js";
