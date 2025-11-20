import { createStringEnumeratedOptionHelpers } from "../dependencies.js";

const PerformanceSuiteName = Object.freeze({
    PARSER: "parser",
    FORMATTER: "formatter",
    IDENTIFIER_TEXT: "identifier-text"
});

const performanceSuiteHelpers = createStringEnumeratedOptionHelpers(
    Object.values(PerformanceSuiteName),
    {
        valueLabel: "Benchmark suite name",
        formatErrorMessage({ list, received }) {
            return `Benchmark suite must be one of: ${list}. Received: ${received}.`;
        }
    }
);

const PERFORMANCE_THROUGHPUT_SUITES = new Set([
    PerformanceSuiteName.PARSER,
    PerformanceSuiteName.FORMATTER
]);

const formatPerformanceSuiteList = performanceSuiteHelpers.formatList;

function normalizePerformanceSuiteName(value, { errorConstructor } = {}) {
    return performanceSuiteHelpers.requireValue(value, { errorConstructor });
}

function isPerformanceThroughputSuite(name) {
    return PERFORMANCE_THROUGHPUT_SUITES.has(name);
}

export {
    PerformanceSuiteName,
    formatPerformanceSuiteList,
    normalizePerformanceSuiteName,
    isPerformanceThroughputSuite
};
