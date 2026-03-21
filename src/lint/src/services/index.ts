import { PERFORMANCE_OVERRIDE_RULE_IDS } from "../configs/performance-rule-ids.js";
import { featherManifest } from "../rules/feather/manifest.js";
import { projectConfig } from "./project-config.js";

export const services = Object.freeze({
    featherManifest,
    performanceOverrideRuleIds: PERFORMANCE_OVERRIDE_RULE_IDS,
    projectConfig
});
