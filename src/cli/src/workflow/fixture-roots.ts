import path from "node:path";

import { Core } from "@gmloop/core";

import { REPO_ROOT } from "../shared/workspace-paths.js";
import { createWorkflowPathFilter, normalizeWorkflowPathList, type WorkflowPathFilterOptions } from "./path-filter.js";

const { toArray } = Core;

export const DEFAULT_FIXTURE_DIRECTORIES = Object.freeze([
    path.resolve(REPO_ROOT, "src", "parser", "test", "input"),
    path.resolve(REPO_ROOT, "src", "format", "test")
]);

export function normalizeFixtureRoots(
    additionalRoots: Iterable<unknown> | Array<unknown> = [],
    filterOptions: WorkflowPathFilterOptions = {}
): Array<string> {
    const pathFilter = createWorkflowPathFilter(filterOptions);
    const additionalRootEntries: Array<unknown> = [];

    for (const rootCandidate of Array.isArray(additionalRoots) ? additionalRoots : toArray(additionalRoots)) {
        additionalRootEntries.push(rootCandidate);
    }

    const normalizedCandidates = normalizeWorkflowPathList([...DEFAULT_FIXTURE_DIRECTORIES, ...additionalRootEntries]);

    return normalizedCandidates.filter((candidate) => pathFilter.allowsDirectory(candidate));
}
export { REPO_ROOT } from "../shared/workspace-paths.js";
