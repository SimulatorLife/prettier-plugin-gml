import {
    compactArray,
    toTrimmedString,
    getErrorCode,
    getErrorMessage,
    getObjectTagName,
    isAggregateErrorLike
} from "../shared/dependencies.js";
import { asErrorLike } from "../shared/error-guards.js";

const DEFAULT_INDENT = "  ";

const SIMPLE_VALUE_TYPES = new Set(["number", "boolean", "bigint"]);

const CLI_USAGE_ERROR_BRAND = Symbol.for("prettier-plugin-gml/cli-usage-error");

export interface ErrorWithMetadata extends Error {
    usage?: string | null;
    cause?: unknown;
    stack?: string;
    code?: string | number;
    [CLI_USAGE_ERROR_BRAND]?: boolean;
}

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
    const errorLike = asErrorLike(error);
    if (!errorLike) {
        return null;
    }

    const branded = errorLike as ErrorWithMetadata;
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
    const branded = asErrorLike(error) as ErrorWithMetadata | null;
    return Boolean(branded?.[CLI_USAGE_ERROR_BRAND]);
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

function formatErrorCause(cause: unknown, seen: Set<unknown>): string | null {
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

    const headerError = error as ErrorWithMetadata;
    if (typeof headerError.toString === "function") {
        return headerError.toString();
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

    const errored = error;
    const isUsageError = isCliUsageError(error);
    const stack =
        !isUsageError && typeof errored.stack === "string"
            ? errored.stack
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

    const errorLike = asErrorLike(value);
    if (errorLike) {
        return formatErrorObject(errorLike as ErrorWithMetadata, seen);
    }

    if (value && typeof value === "object") {
        return formatPlainObject(value, seen);
    }

    return String(value);
}

export function formatCliError(error: unknown): string {
    return formatErrorValue(error, new Set());
}

export class CliUsageError extends Error {
    usage: string | null;
    override cause?: unknown;

    constructor(message: string, { usage }: CliUsageErrorOptions = {}) {
        super(message);
        this.name = "CliUsageError";
        this.usage = usage ?? null;
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
    const errorLike = asErrorLike(error);
    const explicitName = toTrimmedString(errorLike?.name);
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

    const stackLines = normalizeStackLines(asErrorLike(error)?.stack);
    if (stackLines) {
        details.stack = stackLines;
    }

    return details;
}

function resolveCliErrorUsage(error: unknown): string | null {
    const errorLike = asErrorLike(error);
    if (typeof errorLike?.usage === "string") {
        return errorLike.usage ?? null;
    }

    return null;
}

function appendLineIfPresent(lines: Array<string>, value?: string): void {
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
