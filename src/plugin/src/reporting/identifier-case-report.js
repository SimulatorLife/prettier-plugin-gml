// reporting/identifier-case-report.js

import path from "node:path";
import {
    mkdirSync as nodeMkdirSync,
    writeFileSync as nodeWriteFileSync
} from "node:fs";

import { setIdentifierCaseOption } from "../identifier-case/option-store.js";
import { toTrimmedString } from "../../../shared/string-utils.js";
import { asArray, toArray } from "../../../shared/array-utils.js";

import { consumeIdentifierCaseDryRunContext } from "./identifier-case-context.js";

const REPORT_NAMESPACE = "gml-identifier-case";
const LOG_VERSION = 1;

function readArrayProperty(owner, propertyName) {
    const collection = owner?.[propertyName];

    if (Array.isArray(collection)) {
        return collection;
    }

    return null;
}

const defaultFsFacade = Object.freeze({
    mkdirSync(targetPath) {
        nodeMkdirSync(targetPath, { recursive: true });
    },
    writeFileSync(targetPath, contents) {
        nodeWriteFileSync(targetPath, contents, "utf8");
    }
});

const defaultNow = () => Date.now();

function getNormalizedOperations(report) {
    return readArrayProperty(report, "operations") ?? [];
}

function getNormalizedConflicts(conflicts) {
    return asArray(conflicts);
}

function normalizeString(...values) {
    return values.map(toTrimmedString).find(Boolean) ?? "";
}

function extractOperations(plan) {
    if (!plan) {
        return [];
    }

    if (Array.isArray(plan)) {
        return plan;
    }

    const operations = readArrayProperty(plan, "operations");
    if (operations) {
        return operations;
    }

    const renames = readArrayProperty(plan, "renames");
    if (renames) {
        return renames;
    }

    return [];
}

function normalizeReference(reference) {
    if (!reference || typeof reference !== "object") {
        return null;
    }

    const filePath = normalizeString(
        reference.filePath,
        reference.path,
        reference.file
    );

    if (!filePath) {
        return null;
    }

    const occurrenceCandidate =
        reference.occurrences ?? reference.count ?? reference.references ?? 0;
    const occurrences = Number.isFinite(occurrenceCandidate)
        ? Number(occurrenceCandidate)
        : 0;

    return {
        filePath,
        occurrences: occurrences > 0 ? occurrences : 0
    };
}

function normalizeScope(scope) {
    if (!scope || typeof scope !== "object") {
        return { id: null, displayName: null, name: null };
    }

    const displayName = normalizeString(
        scope.displayName,
        scope.name,
        scope.scope,
        scope.path
    );
    const id = normalizeString(scope.id, scope.scopeId);

    return {
        id: id || null,
        displayName: displayName || null,
        name: normalizeString(scope.name) || null
    };
}

function normalizeOperation(rawOperation) {
    if (!rawOperation || typeof rawOperation !== "object") {
        return null;
    }

    const scope = normalizeScope(rawOperation.scope ?? {});

    const fromName = normalizeString(
        rawOperation.from?.name,
        rawOperation.source?.name,
        rawOperation.originalName,
        rawOperation.from,
        rawOperation.source
    );
    const toName = normalizeString(
        rawOperation.to?.name,
        rawOperation.target?.name,
        rawOperation.updatedName,
        rawOperation.to,
        rawOperation.target
    );

    const references = toArray(rawOperation.references)
        .map(normalizeReference)
        .filter(Boolean)
        .sort((a, b) => a.filePath.localeCompare(b.filePath));

    const occurrenceCount = references.reduce(
        (total, reference) => total + (reference.occurrences ?? 0),
        0
    );

    const referenceFileCount = new Set(
        references.map((reference) => reference.filePath)
    ).size;

    return {
        id: normalizeString(rawOperation.id, rawOperation.identifier) || null,
        kind:
            normalizeString(rawOperation.kind, rawOperation.type) ||
            "identifier",
        scopeId: scope.id,
        scopeName: scope.displayName ?? scope.name ?? null,
        fromName: fromName || null,
        toName: toName || null,
        references,
        occurrenceCount,
        referenceFileCount
    };
}

