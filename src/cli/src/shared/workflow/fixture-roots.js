import path from "node:path";

import { toArray } from "../dependencies.js";
import { REPO_ROOT } from "../workspace-paths.js";
import { createWorkflowPathFilter } from "./path-filter.js";

export const DEFAULT_FIXTURE_DIRECTORIES = Object.freeze([
    path.resolve(REPO_ROOT, "src", "parser", "test", "input"),
    path.resolve(REPO_ROOT, "src", "plugin", "test")
]);

export function createPathFilter(filters = {}) {
    return createWorkflowPathFilter(filters);
}

export function normalizeFixtureRoots(
    additionalRoots = [],
    filterOptions = {}
) {
    const pathFilter = createPathFilter(filterOptions);
    const candidates = [
        ...DEFAULT_FIXTURE_DIRECTORIES,
        ...(Array.isArray(additionalRoots)
            ? additionalRoots
            : toArray(additionalRoots))
    ];

    const resolved = [];
    const seen = new Set();

    for (const candidate of candidates) {
        if (typeof candidate !== "string" || candidate.length === 0) {
            continue;
        }

        const normalized = path.resolve(candidate);
        if (seen.has(normalized)) {
            continue;
        }

        if (!pathFilter.allowsDirectory(normalized)) {
            continue;
        }

        seen.add(normalized);
        resolved.push(normalized);
    }

    return resolved;
}
export { REPO_ROOT } from "../workspace-paths.js";
