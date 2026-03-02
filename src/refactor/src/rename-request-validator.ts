/**
 * Rename request validation (single and batch).
 *
 * Provides standalone functions for validating a proposed rename before any
 * workspace edits are planned or applied. Validation covers identifier syntax,
 * symbol existence, conflict detection (shadowing, reserved keywords, cross-file
 * consistency), and – optionally – hot-reload safety.
 */

import { Core } from "@gml-modules/core";

import * as HotReload from "./hot-reload.js";
import type { SemanticQueryCache } from "./semantic-cache.js";
import * as SymbolQueries from "./symbol-queries.js";
import {
    type BatchRenameValidation,
    ConflictType,
    type HotReloadSafetySummary,
    type PartialSemanticAnalyzer,
    type RenameRequest,
    type ValidateRenameRequestOptions,
    type ValidationSummary
} from "./types.js";
import { detectCircularRenames, detectRenameConflicts, validateCrossFileConsistency } from "./validation.js";
import { assertValidIdentifierName, extractSymbolName } from "./validation-utils.js";

/**
 * Compute the validation result for a single rename request.
 *
 * Validates the request structure, identifier syntax, symbol existence,
 * conflict detection, cross-file consistency, and optionally hot-reload safety.
 * Returns a rich `ValidationSummary` that callers can surface without throwing.
 *
 * @param request - The rename request to validate.
 * @param options - Optional flags such as `includeHotReload`.
 * @param semantic - Optional semantic analyzer for existence/conflict queries.
 * @param semanticCache - Cache wrapping semantic occurrence lookups.
 * @param hotReloadSafetyChecker - Optional override for hot-reload safety check.
 *   Defaults to `HotReload.checkHotReloadSafety`. Pass `(req) => this.checkHotReloadSafety(req)`
 *   from class methods to preserve override semantics.
 * @returns Validation summary including errors, warnings, and optional hot-reload status.
 */