function normalizeConflict(rawConflict) {
    if (!rawConflict || typeof rawConflict !== "object") {
        return null;
    }

    const scope = normalizeScope(rawConflict.scope ?? {});
    const severityCandidate = normalizeString(rawConflict.severity);
    const severity = severityCandidate
        ? severityCandidate.toLowerCase()
        : "error";

    const suggestions = toArray(rawConflict.suggestions ?? rawConflict.hints)
        .map((entry) => normalizeString(entry))
        .filter(Boolean);

    return {
        code:
            normalizeString(
                rawConflict.code,
                rawConflict.identifier,
                rawConflict.type
            ) || null,
        message: normalizeString(rawConflict.message, rawConflict.reason) || "",
        severity,
        scope: {
            id: scope.id,
            displayName: scope.displayName ?? scope.name ?? null
        },
        identifier:
            normalizeString(
                rawConflict.identifier,
                rawConflict.name,
                rawConflict.originalName
            ) || null,
        suggestions,
        details:
            rawConflict.details && typeof rawConflict.details === "object"
                ? { ...rawConflict.details }
                : null
    };
}

function sortOperations(operations) {
    return operations.slice().sort((left, right) => {
        const scopeCompare = (left.scopeName ?? "").localeCompare(
            right.scopeName ?? ""
        );
        if (scopeCompare !== 0) {
            return scopeCompare;
        }

        const fromCompare = (left.fromName ?? "").localeCompare(
            right.fromName ?? ""
        );
        if (fromCompare !== 0) {
            return fromCompare;
        }

        return (left.toName ?? "").localeCompare(right.toName ?? "");
    });
}

function sortConflicts(conflicts) {
    const severityOrder = new Map([
        ["error", 0],
        ["warning", 1],
        ["info", 2]
    ]);

    return conflicts.slice().sort((left, right) => {
        const severityA = severityOrder.get(left.severity) ?? 99;
        const severityB = severityOrder.get(right.severity) ?? 99;
        if (severityA !== severityB) {
            return severityA - severityB;
        }

        const scopeCompare = (left.scope.displayName ?? "").localeCompare(
            right.scope.displayName ?? ""
        );
        if (scopeCompare !== 0) {
            return scopeCompare;
        }

        return left.message.localeCompare(right.message);
    });
}

function pluralize(value, suffix = "s") {
    return value === 1 ? "" : suffix;
}

export function summarizeIdentifierCasePlan({
    renamePlan,
    conflicts = []
} = {}) {
    const normalizedOperations = sortOperations(
        extractOperations(renamePlan).map(normalizeOperation).filter(Boolean)
    );

    const normalizedConflicts = sortConflicts(
        toArray(conflicts).map(normalizeConflict).filter(Boolean)
    );

    const impactedFileSet = new Set();
    let totalReferenceCount = 0;

    for (const operation of normalizedOperations) {
        for (const reference of operation.references) {
            impactedFileSet.add(reference.filePath);
            totalReferenceCount += reference.occurrences ?? 0;
        }
    }

    const severityCounts = new Map();
    for (const conflict of normalizedConflicts) {
        const severity = conflict.severity ?? "info";
        severityCounts.set(severity, (severityCounts.get(severity) ?? 0) + 1);
    }

    const summary = {
        renameCount: normalizedOperations.length,
        impactedFileCount: impactedFileSet.size,
        totalReferenceCount,
        conflictCount: normalizedConflicts.length,
        severityCounts: Object.fromEntries(severityCounts.entries())
    };

    return {
        summary,
        operations: normalizedOperations,
        conflicts: normalizedConflicts
    };
}

