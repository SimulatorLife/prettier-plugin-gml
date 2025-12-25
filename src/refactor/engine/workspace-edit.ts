export interface TextEdit {
    path: string;
    start: number;
    end: number;
    newText: string;
}

export type GroupedTextEdits = Map<
    string,
    Array<Pick<TextEdit, "start" | "end" | "newText">>
>;

export class WorkspaceEdit {
    public readonly edits: Array<TextEdit>;

    constructor(initialEdits: Iterable<TextEdit> = []) {
        this.edits = Array.from(initialEdits);
    }

    addEdit(path: string, start: number, end: number, newText: string): void {
        this.edits.push({ path, start, end, newText });
    }

    groupByFile(): GroupedTextEdits {
        const grouped: GroupedTextEdits = new Map();

        for (const edit of this.edits) {
            if (!grouped.has(edit.path)) {
                grouped.set(edit.path, []);
            }

            grouped.get(edit.path).push({
                start: edit.start,
                end: edit.end,
                newText: edit.newText
            });
        }

        for (const edits of grouped.values()) {
            edits.sort((a, b) => b.start - a.start);
        }

        return grouped;
    }
}
