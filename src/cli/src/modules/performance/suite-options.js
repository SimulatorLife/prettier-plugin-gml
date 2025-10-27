import { createEnumeratedOptionHelpers } from "../../shared/dependencies.js";

const PerformanceSuiteName = Object.freeze({
    PARSER: "parser",
    FORMATTER: "formatter",
    IDENTIFIER_TEXT: "identifier-text"
});

const performanceSuiteHelpers = createEnumeratedOptionHelpers(
    Object.values(PerformanceSuiteName),
    {
        coerce(input) {
            if (typeof input !== "string") {
                throw new TypeError(
                    `Benchmark suite name must be provided as a string (received type '${typeof input}').`
                );
            }

            return input.trim().toLowerCase();
        },
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
