import { Core } from "@gml-modules/core";

const SEMANTIC_SAFETY_REPORTS_KEY = "__semanticSafetyReports";
const SEMANTIC_SAFETY_REPORT_SERVICE_KEY = "__semanticSafetyReportService";
const LOCAL_FALLBACK_MODE: SemanticSafetyMode = "local-fallback";
const PROJECT_AWARE_MODE: SemanticSafetyMode = "project-aware";

export type SemanticSafetyMode = "local-fallback" | "project-aware";

export type SemanticSafetyReport = Readonly<{
    code: string;
    identifierName?: string;
    message: string;
    mode: SemanticSafetyMode;
    option: "optimizeLoopLengthHoisting" | "preserveGlobalVarStatements";
}>;

export type LoopHoistIdentifierContext = Readonly<{
    filePath: string | null;
    localIdentifierNames: ReadonlySet<string>;
    preferredName: string;
}>;

export type LoopHoistIdentifierResolution = Readonly<{
    identifierName: string;
    mode: SemanticSafetyMode;
    skipReason?: string;
}>;

export type GlobalVarRewriteContext = Readonly<{
    filePath: string | null;
    hasInitializer: boolean;
    identifierName: string;
}>;

export type GlobalVarRewriteAssessment = Readonly<{
    allowRewrite: boolean;
    initializerMode: "existing" | "undefined";
    mode: SemanticSafetyMode;
    skipReason?: string;
}>;

/**
 * Runtime contract used by plugin transforms/printer to request semantic-safe naming decisions.
 */
export type SemanticSafetyRuntime = Readonly<{
    assessGlobalVarRewrite: (context: GlobalVarRewriteContext) => GlobalVarRewriteAssessment | null;
    resolveLoopHoistIdentifier: (context: LoopHoistIdentifierContext) => LoopHoistIdentifierResolution | null;
}>;

export type RefactorRuntime = Readonly<{
    isIdentifierNameOccupiedInProject: (
        context: Readonly<{ filePath: string | null; identifierName: string }>
    ) => boolean;
    listIdentifierOccurrenceFiles: (
        context: Readonly<{ filePath: string | null; identifierName: string }>
    ) => ReadonlySet<string>;
}>;

const DEFAULT_SEMANTIC_SAFETY_RUNTIME: SemanticSafetyRuntime = Object.freeze({
    assessGlobalVarRewrite(context) {
        if (!context.hasInitializer) {
            return {
                allowRewrite: false,
                initializerMode: "existing",
                mode: LOCAL_FALLBACK_MODE,
                skipReason: "Declaration has no initializer and cannot be safely rewritten without project analysis."
            };
        }

        return {
            allowRewrite: true,
            initializerMode: "existing",
            mode: LOCAL_FALLBACK_MODE
        };
    },
    resolveLoopHoistIdentifier(context) {
        return {
            identifierName: context.preferredName,
            mode: LOCAL_FALLBACK_MODE
        };
    }
});

const DEFAULT_REFACTOR_RUNTIME: RefactorRuntime = Object.freeze({
    isIdentifierNameOccupiedInProject() {
        return false;
    },
    listIdentifierOccurrenceFiles() {
        return new Set();
    }
});

let semanticSafetyRuntime: SemanticSafetyRuntime = DEFAULT_SEMANTIC_SAFETY_RUNTIME;
let refactorRuntime: RefactorRuntime = DEFAULT_REFACTOR_RUNTIME;

/**
 * Register a semantic-safety runtime adapter.
 */
export function setSemanticSafetyRuntime(runtime: SemanticSafetyRuntime): void {
    if (!Core.isObjectLike(runtime)) {
        throw new TypeError("Semantic safety runtime must be an object.");
    }

    if (typeof runtime.resolveLoopHoistIdentifier !== "function") {
        throw new TypeError("Semantic safety runtime must implement resolveLoopHoistIdentifier.");
    }

    if (typeof runtime.assessGlobalVarRewrite !== "function") {
        throw new TypeError("Semantic safety runtime must implement assessGlobalVarRewrite.");
    }

    semanticSafetyRuntime = runtime;
}

/**
 * Restore the default semantic-safety runtime implementation.
 */
export function restoreDefaultSemanticSafetyRuntime(): void {
    semanticSafetyRuntime = DEFAULT_SEMANTIC_SAFETY_RUNTIME;
}

/**
 * Register a refactor runtime adapter used for project-occupancy checks.
 */
