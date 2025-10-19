/**
 * Identifier case reporting helpers.
 *
 * Normalizes rename plans/conflicts collected during identifier case dry runs
 * so downstream consumers (CLI output, diagnostics, and log files) receive
 * consistently shaped metadata regardless of the input source.
 */

import path from "node:path";

import { setIdentifierCaseOption } from "./option-store.js";
import { coalesceTrimmedString } from "../../../shared/string-utils.js";
import {
    coalesceOption,
    isObjectLike,
    withObjectLike
} from "../../../shared/object-utils.js";
import {
    asArray,
    isNonEmptyArray,
    toArray
} from "../../../shared/array-utils.js";

import { consumeIdentifierCaseDryRunContext } from "./identifier-case-context.js";
import { defaultIdentifierCaseFsFacade as defaultFsFacade } from "./fs-facade.js";

const REPORT_NAMESPACE = "gml-identifier-case";
const LOG_VERSION = 1;

function defaultNow() {
    return Date.now();
}

function getNormalizedOperations(report) {
    return asArray(report?.operations);
}

function getNormalizedConflicts(conflicts) {
    return asArray(conflicts);
}

function buildIdentifierCaseOptionKeys(baseName) {
    return [`__identifierCase${baseName}`, `identifierCase${baseName}`];
}

function getIdentifierCaseOption(options, baseName, coalesceOptions) {
    return coalesceOption(
        options,
        buildIdentifierCaseOptionKeys(baseName),
        coalesceOptions
    );
}

function extractOperations(plan) {
    if (Array.isArray(plan)) {
        return plan;
    }

    if (plan && typeof plan === "object") {
        if (Array.isArray(plan.operations)) {
            return plan.operations;
        }

        if (Array.isArray(plan.renames)) {
            return plan.renames;
        }
    }

    return [];
}

function normalizeReference(reference) {
    if (!isObjectLike(reference)) {
        return null;
    }

    const filePath = coalesceTrimmedString(
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
        occurrences: Math.max(occurrences, 0)
    };
}

function normalizeScope(scope) {
    if (!isObjectLike(scope)) {
        return { id: null, displayName: null, name: null };
    }

    const displayName = coalesceTrimmedString(
        scope.displayName,
        scope.name,
        scope.scope,
        scope.path
    );
    const id = coalesceTrimmedString(scope.id, scope.scopeId);

    return {
        id: id || null,
        displayName: displayName || null,
        name: coalesceTrimmedString(scope.name) || null
    };
}

function normalizeOperation(rawOperation) {
    return withObjectLike(
        rawOperation,
        (operation) => {
            const scope = normalizeScope(operation.scope ?? {});

            const fromName = coalesceTrimmedString(
                operation.from?.name,
                operation.source?.name,
                operation.originalName,
                operation.from,
                operation.source
            );
            const toName = coalesceTrimmedString(
                operation.to?.name,
                operation.target?.name,
                operation.updatedName,
                operation.to,
                operation.target
            );

            const references = toArray(operation.references)
                .map(normalizeReference)
                .filter(Boolean)
                .toSorted((a, b) => a.filePath.localeCompare(b.filePath));

            const occurrenceCount = references.reduce(
                (total, reference) => total + (reference.occurrences ?? 0),
                0
            );

            const referenceFileCount = new Set(
                references.map((reference) => reference.filePath)
            ).size;

            return {
                id:
                    coalesceTrimmedString(operation.id, operation.identifier) ||
                    null,
                kind:
                    coalesceTrimmedString(operation.kind, operation.type) ||
                    "identifier",
                scopeId: scope.id,
                scopeName: scope.displayName ?? scope.name ?? null,
                fromName: fromName || null,
                toName: toName || null,
                references,
                occurrenceCount,
                referenceFileCount
            };
        },
        null
    );
}

function normalizeConflict(rawConflict) {
    return withObjectLike(
        rawConflict,
        (conflict) => {
            const scope = normalizeScope(conflict.scope ?? {});
            const severityCandidate = coalesceTrimmedString(conflict.severity);
            const severity = severityCandidate
                ? severityCandidate.toLowerCase()
                : "error";

            const suggestions = toArray(conflict.suggestions ?? conflict.hints)
                .map((entry) => coalesceTrimmedString(entry))
                .filter(Boolean);

            return {
                code:
                    coalesceTrimmedString(
                        conflict.code,
                        conflict.identifier,
                        conflict.type
                    ) || null,
                message:
                    coalesceTrimmedString(conflict.message, conflict.reason) ||
                    "",
                severity,
                scope: {
                    id: scope.id,
                    displayName: scope.displayName ?? scope.name ?? null
                },
                identifier:
                    coalesceTrimmedString(
                        conflict.identifier,
                        conflict.name,
                        conflict.originalName
                    ) || null,
                suggestions,
                details:
                    conflict.details && typeof conflict.details === "object"
                        ? { ...conflict.details }
                        : null
            };
        },
        null
    );
}

