import { PERFORMANCE_OVERRIDE_RULE_IDS } from "../configs/performance-rule-ids.js";
import { projectConfig } from "../configs/project-config-service.js";
import { featherManifest } from "../rules/feather/manifest.js";

export const services = Object.freeze({
    featherManifest,
    performanceOverrideRuleIds: PERFORMANCE_OVERRIDE_RULE_IDS,
    projectConfig
});