export function setRefactorRuntime(runtime: RefactorRuntime): void {
    if (!Core.isObjectLike(runtime)) {
        throw new TypeError("Refactor runtime must be an object.");
    }

    if (typeof runtime.isIdentifierNameOccupiedInProject !== "function") {
        throw new TypeError("Refactor runtime must implement isIdentifierNameOccupiedInProject.");
    }

    if (typeof runtime.listIdentifierOccurrenceFiles !== "function") {
        throw new TypeError("Refactor runtime must implement listIdentifierOccurrenceFiles.");
    }

    refactorRuntime = runtime;
}

/**
 * Restore the default no-op refactor runtime implementation.
 */
export function restoreDefaultRefactorRuntime(): void {
    refactorRuntime = DEFAULT_REFACTOR_RUNTIME;
}

/**
 * Emit a semantic-safety report entry onto the active options bag.
 */
export function emitSemanticSafetyReport(options: unknown, report: SemanticSafetyReport): void {
    if (!Core.isObjectLike(options)) {
        return;
    }

    const optionsObject = options as Record<string, unknown>;
    const reportListCandidate = Reflect.get(optionsObject, SEMANTIC_SAFETY_REPORTS_KEY);
    const reportList = Array.isArray(reportListCandidate) ? reportListCandidate : [];

    if (!Array.isArray(reportListCandidate)) {
        Reflect.set(optionsObject, SEMANTIC_SAFETY_REPORTS_KEY, reportList);
    }

    reportList.push(report);

    const reportService = Reflect.get(optionsObject, SEMANTIC_SAFETY_REPORT_SERVICE_KEY);
    if (typeof reportService === "function") {
        reportService(report, optionsObject);
    }
}

function hasSemanticSafetyReportService(options: unknown): boolean {
    if (!Core.isObjectLike(options)) {
        return false;
    }

    const reportService = Reflect.get(options as Record<string, unknown>, SEMANTIC_SAFETY_REPORT_SERVICE_KEY);
    return typeof reportService === "function";
}

/**
 * Resolve a safe identifier name for loop-length hoisting.
 */
export function resolveLoopHoistIdentifier(
    context: LoopHoistIdentifierContext,
    options?: unknown
): LoopHoistIdentifierResolution | null {
    const preferredName = normalizeIdentifier(context.preferredName);
    const localIdentifierNames = context.localIdentifierNames ?? new Set<string>();
    const filePath = context.filePath ?? null;

    let runtimeResolution: LoopHoistIdentifierResolution | null = null;

    try {
        runtimeResolution = semanticSafetyRuntime.resolveLoopHoistIdentifier({
            filePath,
            localIdentifierNames,
            preferredName
        });
    } catch (error) {
        emitSemanticSafetyReport(options, {
            code: "GML_SEMANTIC_SAFETY_RUNTIME_ERROR",
            message: `Semantic safety runtime failed while resolving loop hoist name: ${Core.getErrorMessage(error)}.`,
            mode: LOCAL_FALLBACK_MODE,
            option: "optimizeLoopLengthHoisting"
        });
    }

    if (runtimeResolution?.skipReason) {
        emitSemanticSafetyReport(options, {
            code: "GML_SEMANTIC_SAFETY_LOOP_HOIST_SKIPPED",
            identifierName: preferredName,
            message: runtimeResolution.skipReason,
            mode: runtimeResolution.mode,
            option: "optimizeLoopLengthHoisting"
        });
        return null;
    }

    const requestedName = normalizeIdentifier(runtimeResolution?.identifierName ?? preferredName);
    const resolvedName = findAvailableIdentifierName({
        baseName: requestedName,
        filePath,
        localIdentifierNames
    });

    const resolvedMode = runtimeResolution?.mode ?? LOCAL_FALLBACK_MODE;

    if (
        resolvedName !== requestedName &&
        resolvedMode === LOCAL_FALLBACK_MODE &&
        !hasSemanticSafetyReportService(options)
    ) {
        // Preserve legacy formatter output when semantic-safety reporting is
        // not explicitly enabled for the current formatting run.
        return null;
    }

    if (resolvedName !== requestedName) {
        emitSemanticSafetyReport(options, {
            code: "GML_SEMANTIC_SAFETY_LOOP_HOIST_RENAMED",
            identifierName: requestedName,
            message: `Adjusted loop hoist cache variable '${requestedName}' to '${resolvedName}' to avoid collisions.`,
            mode: resolvedMode,
            option: "optimizeLoopLengthHoisting"
        });
    }

    return {
        identifierName: resolvedName,
        mode: resolvedMode
    };
}

/**
 * Assess whether a globalvar declaration can be rewritten safely.
 */
