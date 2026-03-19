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

export type WorkspaceEditTelemetry = {
    textEditCount: number;
    fileRenameCount: number;
    metadataEditCount: number;
    touchedFileCount: number;
    totalTextBytes: number;
    highWaterTextBytes: number;
};

type WorkspaceEditTelemetryState = {
    totalTextBytes: number;
    highWaterTextBytes: number;
    touchedFiles: Set<string>;
};

const workspaceEditTelemetryState = new WeakMap<WorkspaceEdit, WorkspaceEditTelemetryState>();

function getTelemetryState(workspace: WorkspaceEdit): WorkspaceEditTelemetryState {
    const existing = workspaceEditTelemetryState.get(workspace);
    if (existing) {
        return existing;
    }

    const created: WorkspaceEditTelemetryState = {
        totalTextBytes: 0,
        highWaterTextBytes: 0,
        touchedFiles: new Set<string>()
    };
    workspaceEditTelemetryState.set(workspace, created);
    return created;
}

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
        const telemetryState = getTelemetryState(this);
        this.edits.push({ path, start, end, newText });
        telemetryState.touchedFiles.add(path);
        telemetryState.totalTextBytes += Buffer.byteLength(newText, "utf8");
        telemetryState.highWaterTextBytes = Math.max(telemetryState.highWaterTextBytes, telemetryState.totalTextBytes);
    }

    addFileRename(oldPath: string, newPath: string): void {
        const telemetryState = getTelemetryState(this);
        this.fileRenames.push({ oldPath, newPath });
        telemetryState.touchedFiles.add(oldPath);
        telemetryState.touchedFiles.add(newPath);
    }

    /**
     * Queue a full-document metadata rewrite.
     */
    addMetadataEdit(path: string, content: string): void {
        const telemetryState = getTelemetryState(this);
        this.metadataEdits.push({ path, content });
        telemetryState.touchedFiles.add(path);
        telemetryState.totalTextBytes += Buffer.byteLength(content, "utf8");
        telemetryState.highWaterTextBytes = Math.max(telemetryState.highWaterTextBytes, telemetryState.totalTextBytes);
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
 * Return size/counter telemetry collected while building a workspace edit.
 */
export function getWorkspaceEditTelemetry(workspace: WorkspaceEdit): WorkspaceEditTelemetry {
    const telemetryState = getTelemetryState(workspace);
    return {
        textEditCount: workspace.edits.length,
        fileRenameCount: workspace.fileRenames.length,
        metadataEditCount: workspace.metadataEdits.length,
        touchedFileCount: telemetryState.touchedFiles.size,
        totalTextBytes: telemetryState.totalTextBytes,
        highWaterTextBytes: telemetryState.highWaterTextBytes
    };
}

/**
 * Determine whether a value behaves like a {@link WorkspaceEdit} by confirming
 * it exposes an `edits` array and the required methods. Accepts any object that
 * conforms to the expected contract (duck-typed interface) so refactor operations
 * can work with substitutable implementations without relying on `instanceof` checks
 * that break polymorphism across module boundaries.
 *
 * @param value - Candidate value to inspect.
 * @returns `true` when the value exposes the WorkspaceEdit contract.
 */
export function isWorkspaceEditLike(value?: unknown): boolean {
    if (value == null || typeof value !== "object") {
        return false;
    }

    const candidate = value as Record<string, unknown>;

    return (
        Array.isArray(candidate.edits) &&
        typeof candidate.addEdit === "function" &&
        typeof candidate.groupByFile === "function"
    );
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
