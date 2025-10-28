import {
    compactArray,
    toTrimmedString,
    getErrorCode,
    getErrorMessage,
    getObjectTagName,
    isAggregateErrorLike,
    isErrorLike
} from "../shared/dependencies.js";

const DEFAULT_INDENT = "  ";

const SIMPLE_VALUE_TYPES = new Set(["number", "boolean", "bigint"]);

const CLI_USAGE_ERROR_BRAND = Symbol.for("prettier-plugin-gml/cli-usage-error");

function brandCliUsageError(error) {
    if (!error || typeof error !== "object") {
        return;
    }

    if (error[CLI_USAGE_ERROR_BRAND]) {
        return;
    }

    Object.defineProperty(error, CLI_USAGE_ERROR_BRAND, {
        configurable: true,
        enumerable: false,
        value: true,
        writable: false
    });
}

export function markAsCliUsageError(error, { usage } = {}) {
    if (!isErrorLike(error)) {
        return null;
    }

    brandCliUsageError(error);
    if (usage !== undefined || !("usage" in error)) {
        error.usage = usage ?? null;
    }

    return error;
}

function indentBlock(text, indent = DEFAULT_INDENT) {
    return text
        .split("\n")
        .map((line) => `${indent}${line}`)
        .join("\n");
}

export function isCliUsageError(error) {
    return isErrorLike(error) && Boolean(error[CLI_USAGE_ERROR_BRAND]);
}

function formatSection(label, content) {
    if (!content) {
        return null;
    }

    return `${label}:\n${content}`;
}

function extractStackBody(stack) {
    if (typeof stack !== "string") {
        return null;
    }

    const [, ...stackLines] = stack.split("\n");
    if (stackLines.length === 0) {
        return null;
    }

    const stackBody = stackLines.map((line) => line.trimEnd()).join("\n");
    return stackBody || null;
}

function formatAggregateErrors(error, seen) {
    if (!isAggregateErrorLike(error)) {
        return null;
    }

    const formatted = compactArray(
        error.errors.map((entry) => formatErrorValue(entry, seen))
    ).map((text) => indentBlock(`- ${text.replaceAll("\n", "\n  ")}`));

    if (formatted.length === 0) {
        return null;
    }

    return formatSection("Errors", formatted.join("\n"));
}

function formatErrorCause(cause, seen) {
    if (!cause) {
        return null;
    }

    const text = formatErrorValue(cause, seen);
    return formatSection("Caused by", indentBlock(text));
}

function formatErrorHeader(error) {
    const name = toTrimmedString(error.name);
    const message = toTrimmedString(error.message);

    if (isCliUsageError(error)) {
        return message;
    }

    if (name && message) {
        return message.toLowerCase().startsWith(name.toLowerCase())
            ? message
            : `${name}: ${message}`;
    }

    if (message) {
        return message;
    }

    if (name) {
        return name;
    }

    if (typeof error.toString === "function") {
        return error.toString();
    }

    return "";
}

function formatErrorObject(error, seen) {
    if (seen.has(error)) {
        return "[Circular error reference]";
    }

    seen.add(error);

    const stack =
        !isCliUsageError(error) && typeof error.stack === "string"
            ? error.stack
            : null;
    const sections = [
        formatErrorHeader(error),
        extractStackBody(stack),
        formatErrorCause(error.cause, seen),
        formatAggregateErrors(error, seen)
    ].filter(Boolean);

    if (sections.length === 0 && stack) {
        return stack;
    }

    return sections.join("\n");
}

function formatPlainObject(value, seen) {
    if (seen.has(value)) {
        return "[Circular value reference]";
    }

    seen.add(value);

    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function formatErrorValue(value, seen) {
    if (value == undefined) {
        return "Unknown error";
    }

    if (typeof value === "string") {
        return value;
    }

    if (SIMPLE_VALUE_TYPES.has(typeof value)) {
        return String(value);
    }

    if (isErrorLike(value)) {
        return formatErrorObject(value, seen);
    }

    if (typeof value === "object") {
        return formatPlainObject(value, seen);
    }

    return String(value);
}

export function formatCliError(error) {
    return formatErrorValue(error, new Set());
}

export class CliUsageError extends Error {
    constructor(message, { usage } = {}) {
        super(message);
        this.name = "CliUsageError";
        markAsCliUsageError(this, { usage });
    }
}

function normalizeStackLines(stack) {
    if (typeof stack !== "string") {
        return null;
    }

    const lines = stack.split("\n").map((line) => line.trimEnd());
    return lines.some((line) => line.length > 0) ? lines : null;
}

function resolveNameFromTag(value) {
    const tagName = getObjectTagName(value);
    return tagName ?? null;
}

function resolveErrorName(error) {
    const explicitName = toTrimmedString(error?.name);
    if (explicitName) {
        return explicitName;
    }

    const tagName = resolveNameFromTag(error);
    if (tagName) {
        return tagName;
    }

    return "Error";
}

export function createCliErrorDetails(
    error,
    { fallbackMessage = "Unknown error" } = {}
) {
    const message = getErrorMessage(error, { fallback: fallbackMessage });
    const details = {
        message,
        name: resolveErrorName(error)
    };

    const code = getErrorCode(error);
    if (code) {
        details.code = code;
    }

    const stackLines = normalizeStackLines(error?.stack);
    if (stackLines) {
        details.stack = stackLines;
    }

    return details;
}

function resolveCliErrorUsage(error) {
    if (error && typeof error === "object" && typeof error.usage === "string") {
        return error.usage;
    }

    return null;
}

function appendLineIfPresent(lines, value) {
    if (!value) {
        return;
    }

    lines.push(value);
}

function appendUsageSection(lines, usage) {
    if (!usage) {
        return;
    }

    if (lines.length > 0 && lines.at(-1) !== "") {
        lines.push("");
    }

    lines.push(usage);
}

function buildCliErrorLines({ prefix, formattedError, usage }) {
    const lines = [];

    appendLineIfPresent(lines, prefix);
    appendLineIfPresent(lines, formattedError);
    appendUsageSection(lines, usage);

    return lines;
}

export function handleCliError(error, { exitCode = 1, prefix } = {}) {
    const formatted = formatCliError(error);
    const usage = resolveCliErrorUsage(error);
    const lines = buildCliErrorLines({
        prefix,
        formattedError: formatted,
        usage
    });

    const output = lines.join("\n");
    if (output) {
        console.error(output);
    }

    process.exit(exitCode);
}