export function assessGlobalVarRewrite(
    context: GlobalVarRewriteContext,
    options?: unknown
): GlobalVarRewriteAssessment {
    const identifierName = normalizeIdentifier(context.identifierName);
    const filePath = context.filePath ?? null;
    const hasInitializer = context.hasInitializer === true;

    let assessment: GlobalVarRewriteAssessment | null = null;

    try {
        assessment = semanticSafetyRuntime.assessGlobalVarRewrite({
            filePath,
            hasInitializer,
            identifierName
        });
    } catch (error) {
        emitSemanticSafetyReport(options, {
            code: "GML_SEMANTIC_SAFETY_RUNTIME_ERROR",
            identifierName,
            message: `Semantic safety runtime failed while assessing globalvar rewrite: ${Core.getErrorMessage(error)}.`,
            mode: LOCAL_FALLBACK_MODE,
            option: "preserveGlobalVarStatements"
        });
    }

    const fallbackAssessment: GlobalVarRewriteAssessment = hasInitializer
        ? {
              allowRewrite: true,
              initializerMode: "existing",
              mode: LOCAL_FALLBACK_MODE
          }
        : {
              allowRewrite: false,
              initializerMode: "existing",
              mode: LOCAL_FALLBACK_MODE,
              skipReason: "Declaration has no initializer and cannot be safely rewritten without project analysis."
          };

    const resolvedAssessment = assessment ?? fallbackAssessment;

    if (!resolvedAssessment.allowRewrite) {
        emitSemanticSafetyReport(options, {
            code: "GML_SEMANTIC_SAFETY_GLOBALVAR_SKIP",
            identifierName,
            message: resolvedAssessment.skipReason ?? "Skipped globalvar rewrite due to semantic safety guardrails.",
            mode: resolvedAssessment.mode,
            option: "preserveGlobalVarStatements"
        });
        return resolvedAssessment;
    }

    const occurrenceFiles = getIdentifierOccurrenceFiles(identifierName, filePath);
    if (occurrenceFiles.size > 1 || (occurrenceFiles.size === 1 && filePath && !occurrenceFiles.has(filePath))) {
        const files = [...occurrenceFiles.values()].sort().join(", ");
        const skippedAssessment: GlobalVarRewriteAssessment = {
            allowRewrite: false,
            initializerMode: "existing",
            mode: PROJECT_AWARE_MODE,
            skipReason:
                files.length > 0
                    ? `Rewrite requires project-wide edits across multiple files (${files}).`
                    : "Rewrite requires project-wide edits."
        };

        emitSemanticSafetyReport(options, {
            code: "GML_SEMANTIC_SAFETY_GLOBALVAR_PROJECT_SKIP",
            identifierName,
            message: skippedAssessment.skipReason,
            mode: skippedAssessment.mode,
            option: "preserveGlobalVarStatements"
        });

        return skippedAssessment;
    }

    return resolvedAssessment;
}

function normalizeIdentifier(candidate: string): string {
    if (!Core.isNonEmptyString(candidate)) {
        return "cached_len";
    }

    return candidate.trim();
}

function findAvailableIdentifierName({
    baseName,
    filePath,
    localIdentifierNames
}: {
    baseName: string;
    filePath: string | null;
    localIdentifierNames: ReadonlySet<string>;
}): string {
    if (!isIdentifierTaken(baseName, localIdentifierNames, filePath)) {
        return baseName;
    }

    let suffix = 1;
    while (suffix < Number.MAX_SAFE_INTEGER) {
        const candidate = `${baseName}_${suffix}`;
        if (!isIdentifierTaken(candidate, localIdentifierNames, filePath)) {
            return candidate;
        }

        suffix += 1;
    }

    return `${baseName}_${Date.now()}`;
}

function isIdentifierTaken(
    identifierName: string,
    localIdentifierNames: ReadonlySet<string>,
    filePath: string | null
): boolean {
    if (localIdentifierNames.has(identifierName)) {
        return true;
    }

    try {
        return refactorRuntime.isIdentifierNameOccupiedInProject({
            identifierName,
            filePath
        });
    } catch {
        return false;
    }
}

function getIdentifierOccurrenceFiles(identifierName: string, filePath: string | null): ReadonlySet<string> {
    try {
        const occurrenceFiles = refactorRuntime.listIdentifierOccurrenceFiles({
            identifierName,
            filePath
        });

        if (occurrenceFiles && typeof occurrenceFiles[Symbol.iterator] === "function") {
            return new Set(occurrenceFiles);
        }
    } catch {
        // Fall through to empty set when runtime lookups fail.
    }

    return new Set();
}
