import { Core } from "@gmloop/core";

import type {
    FixtureAssertion,
    FixtureKind,
    FixtureProfileBudgets,
    FixtureProjectConfig,
    FixtureProjectConfigMetadata,
    FixtureStageName
} from "../types.js";

const FIXTURE_KIND_VALUES = new Set<FixtureKind>(["format", "lint", "refactor", "integration"]);
const FIXTURE_ASSERTION_VALUES = new Set<FixtureAssertion>(["transform", "idempotent", "project-tree", "parse-error"]);
const FIXTURE_SECTION_KEYS = new Set(["kind", "assertion", "profile"]);
const FIXTURE_PROFILE_KEYS = new Set(["budgets", "deepCpuProfile"]);
const FIXTURE_PROFILE_BUDGET_KEYS = new Set(["durationMs", "heapUsedDeltaBytes", "cpuUserMicros", "cpuSystemMicros"]);

function assertPlainObject(value: unknown, context: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError(`${context} must be a plain object.`);
    }

    return value as Record<string, unknown>;
}

function validateStageBudgetMap(value: unknown, context: string): Partial<Record<FixtureStageName, number>> {
    const object = assertPlainObject(value, context);
    const budgets: Record<string, number> = {};

    for (const [stageName, rawBudget] of Object.entries(object)) {
        if (
            stageName !== "load" &&
            stageName !== "format" &&
            stageName !== "lint" &&
            stageName !== "refactor" &&
            stageName !== "compare" &&
            stageName !== "total"
        ) {
            throw new TypeError(`${context} contains unknown stage ${JSON.stringify(stageName)}.`);
        }
        if (typeof rawBudget !== "number" || !Number.isFinite(rawBudget) || rawBudget < 0) {
            throw new TypeError(`${context}.${stageName} must be a non-negative number.`);
        }
        budgets[stageName] = rawBudget;
    }

    return budgets;
}

function validateFixtureMetadata(value: unknown, context: string): FixtureProjectConfigMetadata {
    const object = assertPlainObject(value, context);

    for (const key of Object.keys(object)) {
        if (!FIXTURE_SECTION_KEYS.has(key)) {
            throw new TypeError(`${context} contains unknown property ${JSON.stringify(key)}.`);
        }
    }

    const kind = object.kind;
    if (typeof kind !== "string" || !FIXTURE_KIND_VALUES.has(kind as FixtureKind)) {
        throw new TypeError(`${context}.kind must be one of ${[...FIXTURE_KIND_VALUES].join(", ")}.`);
    }

    const metadata: FixtureProjectConfigMetadata = {
        kind: kind as FixtureKind
    };

    if (object.assertion !== undefined) {
        if (typeof object.assertion !== "string" || !FIXTURE_ASSERTION_VALUES.has(object.assertion as FixtureAssertion)) {
            throw new TypeError(`${context}.assertion must be one of ${[...FIXTURE_ASSERTION_VALUES].join(", ")}.`);
        }
        metadata.assertion = object.assertion as FixtureAssertion;
    }

    if (object.profile !== undefined) {
        const profileObject = assertPlainObject(object.profile, `${context}.profile`);
        for (const key of Object.keys(profileObject)) {
            if (!FIXTURE_PROFILE_KEYS.has(key)) {
                throw new TypeError(`${context}.profile contains unknown property ${JSON.stringify(key)}.`);
            }
        }

        const profile: NonNullable<FixtureProjectConfigMetadata["profile"]> = {};
        if (profileObject.deepCpuProfile !== undefined) {
            if (typeof profileObject.deepCpuProfile !== "boolean") {
                throw new TypeError(`${context}.profile.deepCpuProfile must be a boolean.`);
            }
            profile.deepCpuProfile = profileObject.deepCpuProfile;
        }

        if (profileObject.budgets !== undefined) {
            const budgetsObject = assertPlainObject(profileObject.budgets, `${context}.profile.budgets`);
            const budgets: FixtureProfileBudgets = {};

            for (const [metricName, rawMetricBudgets] of Object.entries(budgetsObject)) {
                if (!FIXTURE_PROFILE_BUDGET_KEYS.has(metricName)) {
                    throw new TypeError(`${context}.profile.budgets contains unknown metric ${JSON.stringify(metricName)}.`);
                }

                budgets[metricName as keyof FixtureProfileBudgets] = validateStageBudgetMap(
                    rawMetricBudgets,
                    `${context}.profile.budgets.${metricName}`
                );
            }

            profile.budgets = budgets;
        }

        metadata.profile = profile;
    }

    return metadata;
}

/**
 * Load a fixture case `gmloop.json` and validate the fixture-owned metadata.
 *
 * @param configPath Fixture config path.
 * @returns Parsed fixture config with validated `fixture` metadata.
 */
export async function loadFixtureProjectConfig(configPath: string): Promise<FixtureProjectConfig> {
    const baseConfig = await Core.loadGmloopProjectConfig(configPath);
    const fixture = validateFixtureMetadata(baseConfig.fixture, "gmloop.json fixture config");

    return Object.freeze({
        ...baseConfig,
        fixture
    }) as FixtureProjectConfig;
}
