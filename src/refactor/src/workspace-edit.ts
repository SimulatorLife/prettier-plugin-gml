export interface TextEdit {
    path: string;
    start: number;
    end: number;
    newText: string;
}

export type GroupedTextEdits = Map<string, Array<Pick<TextEdit, "start" | "end" | "newText">>>;

export interface WorkspaceEdit {
    readonly edits: Array<TextEdit>;
    addEdit(path: string, start: number, end: number, newText: string): void;
    groupByFile(): GroupedTextEdits;
}

/**
 * Create a WorkspaceEdit container for managing text edits across files.
 *
 * @param initialEdits Optional iterable of edits to initialize with
 * @returns WorkspaceEdit instance
 */
export function WorkspaceEdit(initialEdits: Iterable<TextEdit> = []): WorkspaceEdit {
    const edits: Array<TextEdit> = Array.from(initialEdits);

    return {
        edits,
        addEdit(path: string, start: number, end: number, newText: string) {
            edits.push({ path, start, end, newText });
        },
        groupByFile() {
            const grouped: GroupedTextEdits = new Map();

            for (const edit of edits) {
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
    };
}
