/**
 * Rename impact analysis and post-edit integrity verification.
 *
 * Provides standalone functions for analysing how a proposed rename will affect
 * the project (occurrences, dependents, conflicts) and for verifying that the
 * actual file contents are consistent after edits have been applied.
 */

import { Core } from "@gml-modules/core";

import type { SemanticQueryCache } from "./semantic-cache.js";
import * as SymbolQueries from "./symbol-queries.js";
import {
    type ConflictEntry,
    ConflictType,
    OccurrenceKind,
    type ParserBridge,
    type PartialSemanticAnalyzer,
    type RenameImpactAnalysis,
    type RenameRequest,
    type ValidationSummary,
    type WorkspaceReadFile
} from "./types.js";
import { detectRenameConflicts } from "./validation.js";
import { assertRenameRequest, assertValidIdentifierName, extractSymbolName } from "./validation-utils.js";
import { type WorkspaceEdit } from "./workspace-edit.js";

/**
 * Analyse the full impact of a proposed rename without applying it.
 *
 * Gathers occurrence counts, affected files, detected conflicts, and the list
 * of dependent symbols that would need a hot-reload after the rename.
 *
 * @param request - The rename request to analyse.
 * @param semantic - Optional semantic analyzer for occurrence/dependency queries.
 * @param semanticCache - Cache that wraps semantic occurrence queries.
 * @returns Detailed impact analysis including conflicts and per-file statistics.
 */
export async function analyzeRenameImpact(
    request: RenameRequest,
    semantic: PartialSemanticAnalyzer | null,
    semanticCache: SemanticQueryCache
): Promise<RenameImpactAnalysis> {
    assertRenameRequest(request, "analyzeRenameImpact");
    const { symbolId, newName } = request;

    const normalizedNewName = assertValidIdentifierName(newName);

    const oldName = extractSymbolName(symbolId);
    const summary = {
        symbolId,
        oldName,
        newName: normalizedNewName,
        affectedFiles: new Set<string>(),
        totalOccurrences: 0,
        definitionCount: 0,
        referenceCount: 0,
        hotReloadRequired: false,
        dependentSymbols: new Set<string>()
    };

    const serializeSummary = () => ({
        symbolId: summary.symbolId,
        oldName: summary.oldName,
        newName: summary.newName,
        affectedFiles: Array.from(summary.affectedFiles),
        totalOccurrences: summary.totalOccurrences,
        definitionCount: summary.definitionCount,
        referenceCount: summary.referenceCount,
        hotReloadRequired: summary.hotReloadRequired,
        dependentSymbols: Array.from(summary.dependentSymbols)
    });

    const conflicts: Array<ConflictEntry> = [];
    const warnings: Array<ConflictEntry> = [];
    let totalOccurrences = 0;
    let hotReloadRequired = false;

    try {
        // Validate symbol exists before gathering occurrences.
        const exists = await SymbolQueries.validateSymbolExists(symbolId, semantic);
        if (!exists) {
            conflicts.push({
                type: ConflictType.MISSING_SYMBOL,
                message: `Symbol '${symbolId}' not found in semantic index`,
                severity: "error"
            });
            return {
                valid: false,
                summary: serializeSummary(),
                conflicts,
                warnings
            };
        }

        // Gather all occurrences (definitions + references) to populate statistics.
        const occurrences = await semanticCache.getSymbolOccurrences(summary.oldName);
        totalOccurrences = occurrences.length;

        // Record which files are affected and categorise occurrences by kind.
        for (const occ of occurrences) {
            summary.affectedFiles.add(occ.path);
            if (occ.kind === OccurrenceKind.DEFINITION) {
                summary.definitionCount++;
            } else {
                summary.referenceCount++;
            }
        }

        // Detect potential rename conflicts (shadowing, reserved keywords, etc.).
        const detectedConflicts = await detectRenameConflicts(
            summary.oldName,
            normalizedNewName,
            occurrences,
            semantic,
            semantic
        );
        conflicts.push(...detectedConflicts);

        // Determine hot-reload scope: if occurrences exist, dependent symbols must
        // also be recompiled to pick up the renamed binding.
        if (totalOccurrences > 0) {
            hotReloadRequired = true;

            if (Core.hasMethods(semantic, "getDependents")) {
                const dependents = (await semantic.getDependents([symbolId])) ?? [];
                for (const dep of dependents) {
                    summary.dependentSymbols.add(dep.symbolId);
                }
            }
        }

        // Warn for unusually broad renames so the user can review scope.
        if (totalOccurrences > 50) {
            warnings.push({
                type: ConflictType.LARGE_RENAME,
                message: `This rename will affect ${totalOccurrences} occurrences across ${summary.affectedFiles.size} files`,
                severity: "warning"
            });
        }

        if (summary.dependentSymbols.size > 10) {
            warnings.push({
                type: ConflictType.MANY_DEPENDENTS,
                message: `${summary.dependentSymbols.size} other symbols depend on this symbol`,
                severity: "info"
            });
        }
    } catch (error) {
        conflicts.push({
            type: ConflictType.ANALYSIS_ERROR,
            message: `Failed to analyze impact: ${Core.getErrorMessage(error)}`,
            severity: "error"
        });
    }

    summary.totalOccurrences = totalOccurrences;
    summary.hotReloadRequired = hotReloadRequired;

    return {
        valid: conflicts.length === 0,
        summary: serializeSummary(),
        conflicts,
        warnings
    };
}

