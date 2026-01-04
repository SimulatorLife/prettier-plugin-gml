export interface TextEdit {
    path: string;
    start: number;
    end: number;
    newText: string;
}

export type GroupedTextEdits = Map<string, Array<Pick<TextEdit, "start" | "end" | "newText">>>;

/**
 * Container for managing text edits across files.
 */
export class WorkspaceEdit {
    readonly edits: Array<TextEdit>;

    /**
     * Create a WorkspaceEdit container for managing text edits across files.
     *
     * @param initialEdits Optional iterable of edits to initialize with
     */
    constructor(initialEdits: Iterable<TextEdit> = []) {
        this.edits = Array.from(initialEdits);
    }

    addEdit(path: string, start: number, end: number, newText: string): void {
        this.edits.push({ path, start, end, newText });
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

        for (const fileEdits of grouped.values()) {
            fileEdits.sort((a, b) => b.start - a.start);
        }

        return grouped;
    }
}
