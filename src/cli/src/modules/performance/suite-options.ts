import { Core } from "@gml-modules/core";

const { createEnumeratedOptionHelpers } = Core;

const PerformanceSuiteName = Object.freeze({
    PARSER: "parser",
    FORMATTER: "formatter",
    IDENTIFIER_TEXT: "identifier-text"
});

type PerformanceSuite = (typeof PerformanceSuiteName)[keyof typeof PerformanceSuiteName];

const performanceSuiteHelpers = createEnumeratedOptionHelpers(Object.values(PerformanceSuiteName), {
    formatError: (list, received) => `Benchmark suite must be one of: ${list}. Received: ${received}.`,
    enforceStringType: true,
    valueLabel: "Benchmark suite name"
});

const PERFORMANCE_THROUGHPUT_SUITES = new Set<PerformanceSuite>([
    PerformanceSuiteName.PARSER,
    PerformanceSuiteName.FORMATTER
]);

function formatPerformanceSuiteList() {
    return performanceSuiteHelpers.formatList();
}

function normalizePerformanceSuiteName(
    value: unknown,
    { errorConstructor }: { errorConstructor?: new (message: string) => Error } = {}
): PerformanceSuite {
    return performanceSuiteHelpers.requireValue(value, errorConstructor) as PerformanceSuite;
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
