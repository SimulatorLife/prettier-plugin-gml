import { readTextFile } from "../fs/io.js";
import { parseJsonObjectWithContext } from "../utils/json.js";

/**
 * Shared top-level `gmloop.json` object shape.
 *
 * The generic loader intentionally treats the payload as an open-ended object.
 * Tool-specific workspaces normalize and validate their own sections.
 */
export type GmloopProjectConfig = Record<string, unknown>;

/**
 * Assert that a parsed `gmloop.json` payload is a plain object.
 *
 * @param value Candidate config value.
 * @param context Human-readable context for error messages.
 * @returns The validated plain-object config payload.
 */
export function assertGmloopProjectConfigObject(value: unknown, context: string): GmloopProjectConfig {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError(`${context} must be a JSON object.`);
    }

    return value as GmloopProjectConfig;
}

/**
 * Parse a `gmloop.json` string into the shared top-level config object.
 *
 * @param rawText Raw JSON text.
 * @param sourcePath Source path used in parse errors.
 * @returns Parsed top-level config object.
 */
export function parseGmloopProjectConfig(rawText: string, sourcePath: string): GmloopProjectConfig {
    const parsed = parseJsonObjectWithContext(rawText, {
        source: sourcePath,
        description: "gmloop.json"
    });

    return assertGmloopProjectConfigObject(parsed, "gmloop.json");
}

/**
 * Read and parse a `gmloop.json` file from disk.
 *
 * @param configPath Absolute or relative config path.
 * @returns Parsed top-level config object.
 */
export async function loadGmloopProjectConfig(configPath: string): Promise<GmloopProjectConfig> {
    const rawConfig = await readTextFile(configPath);
    return parseGmloopProjectConfig(rawConfig, configPath);
}
