import { Core } from "@gml-modules/core";

import { PERFORMANCE_OVERRIDE_RULE_IDS } from "../configs/performance-rule-ids.js";
import { featherManifest } from "../rules/feather/manifest.js";
import type { ProjectCapability } from "../types/index.js";
import {
    createPrebuiltProjectAnalysisProvider,
    createProjectAnalysisSnapshotFromProjectIndex
} from "./project-analysis-provider.js";
import {
    createProjectLintContextRegistry,
    createProjectSettingsFromRegistry,
    DEFAULT_PROJECT_INDEX_EXCLUDES
} from "./project-lint-context-registry.js";

export interface GmlFeatherRenamePlanEntry {
    identifierName: string;
    preferredReplacementName: string;
    safe: boolean;
    reason: string | null;
}

/**
 * Identifier occupancy checking.
 *
 * Provides the ability to test whether a given identifier name is already in
 * use somewhere in the project without coupling to occurrence tracking,
 * rename planning, or codemod-specific operations.
 * Corresponds to the `IDENTIFIER_OCCUPANCY` project capability.
 */
export interface IdentifierOccupancyContext {
    isIdentifierNameOccupiedInProject(identifierName: string): boolean;
}

/**
 * Identifier occurrence file tracking.
 *
 * Provides the ability to list which files contain occurrences of a given
 * identifier without coupling to occupancy checks, rename planning, or
 * codemod-specific operations.
 * Corresponds to the `IDENTIFIER_OCCURRENCES` project capability.
 */
export interface IdentifierOccurrenceContext {
    listIdentifierOccurrenceFiles(identifierName: string): ReadonlySet<string>;
}

/**
 * Feather rename conflict planning.
 *
 * Provides the ability to check whether proposed Feather rename targets are
 * safe (no name collision) without coupling to identifier queries or
 * codemod-specific operations.
 * Corresponds to the `RENAME_CONFLICT_PLANNING` project capability.
 */
export interface RenamePlanningContext {
    planFeatherRenames(
        requests: ReadonlyArray<{ identifierName: string; preferredReplacementName: string }>
    ): ReadonlyArray<GmlFeatherRenamePlanEntry>;
}

/**
 * Global variable rewrite assessment.
 *
 * Provides the ability to decide whether a `globalvar` declaration is safe to
 * rewrite based on file path and initializer presence, without coupling to
 * identifier queries, rename planning, or loop-hoist resolution.
 */
export interface GlobalVarRewriteContext {
    assessGlobalVarRewrite(
        filePath: string | null,
        hasInitializer: boolean
    ): { allowRewrite: boolean; reason: string | null };
}

/**
 * Loop-hoist identifier name resolution.
 *
 * Provides the ability to resolve a safe, non-colliding identifier name for
 * loop-length hoisting without coupling to occurrence tracking, rename
 * planning, or globalvar assessment.
 * Corresponds to the `LOOP_HOIST_NAME_RESOLUTION` project capability.
 */
export interface LoopHoistContext {
    resolveLoopHoistIdentifier(preferredName: string, localIdentifierNames: ReadonlySet<string>): string | null;
}

/**
 * Complete project analysis context.
 *
 * Combines all role-focused project context interfaces for consumers that
 * need full project analysis capabilities. Consumers should prefer depending
 * on the minimal interface they need (IdentifierOccupancyContext,
 * RenamePlanningContext, LoopHoistContext, etc.) rather than this composite
 * interface when possible.
 *
 * The `capabilities` field enumerates which capabilities are backed by a real
 * project index vs. a no-op fallback, allowing rules to skip project-aware
 * branches when the relevant data is unavailable.
 */
export interface GmlProjectContext
    extends IdentifierOccupancyContext,
        IdentifierOccurrenceContext,
        RenamePlanningContext,
        GlobalVarRewriteContext,
        LoopHoistContext {
    capabilities: ReadonlySet<ProjectCapability>;
}

export interface GmlProjectSettings {
    getContext(filePath: string): GmlProjectContext | null;
}

export const services = Object.freeze({
    featherManifest,
    performanceOverrideRuleIds: PERFORMANCE_OVERRIDE_RULE_IDS,
    defaultProjectIndexExcludes: DEFAULT_PROJECT_INDEX_EXCLUDES,
    createPrebuiltProjectAnalysisProvider,
    createProjectAnalysisSnapshotFromProjectIndex,
    createProjectLintContextRegistry,
    createProjectSettingsFromRegistry,
    isPathWithinBoundary: Core.isPathWithinBoundary,
    createMissingContextSettings(): GmlProjectSettings {
        return Object.freeze({
            getContext() {
                return null;
            }
        });
    }
});

export type { ProjectAnalysisBuildOptions, ProjectAnalysisProvider } from "./project-analysis-provider.js";
