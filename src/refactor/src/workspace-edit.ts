/**
 * Workspace edit types and utilities for the refactor engine.
 * Defines text edits, file renames, and metadata patches that collectively
 * represent a semantic-safe refactoring operation across multiple files.
 */

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
        metadataEdits: Array.isArray(workspace.metadataEdits) ? workspace.metadataEdits : [],
        fileRenames: Array.isArray(workspace.fileRenames) ? workspace.fileRenames : []
    };
}
