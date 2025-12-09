// TODO: This seems overly complicated and unnecessary; we can just import the module directly from `@gml-modules/parser` where needed. Then this file can be removed.
import { resolveModuleDefaultExport } from "../../shared/module.js";

let gmlParserPromise = null;

export function loadGmlParser() {
    if (!gmlParserPromise) {
        gmlParserPromise = import("@gml-modules/parser").then((module) => {
            const parserModule = resolveModuleDefaultExport(module);
            if (parserModule && typeof parserModule === "object") {
                const parserNamespace =
                    "Parser" in parserModule
                        ? parserModule.Parser
                        : parserModule;
                if (parserNamespace && typeof parserNamespace === "object") {
                    return parserNamespace.GMLParser ?? parserNamespace;
                }
            }
            return parserModule;
        });
    }

    return gmlParserPromise;
}
