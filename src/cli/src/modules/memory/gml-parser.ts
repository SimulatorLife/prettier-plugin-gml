import { resolveModuleDefaultExport } from "../dependencies.js";

let gmlParserPromise = null;

export function loadGmlParser() {
    if (!gmlParserPromise) {
        gmlParserPromise = import("@gml-modules/parser").then((module) => {
            const parserModule = resolveModuleDefaultExport(module);
            if (parserModule && typeof parserModule === "object") {
                const parserNamespace =
                    "Parser" in parserModule ? parserModule.Parser : parserModule;
                if (parserNamespace && typeof parserNamespace === "object") {
                    return parserNamespace.GMLParser ?? parserNamespace;
                }
            }
            return parserModule;
        });
    }

    return gmlParserPromise;
}
