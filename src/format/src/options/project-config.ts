import type { GmloopProjectConfig } from "@gmloop/core";

const NON_FORMAT_CONFIG_KEYS = new Set(["fixture", "lintRules", "refactor"]);

/**
 * Extract formatter-owned options from a shared `gmloop.json` object.
 *
 * @param config Shared top-level project config.
 * @returns Formatter option bag without non-formatter sections.
 */
export function extractProjectFormatOptions(config: GmloopProjectConfig): Record<string, unknown> {
    const options = Object.fromEntries(Object.entries(config).filter(([key]) => !NON_FORMAT_CONFIG_KEYS.has(key)));

    return Object.freeze(options);
}
