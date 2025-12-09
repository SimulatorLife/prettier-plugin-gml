import { createStringEnumeratedOptionHelpers } from "../../shared/enumerated-option-helpers.js";

const PerformanceSuiteName = Object.freeze({
    PARSER: "parser",
    FORMATTER: "formatter",
    IDENTIFIER_TEXT: "identifier-text"
});

type PerformanceSuite =
    (typeof PerformanceSuiteName)[keyof typeof PerformanceSuiteName];

const performanceSuiteHelpers = createStringEnumeratedOptionHelpers(
    Object.values(PerformanceSuiteName),
    {
        valueLabel: "Benchmark suite name",
        formatErrorMessage: ({ list, received }) =>
            `Benchmark suite must be one of: ${list}. Received: ${received}.`
    }
);

const PERFORMANCE_THROUGHPUT_SUITES = new Set<PerformanceSuite>([
    PerformanceSuiteName.PARSER,
    PerformanceSuiteName.FORMATTER
]);

function formatPerformanceSuiteList() {
    return performanceSuiteHelpers.formatList();
}

function normalizePerformanceSuiteName(
    value: unknown,
    {
        errorConstructor
    }: { errorConstructor?: new (message: string) => Error } = {}
): PerformanceSuite {
    return performanceSuiteHelpers.requireValue(value, {
        errorConstructor
    }) as PerformanceSuite;
}

function isPerformanceThroughputSuite(name: PerformanceSuite) {
    return PERFORMANCE_THROUGHPUT_SUITES.has(name);
}

export {
    PerformanceSuiteName,
    type PerformanceSuite,
    formatPerformanceSuiteList,
    normalizePerformanceSuiteName,
    isPerformanceThroughputSuite
};