export async function computeRenameValidation(
    request: RenameRequest,
    options: ValidateRenameRequestOptions | undefined,
    semantic: PartialSemanticAnalyzer | null,
    semanticCache: SemanticQueryCache,
    hotReloadSafetyChecker?: (request: RenameRequest) => Promise<HotReloadSafetySummary>
): Promise<ValidationSummary & { symbolName?: string; occurrenceCount?: number; hotReload?: HotReloadSafetySummary }> {
    const { symbolId, newName } = request ?? {};
    const opts = options ?? {};
    const errors: Array<string> = [];
    const warnings: Array<string> = [];
    let hotReload: HotReloadSafetySummary | undefined;

    if (!symbolId || !newName) {
        errors.push("Both symbolId and newName are required");
        return { valid: false, errors, warnings };
    }

    if (typeof symbolId !== "string") {
        errors.push(`symbolId must be a string, received ${typeof symbolId}`);
        return { valid: false, errors, warnings };
    }

    if (typeof newName !== "string") {
        errors.push(`newName must be a string, received ${typeof newName}`);
        return { valid: false, errors, warnings };
    }

    let normalizedNewName: string;
    try {
        normalizedNewName = assertValidIdentifierName(newName);
    } catch (error) {
        errors.push(Core.getErrorMessage(error));
        return { valid: false, errors, warnings };
    }

    if (semantic) {
        const exists = await SymbolQueries.validateSymbolExists(symbolId, semantic);
        if (!exists) {
            errors.push(`Symbol '${symbolId}' not found in semantic index. Ensure the project has been analyzed.`);
            return { valid: false, errors, warnings };
        }
    } else {
        warnings.push("No semantic analyzer available - cannot verify symbol existence");
    }

    const symbolName = extractSymbolName(symbolId);

    if (symbolName === normalizedNewName) {
        errors.push(`The new name '${normalizedNewName}' matches the existing identifier`);
        return { valid: false, errors, warnings };
    }

    const occurrences = await semanticCache.getSymbolOccurrences(symbolName);

    if (occurrences.length === 0) {
        warnings.push(`No occurrences found for symbol '${symbolName}' - rename will have no effect`);
    }

    const conflicts = await detectRenameConflicts(symbolName, normalizedNewName, occurrences, semantic, semantic);

    for (const conflict of conflicts) {
        if (conflict.type === ConflictType.RESERVED || conflict.type === ConflictType.SHADOW) {
            errors.push(conflict.message);
        } else {
            warnings.push(conflict.message);
        }
    }

    const crossFileConflicts = await validateCrossFileConsistency(symbolId, normalizedNewName, occurrences, semantic);

    for (const conflict of crossFileConflicts) {
        if (conflict.severity === "warning") {
            warnings.push(conflict.message);
        } else {
            errors.push(conflict.message);
        }
    }

    if (opts.includeHotReload && errors.length === 0) {
        const checker = hotReloadSafetyChecker ?? ((req) => HotReload.checkHotReloadSafety(req, semantic));
        hotReload = await checker(request);

        if (!hotReload.safe) {
            const hotReloadMessage = hotReload.requiresRestart
                ? `Hot reload unavailable: ${hotReload.reason}`
                : `Hot reload limitations detected: ${hotReload.reason}`;
            warnings.push(hotReloadMessage);
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
        symbolName,
        occurrenceCount: occurrences.length,
        hotReload
    };
}

/**
 * Validate a batch of rename requests for structural and semantic consistency.
 *
 * Runs per-rename validation via `validateSingle`, then performs batch-level
 * checks: duplicate symbol IDs, duplicate target names, circular rename chains,
 * and cross-rename name confusion.
 *
 * @param renames - Array of rename requests to validate together.
 * @param options - Optional per-rename validation flags.
 * @param validateSingle - Callback that validates one rename in isolation.
 * @returns Aggregated batch validation result with per-rename details.
 */
export async function validateBatchRenameRequests(
    renames: Array<RenameRequest>,
    options: ValidateRenameRequestOptions | undefined,
    validateSingle: (rename: RenameRequest, options?: ValidateRenameRequestOptions) => Promise<ValidationSummary>
): Promise<BatchRenameValidation> {
    const errors: Array<string> = [];
    const warnings: Array<string> = [];
    const renameValidations = new Map<string, ValidationSummary>();
    const conflictingSets: Array<Array<string>> = [];

    if (!Array.isArray(renames)) {
        errors.push("Batch rename requires an array of rename requests");
        return { valid: false, errors, warnings, renameValidations, conflictingSets };
    }

    if (renames.length === 0) {
        errors.push("Batch rename requires at least one rename request");
        return { valid: false, errors, warnings, renameValidations, conflictingSets };
    }

    // Validate each rename request individually.
    await Core.runSequentially(renames, async (rename) => {
        if (!rename || typeof rename !== "object") {
            errors.push("Each rename must be a valid request object");
            return;
        }

        const { symbolId } = rename;
        if (!symbolId || typeof symbolId !== "string") {
            errors.push("Each rename must have a valid symbolId string property");
            return;
        }

        const validation = await validateSingle(rename, options);
        renameValidations.set(symbolId, validation);

        if (!validation.valid) {
            errors.push(`Rename validation failed for '${symbolId}': ${validation.errors.join(", ")}`);
        }

        if (validation.warnings.length > 0) {
            warnings.push(...validation.warnings.map((w) => `${symbolId}: ${w}`));
        }
    });

    // Detect duplicate symbol IDs in the batch.
    const symbolIdCounts = new Map<string, number>();
    for (const rename of renames) {
        if (rename && typeof rename === "object" && typeof rename.symbolId === "string") {
            const count = (symbolIdCounts.get(rename.symbolId) ?? 0) + 1;
            symbolIdCounts.set(rename.symbolId, count);
        }
    }

    for (const [symbolId, count] of symbolIdCounts.entries()) {
        if (count > 1) {
            errors.push(`Duplicate rename request for symbolId '${symbolId}' (${count} entries)`);
            conflictingSets.push(Array.from({ length: count }, () => symbolId));
        }
    }

    // Detect duplicate target names across the batch to prevent symbol collisions.
    const newNameToSymbols = new Map<string, Array<string>>();
    for (const rename of renames) {
        if (
            !rename ||
            typeof rename !== "object" ||
            !rename.newName ||
            typeof rename.newName !== "string" ||
            !rename.symbolId ||
            typeof rename.symbolId !== "string"
        ) {
            continue;
        }

        try {
            const normalizedNewName = assertValidIdentifierName(rename.newName);
            if (!newNameToSymbols.has(normalizedNewName)) {
                newNameToSymbols.set(normalizedNewName, []);
            }
            newNameToSymbols.get(normalizedNewName).push(rename.symbolId);
        } catch {
            continue;
        }
    }

    for (const [newName, symbolIds] of newNameToSymbols.entries()) {
        if (symbolIds.length > 1) {
            errors.push(`Multiple symbols cannot be renamed to '${newName}': ${symbolIds.join(", ")}`);
            conflictingSets.push(symbolIds);
        }
    }

    // Detect circular rename chains.
    const validRenames = renames.filter(
        (rename) =>
            rename &&
            typeof rename === "object" &&
            rename.symbolId &&
            typeof rename.symbolId === "string" &&
            rename.newName &&
            typeof rename.newName === "string"
    );

    const circularChain = detectCircularRenames(validRenames);
    if (circularChain.length > 0) {
        const chain = circularChain.map((id) => extractSymbolName(id)).join(" → ");
        errors.push(`Circular rename chain detected: ${chain}. Cannot rename symbols in a cycle.`);
        conflictingSets.push(circularChain);
    }

    // Warn when a new name matches an old name elsewhere in the batch (potential confusion).
    const oldNames = new Set<string>();

    for (const rename of validRenames) {
        const oldName = extractSymbolName(rename.symbolId);
        if (oldName) {
            oldNames.add(oldName);
        }
    }

    for (const rename of validRenames) {
        const oldName = extractSymbolName(rename.symbolId);
        if (!oldName) {
            continue;
        }

        try {
            const normalizedNewName = assertValidIdentifierName(rename.newName);

            if (oldNames.has(normalizedNewName) && oldName !== normalizedNewName) {
                warnings.push(
                    `Rename introduces potential confusion: '${rename.symbolId}' renamed to '${normalizedNewName}' which was an original symbol name in this batch`
                );
            }
        } catch {
            continue;
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
        renameValidations,
        conflictingSets
    };
}
