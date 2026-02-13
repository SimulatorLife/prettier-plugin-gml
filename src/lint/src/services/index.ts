import { PERFORMANCE_OVERRIDE_RULE_IDS } from "../configs/performance-rule-ids.js";
import { featherManifest } from "../rules/feather/manifest.js";

export interface GmlProjectContext {
    capabilities: ReadonlySet<string>;
}

export interface GmlProjectSettings {
    getContext(filePath: string): GmlProjectContext | null;
}

export const services = Object.freeze({
    featherManifest,
    performanceOverrideRuleIds: PERFORMANCE_OVERRIDE_RULE_IDS,
    createMissingContextSettings(): GmlProjectSettings {
        return Object.freeze({
            getContext() {
                return null;
            }
        });
    }
});
