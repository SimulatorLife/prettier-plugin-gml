import { toTrimmedString } from "../../shared/string-utils.js";
import {
    isAggregateErrorLike,
    isErrorLike
} from "../../shared/utils/capability-probes.js";

const DEFAULT_INDENT = "  ";

const SIMPLE_VALUE_TYPES = new Set(["number", "boolean", "bigint"]);

function indentBlock(text, indent = DEFAULT_INDENT) {
    return text
        .split("\n")
        .map((line) => `${indent}${line}`)
        .join("\n");
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

    const formatted = error.errors
        .map((entry) => formatErrorValue(entry, seen))
        .filter(Boolean)
        .map((text) => indentBlock(`- ${text.replaceAll("\n", "\n  ")}`));

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

    const stack = typeof error.stack === "string" ? error.stack : null;
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
        this.usage = usage ?? null;
    }
}

export function handleCliError(error, { exitCode = 1, prefix } = {}) {
    const lines = [];

    if (prefix) {
        lines.push(prefix);
    }

    const formatted = formatCliError(error);
    if (formatted) {
        lines.push(formatted);
    }

    const usage =
        error && typeof error === "object" && typeof error.usage === "string"
            ? error.usage
            : null;

    if (usage) {
        if (lines.length > 0 && lines.at(-1) !== "") {
            lines.push("");
        }
        lines.push(usage);
    }

    const output = lines.join("\n");
    if (output) {
        console.error(output);
    }

    process.exit(exitCode);
}