export function formatIdentifierCaseSummaryText(report) {
    if (!report) {
        return [];
    }

    const { summary, operations, conflicts } = report;
    const lines = [];

    lines.push(`[${REPORT_NAMESPACE}] Identifier case dry-run summary:`);

    const renameDetails =
        summary.renameCount > 0
            ? ` (${summary.totalReferenceCount} reference${pluralize(
                summary.totalReferenceCount
            )} across ${summary.impactedFileCount} file${pluralize(
                summary.impactedFileCount
            )})`
            : "";
    lines.push(`  Planned renames: ${summary.renameCount}${renameDetails}`);

    if (summary.conflictCount > 0) {
        const severityParts = Object.entries(summary.severityCounts)
            .filter(([, count]) => count > 0)
            .map(
                ([severity, count]) =>
                    `${count} ${severity}${pluralize(count)}`
            );

        const conflictSuffix =
            severityParts.length > 0 ? ` (${severityParts.join(", ")})` : "";
        lines.push(`  Conflicts: ${summary.conflictCount}${conflictSuffix}`);
    } else {
        lines.push("  Conflicts: none");
    }

    if (operations.length > 0) {
        lines.push("");
        lines.push("Rename plan:");

        for (const operation of operations) {
            const referenceSummary =
                operation.occurrenceCount > 0
                    ? ` (${operation.occurrenceCount} reference${pluralize(
                        operation.occurrenceCount
                    )} across ${operation.referenceFileCount} file${pluralize(
                        operation.referenceFileCount
                    )})`
                    : "";

            const scopeName =
                operation.scopeName ?? operation.scopeId ?? "<unknown scope>";
            const fromName = operation.fromName ?? "<unknown>";
            const toName = operation.toName ?? "<unknown>";

            lines.push(
                `  - ${scopeName}: ${fromName} -> ${toName}${referenceSummary}`
            );

            for (const reference of operation.references) {
                const referenceSuffix =
                    reference.occurrences > 0
                        ? ` (${reference.occurrences} reference${pluralize(
                            reference.occurrences
                        )})`
                        : "";
                lines.push(`      • ${reference.filePath}${referenceSuffix}`);
            }
        }
    }

    if (conflicts.length > 0) {
        lines.push("");
        lines.push("Conflicts:");

        for (const conflict of conflicts) {
            const scopeName =
                conflict.scope.displayName ??
                conflict.scope.id ??
                "<unknown scope>";
            const identifierSuffix = conflict.identifier
                ? ` (${conflict.identifier})`
                : "";
            const codeSuffix = conflict.code ? ` [${conflict.code}]` : "";
            lines.push(
                `  - [${conflict.severity}]${codeSuffix} ${scopeName}${identifierSuffix}: ${conflict.message}`
            );

            if (conflict.suggestions.length > 0) {
                lines.push(
                    `      Suggestions: ${conflict.suggestions.join(", ")}`
                );
            }
        }
    }

    return lines;
}

function getNormalizedReportCollections(report) {
    const operations = getNormalizedOperations(report);
    const conflicts = getNormalizedConflicts(report?.conflicts);

    return { operations, conflicts };
}

function buildRenameSummary(operation) {
    return {
        id: operation.id,
        kind: operation.kind,
        scopeId: operation.scopeId ?? null,
        scopeName: operation.scopeName ?? null,
        fromName: operation.fromName ?? null,
        toName: operation.toName ?? null,
        referenceCount: operation.occurrenceCount ?? 0,
        references: operation.references ?? []
    };
}

function buildRenameSummaries(operations) {
    return operations.map(buildRenameSummary);
}

function buildLogPayload(report, generatedAt) {
    const { summary = {} } = report ?? {};
    const { operations, conflicts } = getNormalizedReportCollections(report);
    const renames = buildRenameSummaries(operations);

    return {
        version: LOG_VERSION,
        generatedAt,
        summary: {
            ...summary,
            severityCounts: { ...summary.severityCounts }
        },
        renames: renames.map((rename) => ({
            id: rename.id,
            kind: rename.kind,
            scope: {
                id: rename.scopeId,
                displayName: rename.scopeName
            },
            from: {
                name: rename.fromName
            },
            to: {
                name: rename.toName
            },
            referenceCount: rename.referenceCount,
            references: rename.references
        })),
        conflicts
    };
}

function pushDiagnosticEntry({ diagnostics, report, text }) {
    if (!Array.isArray(diagnostics)) {
        return;
    }

    const { operations, conflicts } = getNormalizedReportCollections(report);
    const renames = buildRenameSummaries(operations);

    const severity = conflicts.some((conflict) => conflict.severity === "error")
        ? "error"
        : conflicts.some((conflict) => conflict.severity === "warning")
            ? "warning"
            : "info";

    diagnostics.push({
        code: `${REPORT_NAMESPACE}-summary`,
        severity,
        message: text,
        summary: {
            ...report.summary
        },
        renames,
        conflicts
    });
}

export function reportIdentifierCasePlan({
    renamePlan,
    conflicts = [],
    logger = console,
    diagnostics = null,
    logFilePath = null,
    fsFacade = defaultFsFacade,
    now = defaultNow
} = {}) {
    const report = summarizeIdentifierCasePlan({
        renamePlan,
        conflicts
    });

    const lines = formatIdentifierCaseSummaryText(report);
    const textBlock = lines.join("\n");

    if (typeof logger?.log === "function") {
        logger.log(textBlock);
    } else {
        console.log(textBlock);
    }

    pushDiagnosticEntry({ diagnostics, report, text: textBlock });

    if (logFilePath) {
        try {
            const payload = buildLogPayload(
                report,
                new Date(now()).toISOString()
            );
            const directory = path.dirname(logFilePath);
            if (fsFacade?.mkdirSync) {
                fsFacade.mkdirSync(directory, { recursive: true });
            }
            if (fsFacade?.writeFileSync) {
                fsFacade.writeFileSync(
                    logFilePath,
                    `${JSON.stringify(payload, null, 2)}\n`
                );
            }
        } catch (error) {
            if (typeof logger?.warn === "function") {
                logger.warn(
                    `[${REPORT_NAMESPACE}] Failed to write identifier case report: ${
                        error?.message ?? error
                    }`
                );
            }
        }
    }

    return report;
}

