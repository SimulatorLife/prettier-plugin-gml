import { PERFORMANCE_OVERRIDE_RULE_IDS } from "../configs/performance-rule-ids.js";
import { featherManifest } from "../rules/feather/manifest.js";
import type { ProjectCapability } from "../types/index.js";
import { isPathWithinBoundary } from "./path-boundary.js";
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

export interface GmlProjectContext {
    capabilities: ReadonlySet<ProjectCapability>;
    isIdentifierNameOccupiedInProject(identifierName: string): boolean;
    listIdentifierOccurrenceFiles(identifierName: string): ReadonlySet<string>;
    planFeatherRenames(
        requests: ReadonlyArray<{ identifierName: string; preferredReplacementName: string }>
    ): ReadonlyArray<GmlFeatherRenamePlanEntry>;
    assessGlobalVarRewrite(
        filePath: string | null,
        hasInitializer: boolean
    ): { allowRewrite: boolean; reason: string | null };
    resolveLoopHoistIdentifier(preferredName: string, localIdentifierNames: ReadonlySet<string>): string | null;
}

export interface GmlProjectSettings {
    getContext(filePath: string): GmlProjectContext | null;
}

export const services = Object.freeze({
    featherManifest,
    performanceOverrideRuleIds: PERFORMANCE_OVERRIDE_RULE_IDS,
    defaultProjectIndexExcludes: DEFAULT_PROJECT_INDEX_EXCLUDES,
    createProjectLintContextRegistry,
    createProjectSettingsFromRegistry,
    isPathWithinBoundary,
    createMissingContextSettings(): GmlProjectSettings {
        return Object.freeze({
            getContext() {
                return null;
            }
        });
    }
});
