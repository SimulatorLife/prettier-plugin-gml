import { ensureWorkflowPathsAllowed } from "../../workflow/path-filter.js";

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

export { ensureWorkflowPathsAllowed as default } from "../../workflow/path-filter.js";
