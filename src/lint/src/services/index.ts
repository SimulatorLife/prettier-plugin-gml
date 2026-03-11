import * as CoreWorkspace from "@gml-modules/core";

import { PERFORMANCE_OVERRIDE_RULE_IDS } from "../configs/performance-rule-ids.js";
import { featherManifest } from "../rules/feather/manifest.js";

export const services = Object.freeze({
    featherManifest,
    performanceOverrideRuleIds: PERFORMANCE_OVERRIDE_RULE_IDS,
    isPathWithinBoundary: CoreWorkspace.Core.isPathWithinBoundary
});