/**
 * Verify semantic integrity after workspace edits have been applied.
 *
 * Performs heuristic checks on the file contents to confirm that:
 * - The old identifier no longer appears as a non-comment token.
 * - The new identifier is present.
 * - No reserved keyword conflicts were introduced.
 * - Files still parse successfully (when a parser is available).
 *
 * @param request - Verification inputs: symbol IDs, old/new names, workspace, reader.
 * @param semantic - Optional semantic analyzer for keyword and occurrence queries.
 * @param parser - Optional parser for post-edit syntax validation.
 * @returns Validation summary with errors and warnings.
 */
export async function verifyPostEditIntegrity(
    request: {
        symbolId: string;
        oldName: string;
        newName: string;
        workspace: WorkspaceEdit;
        readFile: WorkspaceReadFile;
    },
    semantic: PartialSemanticAnalyzer | null,
    parser: ParserBridge | null
): Promise<ValidationSummary> {
    const { symbolId, oldName, newName, workspace, readFile } = request;
    const errors: Array<string> = [];
    const warnings: Array<string> = [];

    if (!Core.isNonEmptyTrimmedString(symbolId)) {
        errors.push("Invalid symbolId");
        return { valid: false, errors, warnings };
    }

    if (!Core.isNonEmptyTrimmedString(oldName)) {
        errors.push("Invalid oldName");
        return { valid: false, errors, warnings };
    }

    if (!Core.isNonEmptyTrimmedString(newName)) {
        errors.push("Invalid newName");
        return { valid: false, errors, warnings };
    }

    if (!workspace || !Core.isWorkspaceEditLike(workspace)) {
        errors.push("Invalid workspace edit");
        return { valid: false, errors, warnings };
    }

    if (!readFile || typeof readFile !== "function") {
        errors.push("Invalid readFile function");
        return { valid: false, errors, warnings };
    }

    const grouped = workspace.groupByFile();
    const affectedFiles = Array.from(grouped.keys());

    // Check each edited file for residual old identifiers and presence of the new name.
    await Core.runSequentially(affectedFiles, async (filePath) => {
        let content: string;
        try {
            content = await readFile(filePath);
        } catch (error) {
            errors.push(`Failed to read ${filePath} for post-edit validation: ${Core.getErrorMessage(error)}`);
            return;
        }

        // Heuristic check: old identifier should not appear as a non-comment token.
        const identifierPattern = new RegExp(String.raw`\b${Core.escapeRegExp(oldName)}\b`, "g");
        const oldNameMatches = content.match(identifierPattern);

        if (oldNameMatches && oldNameMatches.length > 0) {
            let allInComments = true;
            const lines = content.split("\n");
            for (const line of lines) {
                if (line.includes(oldName)) {
                    const trimmed = line.trim();
                    const commentIndex = line.indexOf("//");
                    const oldNameIndex = line.indexOf(oldName);
                    const isInLineComment = commentIndex !== -1 && commentIndex < oldNameIndex;
                    const isCommentLine = trimmed.startsWith("//");
                    const isInBlockComment = line.includes("/*") || line.includes("*/");

                    if (!isCommentLine && !isInLineComment && !isInBlockComment) {
                        allInComments = false;
                        break;
                    }
                }
            }

            if (allInComments) {
                warnings.push(
                    `Old name '${oldName}' still appears in comments in ${filePath} - may need manual update`
                );
            } else {
                errors.push(`Old name '${oldName}' still exists in ${filePath} after rename - edits may be incomplete`);
            }
        }

        // Verify new name is present in the file.
        const newIdentifierPattern = new RegExp(String.raw`\b${Core.escapeRegExp(newName)}\b`, "g");
        const newNameMatches = content.match(newIdentifierPattern);

        if (!newNameMatches || newNameMatches.length === 0) {
            warnings.push(`New name '${newName}' does not appear in ${filePath} - verify edits were applied`);
        }
    });

    // Use semantic analyzer to detect conflicts with the new name in other files.
    if (Core.hasMethods(semantic, "getSymbolOccurrences")) {
        try {
            const newOccurrences = await semantic.getSymbolOccurrences(newName);
            const unexpectedOccurrences = newOccurrences.filter((occ) => !affectedFiles.includes(occ.path));

            if (unexpectedOccurrences.length > 0) {
                const conflictPaths = Core.uniqueArray(unexpectedOccurrences.map((o) => o.path)) as Array<string>;
                warnings.push(
                    `New name '${newName}' already exists in ${conflictPaths.length} other file(s): ${conflictPaths.join(", ")} - verify no shadowing occurred`
                );
            }
        } catch (error) {
            warnings.push(`Could not verify occurrences of new name: ${Core.getErrorMessage(error)}`);
        }
    }

    // Verify no reserved keyword was introduced.
    if (Core.hasMethods(semantic, "getReservedKeywords")) {
        try {
            const keywords = await semantic.getReservedKeywords();
            if (keywords.includes(newName.toLowerCase())) {
                errors.push(`New name '${newName}' conflicts with reserved keyword`);
            }
        } catch (error) {
            warnings.push(`Could not verify reserved keywords: ${Core.getErrorMessage(error)}`);
        }
    }

    // Re-parse each affected file to ensure syntax is still valid.
    if (Core.hasMethods(parser, "parse")) {
        await Core.runSequentially(affectedFiles, async (filePath) => {
            try {
                await parser.parse(filePath);
            } catch (parseError) {
                errors.push(
                    `Parse error in ${filePath} after rename: ${Core.getErrorMessage(parseError)} - edits may have broken syntax`
                );
            }
        });
    }

    if (!semantic) {
        warnings.push("No semantic analyzer available - skipping deep semantic validation");
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}
