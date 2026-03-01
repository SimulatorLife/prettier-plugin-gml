/**
 * Workspace edit types and utilities for the refactor engine.
 * Defines text edits, file renames, and metadata patches that collectively
 * represent a semantic-safe refactoring operation across multiple files.
 */

import { Core } from "@gml-modules/core";

export interface TextEdit {
    path: string;
    start: number;
    end: number;
    newText: string;
}

export interface FileRename {
    oldPath: string;
    newPath: string;
}

/**
 * Full-document metadata rewrite for `.yy/.yyp` resources.
 */
export interface MetadataEdit {
    path: string;
    content: string;
}

export type GroupedTextEdits = Map<string, Array<Pick<TextEdit, "start" | "end" | "newText">>>;

export class WorkspaceEdit {
    readonly edits: Array<TextEdit>;
    readonly fileRenames: Array<FileRename> = [];
    readonly metadataEdits: Array<MetadataEdit> = [];

    /**
     * Create a WorkspaceEdit container for managing text edits and file operations across files.
     *
     * @param initialEdits Optional iterable of edits to initialize with
     */
    constructor(initialEdits: Iterable<TextEdit> = []) {
        this.edits = Array.from(initialEdits);
    }

    addEdit(path: string, start: number, end: number, newText: string): void {
        this.edits.push({ path, start, end, newText });
    }

    addFileRename(oldPath: string, newPath: string): void {
        this.fileRenames.push({ oldPath, newPath });
    }

    /**
     * Queue a full-document metadata rewrite.
     */
    addMetadataEdit(path: string, content: string): void {
        this.metadataEdits.push({ path, content });
    }

    groupByFile(): GroupedTextEdits {
        const grouped: GroupedTextEdits = new Map();

        for (const edit of this.edits) {
            let fileEdits = grouped.get(edit.path);
            if (!fileEdits) {
                fileEdits = [];
                grouped.set(edit.path, fileEdits);
            }

            fileEdits.push({
                start: edit.start,
                end: edit.end,
                newText: edit.newText
            });
        }

        for (const [path, fileEdits] of grouped.entries()) {
            grouped.set(
                path,
                fileEdits.toSorted((a, b) => b.start - a.start)
            );
        }

        return grouped;
    }
}

/**
 * Safely extract metadataEdits and fileRenames arrays from a workspace-like object.
 * Returns empty arrays if the properties are missing or not arrays.
 *
 * @param workspace - An object that may contain metadataEdits and/or fileRenames properties
 * @returns Object containing validated metadataEdits and fileRenames arrays
 */
export function getWorkspaceArrays(workspace: { metadataEdits?: unknown; fileRenames?: unknown }): {
    metadataEdits: Array<MetadataEdit>;
    fileRenames: Array<FileRename>;
} {
    return {
        metadataEdits: Array.isArray(workspace.metadataEdits) ? (workspace.metadataEdits as Array<MetadataEdit>) : [],
        fileRenames: Array.isArray(workspace.fileRenames) ? (workspace.fileRenames as Array<FileRename>) : []
    };
}

/**
 * Determine whether a value implements the `WorkspaceEdit` interface by confirming
 * it exposes an `edits` array property and the required methods (`addEdit`, `groupByFile`).
 * Accepts any object that conforms to the expected contract (duck-typed interface) so
 * refactor operations can work with substitutable implementations without relying
 * on `instanceof` checks that break polymorphism across module boundaries.
 *
 * @param {unknown} [value] Candidate value to inspect.
 * @returns {boolean} `true` when the value behaves like a WorkspaceEdit.
 */
export function isWorkspaceEditLike(value?: unknown): boolean {
    if (!Core.isObjectLike(value)) {
        return false;
    }

    const candidate = value as Record<string, unknown>;

    return (
        Array.isArray(candidate.edits) &&
        Core.hasFunction(candidate, "addEdit") &&
        Core.hasFunction(candidate, "groupByFile")
    );
}
