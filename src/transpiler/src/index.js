// Minimal placeholder for the future GML → JS transpiler.
export class GmlTranspiler {
    constructor({ parser, semantic, shared } = {}) {
        this.parser = parser;
        this.semantic = semantic;
        this.shared = shared;
    }

    async transpileScript(request) {
        const { sourceText, symbolId } = request ?? {};
        if (typeof sourceText !== "string" || !symbolId) {
            throw new TypeError(
                "transpileScript requires sourceText and symbolId"
            );
        }

        throw new Error("transpileScript is not implemented yet");
    }
}

export function createTranspiler(dependencies = {}) {
    return new GmlTranspiler(dependencies);
}
