import type { GmloopProjectConfig } from "@gmloop/core";

const VALID_RULE_LEVELS = new Set(["off", "warn", "error"]);

/**
 * Normalize `lintRules` from a shared `gmloop.json` object.
 *
 * @param config Shared top-level project config.
 * @returns Normalized rule-level overrides.
 */
export function normalizeLintRulesConfig(
    config: GmloopProjectConfig
): Readonly<Record<string, "off" | "warn" | "error">> {
    const rawLintRules = config.lintRules;
    if (rawLintRules === undefined) {
        return Object.freeze({});
    }
    if (!rawLintRules || typeof rawLintRules !== "object" || Array.isArray(rawLintRules)) {
        throw new TypeError("gmloop.json lintRules must be an object.");
    }

    const normalizedRules: Record<string, "off" | "warn" | "error"> = {};
    for (const [ruleId, rawLevel] of Object.entries(rawLintRules)) {
        if (typeof rawLevel !== "string" || !VALID_RULE_LEVELS.has(rawLevel)) {
            throw new TypeError(`gmloop.json lintRules.${ruleId} must be one of off, warn, or error.`);
        }
        normalizedRules[ruleId] = rawLevel as "off" | "warn" | "error";
    }

    return Object.freeze(normalizedRules);
}