function pickFunction(...candidates) {
    for (const candidate of candidates) {
        if (typeof candidate === "function") {
            return candidate;
        }
    }

    return null;
}

function toDiagnosticsArray(value) {
    return Array.isArray(value) ? value : null;
}

function resolveInlineReportContext(options, renamePlan) {
    return {
        renamePlan,
        conflicts:
            options.__identifierCaseConflicts ??
            options.identifierCaseConflicts ??
            [],
        dryRun: options.__identifierCaseDryRun ?? options.identifierCaseDryRun,
        logFilePath:
            options.__identifierCaseReportLogPath ??
            options.identifierCaseReportLogPath ??
            null,
        logger: options.logger ?? null,
        diagnostics: toDiagnosticsArray(options.diagnostics),
        fsFacade:
            options.__identifierCaseFs ?? options.identifierCaseFs ?? null,
        now: pickFunction(
            options.__identifierCaseNow,
            options.identifierCaseNow
        )
    };
}

function resolveReportContext(options) {
    const inlinePlan =
        options.__identifierCaseRenamePlan ??
        options.identifierCaseRenamePlan ??
        null;

    if (inlinePlan) {
        return resolveInlineReportContext(options, inlinePlan);
    }

    return consumeIdentifierCaseDryRunContext(options.filepath ?? null);
}

function resolveDryRunFlag(options, contextDryRun) {
    const explicitDryRun =
        options.__identifierCaseDryRun ?? options.identifierCaseDryRun;
    if (explicitDryRun !== undefined) {
        return explicitDryRun !== false;
    }

    if (contextDryRun !== undefined) {
        return contextDryRun !== false;
    }

    return false;
}

export function maybeReportIdentifierCaseDryRun(options) {
    if (!options || options.__identifierCaseReportEmitted) {
        return null;
    }

    const context = resolveReportContext(options);

    if (!context) {
        return null;
    }

    const {
        renamePlan,
        conflicts = [],
        dryRun: contextDryRun,
        logFilePath = null,
        logger = null,
        diagnostics = null,
        fsFacade = null,
        now = null
    } = context;

    if (!renamePlan) {
        setIdentifierCaseOption(options, "__identifierCaseReportEmitted", true);
        return null;
    }

    const shouldDryRun = resolveDryRunFlag(options, contextDryRun);

    setIdentifierCaseOption(options, "__identifierCaseDryRun", shouldDryRun);

    if (!shouldDryRun) {
        const result = summarizeIdentifierCasePlan({
            renamePlan,
            conflicts
        });

        setIdentifierCaseOption(options, "__identifierCaseReportEmitted", true);
        setIdentifierCaseOption(
            options,
            "__identifierCaseReportResult",
            result
        );

        return result;
    }

    const effectiveLogger = logger ?? options.logger ?? console;
    const effectiveDiagnostics =
        diagnostics ?? toDiagnosticsArray(options.diagnostics);
    const effectiveLogPath =
        logFilePath ??
        options.__identifierCaseReportLogPath ??
        options.identifierCaseReportLogPath ??
        null;
    const effectiveFs =
        fsFacade ??
        options.__identifierCaseFs ??
        options.identifierCaseFs ??
        defaultFsFacade;
    const effectiveNow =
        now ??
        pickFunction(options.__identifierCaseNow, options.identifierCaseNow) ??
        defaultNow;

    const result = reportIdentifierCasePlan({
        renamePlan,
        conflicts,
        logger: effectiveLogger,
        diagnostics: effectiveDiagnostics,
        logFilePath: effectiveLogPath,
        fsFacade: effectiveFs,
        now: effectiveNow
    });

    setIdentifierCaseOption(options, "__identifierCaseReportEmitted", true);
    setIdentifierCaseOption(options, "__identifierCaseReportResult", result);

    return result;
}
