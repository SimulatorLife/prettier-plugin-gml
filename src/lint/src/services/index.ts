import { PERFORMANCE_OVERRIDE_RULE_IDS } from "../configs/performance-rule-ids.js";
import { featherManifest } from "../rules/feather/manifest.js";
import {
    createProjectLintContextRegistry,
    createProjectSettingsFromRegistry,
    DEFAULT_PROJECT_INDEX_EXCLUDES
} from "./project-lint-context-registry.js";

export interface GmlProjectContext {
    capabilities: ReadonlySet<string>;
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
    createMissingContextSettings(): GmlProjectSettings {
        return Object.freeze({
            getContext() {
                return null;
            }
        });
    }
});
