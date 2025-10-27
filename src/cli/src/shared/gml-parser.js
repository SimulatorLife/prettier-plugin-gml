import { resolveModuleDefaultExport } from "../dependencies.js";

let gmlParserPromise = null;

export function loadGmlParser() {
    if (!gmlParserPromise) {
        gmlParserPromise = import("gamemaker-language-parser").then(
            resolveModuleDefaultExport
        );
    }

    return gmlParserPromise;
}
