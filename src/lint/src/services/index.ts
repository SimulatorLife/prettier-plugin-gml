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

export interface GmlProjectContext {
    capabilities: ReadonlySet<ProjectCapability>;
    isIdentifierNameOccupiedInProject(identifierName: string): boolean;
    listIdentifierOccurrenceFiles(identifierName: string): ReadonlySet<string>;
    assessGlobalVarRewrite(
        filePath: string | null,
        hasInitializer: boolean
    ): { allowRewrite: boolean; reason: string | null };
    resolveLoopHoistIdentifier(
        preferredName: string,
        localIdentifierNames: ReadonlySet<string>,
        normalizedLocalIdentifierNames: ReadonlySet<string>
    ): string | null;
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
