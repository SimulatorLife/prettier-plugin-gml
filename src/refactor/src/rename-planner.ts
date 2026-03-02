/**
 * Core rename planning logic.
 *
 * Provides a standalone function that constructs the `WorkspaceEdit` for a
 * rename request – validating the symbol exists, gathering occurrences, checking
 * for conflicts, and collecting any additional edits from the semantic analyzer
 * (file renames, metadata patches, etc.).
 */

import { Core } from "@gml-modules/core";

import type { SemanticQueryCache } from "./semantic-cache.js";
import * as SymbolQueries from "./symbol-queries.js";
import { type PartialSemanticAnalyzer, type RenameRequest } from "./types.js";
import { detectRenameConflicts } from "./validation.js";
import { assertRenameRequest, assertValidIdentifierName, extractSymbolName } from "./validation-utils.js";
import { WorkspaceEdit } from "./workspace-edit.js";

/**
 * Build a `WorkspaceEdit` for a rename operation.
 *
 * Validates the request, confirms the symbol exists, gathers all occurrences,
 * detects conflicts, and assembles text/file/metadata edits into a workspace
 * edit that can be applied atomically.
 *
 * @param request - The rename request with symbolId and newName.
 * @param semantic - Optional semantic analyzer for symbol/occurrence queries.
 * @param semanticCache - Cache wrapping semantic occurrence lookups.
 * @returns Workspace edit containing all changes required for the rename.
 * @throws If the symbol does not exist, the new name is invalid, or conflicts exist.
 */
export async function buildRenameWorkspace(
    request: RenameRequest,
    semantic: PartialSemanticAnalyzer | null,
    semanticCache: SemanticQueryCache
): Promise<WorkspaceEdit> {
    assertRenameRequest(request, "planRename");
    const { symbolId, newName } = request;

    const normalizedNewName = assertValidIdentifierName(newName);

    // Confirm the symbol exists before proceeding.
    const exists = await SymbolQueries.validateSymbolExists(symbolId, semantic);
    if (!exists) {
        throw new Error(
            `Symbol '${symbolId}' not found in semantic index. ` +
                `Ensure the project has been analyzed before attempting renames.`
        );
    }

    // Extract the base name for occurrence lookups (e.g. "gml/script/scr_foo" → "scr_foo").
    const symbolName = extractSymbolName(symbolId);

    if (symbolName === normalizedNewName) {
        throw new Error(`The new name '${normalizedNewName}' matches the existing identifier`);
    }

    // Collect all occurrences (definitions and references) of the symbol.
    const occurrences = await semanticCache.getSymbolOccurrences(symbolName);

    // Detect conflicts (shadowing, reserved keywords, etc.) before writing edits.
    const conflicts = await detectRenameConflicts(symbolName, normalizedNewName, occurrences, semantic, semantic);

    if (conflicts.length > 0) {
        const messages = conflicts.map((c) => c.message).join("; ");
        throw new Error(`Cannot rename '${symbolName}' to '${normalizedNewName}': ${messages}`);
    }

    // Build a workspace edit with a text replacement at every occurrence site.
    const workspace = new WorkspaceEdit();

    for (const occurrence of occurrences) {
        workspace.addEdit(occurrence.path, occurrence.start, occurrence.end, normalizedNewName);
    }

    // Collect any additional edits (file renames, metadata patches) provided by
    // the semantic analyzer (e.g. updating .yy resource files on asset renames).
    if (Core.hasMethods(semantic, "getAdditionalSymbolEdits")) {
        const additionalEdits = await semantic.getAdditionalSymbolEdits(symbolId, normalizedNewName);
        if (additionalEdits && Array.isArray(additionalEdits.edits)) {
            for (const edit of additionalEdits.edits) {
                workspace.addEdit(edit.path, edit.start, edit.end, edit.newText);
            }
        }
        if (additionalEdits && Array.isArray(additionalEdits.fileRenames)) {
            for (const rename of additionalEdits.fileRenames) {
                workspace.addFileRename(rename.oldPath, rename.newPath);
            }
        }
        if (additionalEdits && Array.isArray(additionalEdits.metadataEdits)) {
            for (const metadataEdit of additionalEdits.metadataEdits) {
                workspace.addMetadataEdit(metadataEdit.path, metadataEdit.content);
            }
        }
    }

    return workspace;
}
