const DEFAULT_INDENT = "  ";

function indentBlock(text, indent = DEFAULT_INDENT) {
    return text
        .split("\n")
        .map((line) => `${indent}${line}`)
        .join("\n");
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

function formatErrorValue(value, seen) {
    if (value == null) {
        return "Unknown error";
    }

    const valueType = typeof value;

    if (valueType === "string") {
        return value;
    }

    if (
        valueType === "number" ||
        valueType === "boolean" ||
        valueType === "bigint"
    ) {
        return String(value);
    }

    if (value instanceof Error) {
        if (seen.has(value)) {
            return "[Circular error reference]";
        }

        seen.add(value);

        const sections = [];
        const name = typeof value.name === "string" ? value.name.trim() : "";
        const message =
            typeof value.message === "string" ? value.message.trim() : "";

        let header = "";
        if (name && message) {
            header = message.toLowerCase().startsWith(name.toLowerCase())
                ? message
                : `${name}: ${message}`;
        } else if (message) {
            header = message;
        } else if (name) {
            header = name;
        } else if (typeof value.toString === "function") {
            header = value.toString();
        }

        if (header) {
            sections.push(header);
        }

        const stack = typeof value.stack === "string" ? value.stack : null;
        const stackBody = extractStackBody(stack);
        if (stackBody) {
            sections.push(stackBody);
        }

        if (value.cause) {
            const causeText = formatErrorValue(value.cause, seen);
            if (causeText) {
                sections.push(`Caused by:\n${indentBlock(causeText)}`);
            }
        }

        if (value instanceof AggregateError && Array.isArray(value.errors)) {
            const aggregateSections = value.errors
                .map((entry) => {
                    const text = formatErrorValue(entry, seen);
                    if (!text) {
                        return null;
                    }
                    const indented = text.replace(/\n/g, "\n  ");
                    return `- ${indented}`;
                })
                .filter(Boolean);

            if (aggregateSections.length > 0) {
                sections.push(
                    `Errors:\n${aggregateSections
                        .map((line) => indentBlock(line))
                        .join("\n")}`
                );
            }
        }

        if (sections.length === 0 && stack) {
            return stack;
        }

        return sections.join("\n");
    }

    if (valueType === "object") {
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
        if (lines.length > 0 && lines[lines.length - 1] !== "") {
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
