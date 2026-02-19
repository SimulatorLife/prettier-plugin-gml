import { Core } from "@gml-modules/core";

const { isObjectLike } = Core;

/**
 * Resolve the identifier-case rename for a node from active printer services.
 */
export function resolveIdentifierCaseRenameForNode(
    node: Record<string, unknown> | null | undefined,
    options: Record<string, unknown> | null | undefined
): string | null {
    if (options?.__identifierCaseDryRun === true) {
        return null;
    }

    let finalResult: string | null = null;
    try {
        const renameLookupService = options?.__identifierCaseRenameLookupService;
        if (typeof renameLookupService === "function") {
            finalResult = renameLookupService(node, options) as string | null;
        }
    } catch {
        /* ignore */
    }

    try {
        if (!finalResult) {
            const renameMap = options?.__identifierCaseRenameMap;
            const nodeStart = node?.start;
            if (
                renameMap &&
                typeof renameMap === "object" &&
                "get" in renameMap &&
                typeof renameMap.get === "function" &&
                nodeStart
            ) {
                const loc = typeof nodeStart === "number" ? { index: nodeStart } : nodeStart;
                const key = Core.buildLocationKey(loc);
                if (key) {
                    const renameMapValue = renameMap.get(key);
                    finalResult = typeof renameMapValue === "string" ? renameMapValue : finalResult;
                }
            }
        }
    } catch {
        /* ignore */
    }

    return finalResult;
}

/**
 * Cache the Program node on options as a best-effort printer optimization.
 */
export function cacheProgramNodeOnPrinterOptions(
    programNode: Record<string, unknown> | null | undefined,
    options: Record<string, unknown> | null | undefined
): void {
    if (!programNode || !isObjectLike(options)) {
        return;
    }

    try {
        Reflect.set(options, "_gmlProgramNode", programNode);
    } catch {
        // Best-effort only; printing can proceed without cached program node.
    }
}

/**
 * Apply an identifier-case plan snapshot on Program nodes when services are available.
 */
export function applyIdentifierCaseSnapshotForProgram(
    programNode: Record<string, unknown> | null | undefined,
    options: Record<string, unknown> | null | undefined
): void {
    const planSnapshot = programNode?.__identifierCasePlanSnapshot;
    if (!planSnapshot) {
        return;
    }

    try {
        const applySnapshotService = options?.__identifierCaseApplySnapshotService;
        if (typeof applySnapshotService === "function") {
            applySnapshotService(planSnapshot, options);
        }
    } catch {
        // Non-fatal: identifier case snapshot application is optional for printing.
    }
}

/**
 * Emit identifier-case dry-run reports when supported by the active printer services.
 */
export function emitIdentifierCaseDryRunReport(options: Record<string, unknown> | null | undefined): void {
    try {
        const dryRunReportService = options?.__identifierCaseDryRunReportService;
        if (typeof dryRunReportService === "function") {
            dryRunReportService(options);
        }
    } catch {
        /* ignore */
    }
}

/**
 * Tear down identifier-case services after Program printing finishes.
 */
export function teardownIdentifierCaseServices(options: Record<string, unknown> | null | undefined): void {
    try {
        const teardownService = options?.__identifierCaseTeardownService;
        if (typeof teardownService === "function") {
            teardownService(options);
        }
    } catch {
        /* ignore */
    }
}
