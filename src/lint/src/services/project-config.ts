import { createLintRuleEntriesFromProjectConfig, normalizeLintRulesConfig } from "../configs/index.js";

/**
 * Stable access point for lint project-config helpers.
 *
 * Keeping these helpers behind `Lint.services.projectConfig` preserves the
 * top-level `Lint` namespace as the plugin/config surface described by the
 * target-state architecture while still giving internal tooling and tests a
 * typed way to derive ESLint rule entries from `gmloop.json` data.
 */
export const projectConfig = Object.freeze({
    normalizeLintRulesConfig,
    createLintRuleEntriesFromProjectConfig
});
