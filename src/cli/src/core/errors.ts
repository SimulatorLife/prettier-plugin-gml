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

type ErrorWithMetadata = Error & {
    usage?: string | null;
    cause?: unknown;
    stack?: string;
    [CLI_USAGE_ERROR_BRAND]?: boolean;
};

interface CliUsageErrorOptions {
    usage?: string | null;
}

interface CliErrorDetails {
    message: string;
    name: string;
    code?: string;
    stack?: Array<string>;
}

interface CliErrorLinesOptions {
    prefix?: string;
    formattedError?: string;
    usage?: string | null;
}

export interface HandleCliErrorOptions {
    exitCode?: number;
    prefix?: string;
}

function brandCliUsageError(error: ErrorWithMetadata): void {
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

export function markAsCliUsageError(
    error: unknown,
    { usage }: CliUsageErrorOptions = {}
): ErrorWithMetadata | null {
    if (!isErrorLike(error)) {
        return null;
    }

    const branded = error as ErrorWithMetadata;
    brandCliUsageError(branded);
    if (usage !== undefined || !("usage" in branded)) {
        branded.usage = usage ?? null;
    }

    return branded;
}

function indentBlock(text: string, indent = DEFAULT_INDENT): string {
    return text
        .split("\n")
        .map((line) => `${indent}${line}`)
        .join("\n");
}

export function isCliUsageError(error: unknown): error is ErrorWithMetadata {
    return isErrorLike(error) && Boolean((error as ErrorWithMetadata)[CLI_USAGE_ERROR_BRAND]);
}

function formatSection(label: string, content: string | null): string | null {
    if (!content) {
        return null;
    }

    return `${label}:\n${content}`;
}

function extractStackBody(stack: string | null): string | null {
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

function formatAggregateErrors(
    error: unknown,
    seen: Set<unknown>
): string | null {
    if (!isAggregateErrorLike(error)) {
        return null;
    }

    const aggregate = error as { errors: Array<unknown> };
    const formatted = compactArray(
        aggregate.errors.map((entry) => formatErrorValue(entry, seen))
    ).map((text) => indentBlock(`- ${text.replaceAll("\n", "\n  ")}`));

    if (formatted.length === 0) {
        return null;
    }

    return formatSection("Errors", formatted.join("\n"));
}

function formatErrorCause(
    cause: unknown,
    seen: Set<unknown>
): string | null {
    if (!cause) {
        return null;
    }

    const text = formatErrorValue(cause, seen);
    return formatSection("Caused by", indentBlock(text));
}

function formatErrorHeader(error: ErrorWithMetadata): string {
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

function formatErrorObject(
    error: ErrorWithMetadata,
    seen: Set<unknown>
): string {
    if (seen.has(error)) {
        return "[Circular error reference]";
    }

    seen.add(error);

    const stack =
        !isCliUsageError(error) && typeof error.stack === "string"
            ? error.stack
            : null;
    const sections = compactArray([
        formatErrorHeader(error),
        extractStackBody(stack),
        formatErrorCause(error.cause, seen),
        formatAggregateErrors(error, seen)
    ]);

    if (sections.length === 0 && stack) {
        return stack;
    }

    return sections.join("\n");
}

function formatPlainObject(value: object, seen: Set<unknown>): string {
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

function formatErrorValue(value: unknown, seen: Set<unknown>): string {
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
        return formatErrorObject(value as ErrorWithMetadata, seen);
    }

    if (value && typeof value === "object") {
        return formatPlainObject(value as object, seen);
    }

    return String(value);
}

export function formatCliError(error: unknown): string {
    return formatErrorValue(error, new Set());
}

export class CliUsageError extends Error {
    constructor(message: string, { usage }: CliUsageErrorOptions = {}) {
        super(message);
        this.name = "CliUsageError";
        markAsCliUsageError(this, { usage });
    }
}

function normalizeStackLines(stack: string | undefined): Array<string> | null {
    if (typeof stack !== "string") {
        return null;
    }

    const lines = stack.split("\n").map((line) => line.trimEnd());
    return lines.some((line) => line.length > 0) ? lines : null;
}

function resolveNameFromTag(value: unknown): string | null {
    const tagName = getObjectTagName(value);
    return tagName ?? null;
}

function resolveErrorName(error: unknown): string {
    const explicitName = toTrimmedString((error as ErrorWithMetadata)?.name);
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
    error: unknown,
    { fallbackMessage = "Unknown error" }: { fallbackMessage?: string } = {}
): CliErrorDetails {
    const message = getErrorMessage(error, { fallback: fallbackMessage });
    const details: CliErrorDetails = {
        message,
        name: resolveErrorName(error)
    };

    const code = getErrorCode(error);
    if (code) {
        details.code = code;
    }

    const stackLines = normalizeStackLines((error as ErrorWithMetadata)?.stack);
    if (stackLines) {
        details.stack = stackLines;
    }

    return details;
}

function resolveCliErrorUsage(error: unknown): string | null {
    if (error && typeof error === "object" && typeof (error as ErrorWithMetadata).usage === "string") {
        return (error as ErrorWithMetadata).usage ?? null;
    }

    return null;
}

function appendLineIfPresent(
    lines: Array<string>,
    value?: string
): void {
    if (!value) {
        return;
    }

    lines.push(value);
}

function appendUsageSection(lines: Array<string>, usage: string | null): void {
    if (!usage) {
        return;
    }

    if (lines.length > 0 && lines.at(-1) !== "") {
        lines.push("");
    }

    lines.push(usage);
}

function buildCliErrorLines({
    prefix,
    formattedError,
    usage
}: CliErrorLinesOptions): Array<string> {
    const lines: Array<string> = [];

    appendLineIfPresent(lines, prefix);
    appendLineIfPresent(lines, formattedError);
    appendUsageSection(lines, usage ?? null);

    return lines;
}

export function handleCliError(
    error: unknown,
    { exitCode = 1, prefix }: HandleCliErrorOptions = {}
): never {
    const normalizedPrefix = isCliUsageError(error) ? undefined : prefix;
    const formatted = formatCliError(error);
    const usage = resolveCliErrorUsage(error);
    const lines = buildCliErrorLines({
        prefix: normalizedPrefix,
        formattedError: formatted,
        usage
    });

    const output = lines.join("\n");
    if (output) {
        console.error(output);
    }

    process.exit(exitCode);
}
