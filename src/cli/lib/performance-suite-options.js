import { normalizeEnumeratedOption } from "./shared-deps.js";

const PerformanceSuiteName = Object.freeze({
    PARSER: "parser",
    FORMATTER: "formatter",
    IDENTIFIER_TEXT: "identifier-text"
});

const PERFORMANCE_SUITE_NAMES = new Set(Object.values(PerformanceSuiteName));

const PERFORMANCE_SUITE_NAME_LIST = Object.freeze(
    [...PERFORMANCE_SUITE_NAMES].sort().join(", ")
);

const PERFORMANCE_THROUGHPUT_SUITES = new Set([
    PerformanceSuiteName.PARSER,
    PerformanceSuiteName.FORMATTER
]);

function formatPerformanceSuiteList() {
    return PERFORMANCE_SUITE_NAME_LIST;
}

function normalizePerformanceSuiteName(value, { errorConstructor } = {}) {
    const normalized = normalizeEnumeratedOption(
        value,
        null,
        PERFORMANCE_SUITE_NAMES,
        {
            coerce(input) {
                if (typeof input !== "string") {
                    throw new TypeError(
                        `Benchmark suite name must be provided as a string (received type '${typeof input}').`
                    );
                }

                return input.trim().toLowerCase();
            }
        }
    );

    if (normalized) {
        return normalized;
    }

    const ErrorConstructor =
        typeof errorConstructor === "function" ? errorConstructor : Error;
    const received = JSON.stringify(value);

    throw new ErrorConstructor(
        `Benchmark suite must be one of: ${formatPerformanceSuiteList()}. Received: ${received}.`
    );
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