function sortOperations(operations) {
    return [...operations].sort((left, right) => {
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

    return [...conflicts].toSorted((left, right) => {
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

/**
 * Build a concise summary of how rename operations affect reference files.
 *
 * @param {Array} operations Normalized rename operations.
 * @returns {{ impactedFileCount: number, totalReferenceCount: number }}
 */
function buildOperationReferenceMetrics(operations) {
    const impactedFileSet = new Set();
    let totalReferenceCount = 0;

    for (const operation of operations) {
        for (const reference of operation?.references ?? []) {
            if (!reference?.filePath) {
                continue;
            }

            impactedFileSet.add(reference.filePath);
            totalReferenceCount += reference.occurrences ?? 0;
        }
    }

    return {
        impactedFileCount: impactedFileSet.size,
        totalReferenceCount
    };
}

/**
 * Count how many conflicts occur for each severity level.
 *
 * @param {Array} conflicts Normalized conflict entries.
 * @returns {Record<string, number>}
 */
function buildConflictSeverityCounts(conflicts) {
    const severityCounts = new Map();

    for (const conflict of conflicts) {
        const severity = conflict?.severity ?? "info";
        severityCounts.set(severity, (severityCounts.get(severity) ?? 0) + 1);
    }

    return Object.fromEntries(severityCounts.entries());
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

    const renameSummaries = normalizedOperations.map(buildRenameSummary);
    const { impactedFileCount, totalReferenceCount } =
        buildOperationReferenceMetrics(normalizedOperations);
    const severityCounts = buildConflictSeverityCounts(normalizedConflicts);

    const summary = {
        renameCount: normalizedOperations.length,
        impactedFileCount,
        totalReferenceCount,
        conflictCount: normalizedConflicts.length,
        severityCounts
    };

    return {
        summary,
        operations: normalizedOperations,
        renames: renameSummaries,
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
                ([severity, count]) => `${count} ${severity}${pluralize(count)}`
            );

        const conflictSuffix =
            severityParts.length > 0 ? ` (${severityParts.join(", ")})` : "";
        lines.push(`  Conflicts: ${summary.conflictCount}${conflictSuffix}`);
    } else {
        lines.push("  Conflicts: none");
    }

    if (operations.length > 0) {
        lines.push("", "Rename plan:");

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
        lines.push("", "Conflicts:");

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

    const renamesSource = Array.isArray(report?.renames)
        ? report.renames.filter(
              (rename) => rename && typeof rename === "object"
          )
        : null;

    const renames =
        renamesSource && renamesSource.length === operations.length
            ? renamesSource
            : buildRenameSummaries(operations);

    return { operations, renames, conflicts };
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
    const { renames, conflicts } = getNormalizedReportCollections(report);

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

function resolveSummarySeverity(conflicts) {
    if (!isNonEmptyArray(conflicts)) {
        return "info";
    }

    if (conflicts.some((conflict) => conflict.severity === "error")) {
        return "error";
    }

    if (conflicts.some((conflict) => conflict.severity === "warning")) {
        return "warning";
    }

    return "info";
}

function pushDiagnosticEntry({ diagnostics, report, text }) {
    if (!Array.isArray(diagnostics)) {
        return;
    }

    const { renames, conflicts } = getNormalizedReportCollections(report);
    const severity = resolveSummarySeverity(conflicts);

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
    const conflicts = getIdentifierCaseOption(options, "Conflicts", {
        fallback: []
    });
    const dryRun = getIdentifierCaseOption(options, "DryRun");
    const logFilePath = getIdentifierCaseOption(options, "ReportLogPath", {
        fallback: null
    });
    const fsFacade = getIdentifierCaseOption(options, "Fs", { fallback: null });

    return {
        renamePlan,
        conflicts,
        dryRun,
        logFilePath,
        logger: options.logger ?? null,
        diagnostics: toDiagnosticsArray(options.diagnostics),
        fsFacade,
        now: pickFunction(
            options.__identifierCaseNow,
            options.identifierCaseNow
        )
    };
}

function resolveReportContext(options) {
    const inlinePlan = getIdentifierCaseOption(options, "RenamePlan", {
        fallback: null
    });

    if (inlinePlan) {
        return resolveInlineReportContext(options, inlinePlan);
    }

    return consumeIdentifierCaseDryRunContext(options.filepath ?? null);
}

function resolveDryRunFlag(options, contextDryRun) {
    const explicitDryRun = getIdentifierCaseOption(options, "DryRun");
    if (explicitDryRun !== undefined) {
        return explicitDryRun !== false;
    }

    if (contextDryRun !== undefined) {
        return contextDryRun !== false;
    }

    return false;
}

function finalizeIdentifierCaseReport(options, result) {
    setIdentifierCaseOption(options, "__identifierCaseReportEmitted", true);

    if (result !== undefined) {
        setIdentifierCaseOption(
            options,
            "__identifierCaseReportResult",
            result
        );
    }

    return result ?? null;
}

function resolveReportIo(options, context) {
    const logger = context.logger ?? options.logger ?? console;
    const diagnostics =
        context.diagnostics ?? toDiagnosticsArray(options.diagnostics);
    const logFilePath =
        context.logFilePath ??
        getIdentifierCaseOption(options, "ReportLogPath", { fallback: null });
    const fsFacade =
        context.fsFacade ??
        getIdentifierCaseOption(options, "Fs", { fallback: defaultFsFacade });
    const now =
        context.now ??
        pickFunction(options.__identifierCaseNow, options.identifierCaseNow) ??
        defaultNow;

    return { logger, diagnostics, logFilePath, fsFacade, now };
}

export function maybeReportIdentifierCaseDryRun(options) {
    if (!options || options.__identifierCaseReportEmitted) {
        return null;
    }

    const context = resolveReportContext(options);

    if (!context) {
        return null;
    }

    const { renamePlan } = context;

    if (!renamePlan) {
        return finalizeIdentifierCaseReport(options);
    }

    const { conflicts = [], dryRun: contextDryRun } = context;

    const shouldDryRun = resolveDryRunFlag(options, contextDryRun);

    setIdentifierCaseOption(options, "__identifierCaseDryRun", shouldDryRun);

    if (!shouldDryRun) {
        const result = summarizeIdentifierCasePlan({
            renamePlan,
            conflicts
        });

        return finalizeIdentifierCaseReport(options, result);
    }

    const reportIo = resolveReportIo(options, context);

    const result = reportIdentifierCasePlan({
        renamePlan,
        conflicts,
        ...reportIo
    });

    return finalizeIdentifierCaseReport(options, result);
}
