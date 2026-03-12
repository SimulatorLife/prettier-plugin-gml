import { Core } from "@gmloop/core";

import { listRegisteredCodemods, normalizeRegisteredCodemodConfig } from "./codemod-registry.js";
import { normalizeNamingConventionPolicy } from "./naming-convention-policy.js";
import type { GmloopProjectConfig, NamingConventionPolicy, RefactorCodemodId, RefactorProjectConfig } from "./types.js";

const REFACTOR_CONFIG_KEYS = new Set(["namingConventionPolicy", "codemods"]);
const REFACTOR_CODEMOD_IDS = new Set<RefactorCodemodId>(listRegisteredCodemods().map((codemod) => codemod.id));

function assertPlainObject(value: unknown, context: string): Record<string, unknown> {
    return Core.assertPlainObject(value, {
        errorMessage: `${context} must be a plain object`
    });
}

function assignNormalizedCodemodConfigEntry<T extends RefactorCodemodId>(
    codemods: NonNullable<RefactorProjectConfig["codemods"]>,
    codemodId: T,
    value: NonNullable<RefactorProjectConfig["codemods"]>[T]
): void {
    codemods[codemodId] = value;
}

/**
 * Normalize and validate the `refactor` section of `gmloop.json`.
 */
export function normalizeRefactorProjectConfig(config: unknown): RefactorProjectConfig {
    if (config === undefined) {
        return {};
    }

    const object = assertPlainObject(config, "gmloop.json refactor config");

    for (const key of Object.keys(object)) {
        if (!REFACTOR_CONFIG_KEYS.has(key)) {
            throw new TypeError(`gmloop.json refactor config contains unknown property ${JSON.stringify(key)}`);
        }
    }

    const normalized: RefactorProjectConfig = {};

    if (object.namingConventionPolicy !== undefined) {
        normalized.namingConventionPolicy = normalizeNamingConventionPolicy(
            object.namingConventionPolicy as NamingConventionPolicy,
            "gmloop.json refactor.namingConventionPolicy"
        );
    }

    if (object.codemods !== undefined) {
        const codemodsObject = assertPlainObject(object.codemods, "gmloop.json refactor.codemods");
        const codemods: RefactorProjectConfig["codemods"] = {};

        for (const [rawCodemodId, codemodConfig] of Object.entries(codemodsObject)) {
            if (!REFACTOR_CODEMOD_IDS.has(rawCodemodId as RefactorCodemodId)) {
                throw new TypeError(`Unknown refactor codemod ${JSON.stringify(rawCodemodId)} in gmloop.json`);
            }

            const codemodId = rawCodemodId as RefactorCodemodId;
            assignNormalizedCodemodConfigEntry(
                codemods,
                codemodId,
                normalizeRegisteredCodemodConfig(codemodId, codemodConfig, `gmloop.json refactor.codemods.${codemodId}`)
            );
        }

        normalized.codemods = codemods;
    }

    return normalized;
}

/**
 * Load a project-level `gmloop.json` file and normalize its refactor settings.
 */
export async function loadGmloopProjectConfig(configPath: string): Promise<GmloopProjectConfig> {
    const rawConfig = await Core.readTextFile(configPath);
    const parsed = Core.parseJsonObjectWithContext(rawConfig, {
        source: configPath,
        description: "gmloop.json"
    }) as GmloopProjectConfig;

    return Object.freeze({
        ...parsed,
        refactor: normalizeRefactorProjectConfig(parsed.refactor)
    });
}
