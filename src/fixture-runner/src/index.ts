import * as ConfigAPI from "./config/index.js";
import * as DiscoveryAPI from "./discovery/index.js";
import * as ProfilingAPI from "./profiling/index.js";
import * as RunnerAPI from "./runner/index.js";

export const FixtureRunner = Object.freeze({
    ...ConfigAPI,
    ...DiscoveryAPI,
    ...ProfilingAPI,
    ...RunnerAPI
});

export type {
    FixtureAdapter,
    FixtureAssertion,
    FixtureCase,
    FixtureCaseExecutionResult,
    FixtureCaseResult,
    FixtureComparison,
    FixtureKind,
    FixtureProfileBudgetFailure,
    FixtureProfileBudgets,
    FixtureProfileCollector,
    FixtureProfileEntry,
    FixtureProfileEntryMemorySummary,
    FixtureProfileReport,
    FixtureProjectConfig,
    FixtureProjectConfigMetadata,
    FixtureRunFailure,
    FixtureRunResult,
    FixtureStageMetrics,
    FixtureStageName
} from "./types.js";
