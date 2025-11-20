import { resolveModuleDefaultExport } from "../dependencies.js";

let gmlParserPromise = null;

export function loadGmlParser() {
    if (!gmlParserPromise) {
        gmlParserPromise = import("@gml-modules/parser").then(
            resolveModuleDefaultExport
        );
    }

    return gmlParserPromise;
}
