// Placeholder refactor engine that will coordinate semantic-safe edits.
export class RefactorEngine {
    constructor({ parser, semantic, formatter } = {}) {
        this.parser = parser;
        this.semantic = semantic;
        this.formatter = formatter;
    }

    async planRename(request) {
        const { symbolId, newName } = request ?? {};
        if (!symbolId || !newName) {
            throw new TypeError("planRename requires symbolId and newName");
        }

        throw new Error("planRename is not implemented yet");
    }
}

export function createRefactorEngine(dependencies = {}) {
    return new RefactorEngine(dependencies);
}
