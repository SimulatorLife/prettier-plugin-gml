import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import prettier from "prettier";
import { existsSync } from "node:fs";

import {
    restoreDefaultGmlPluginComponents,
    setGmlPluginComponentProvider
} from "../src/components/plugin-components.js";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = (() => {
    const candidates = [
        path.resolve(currentDirectory, "../dist/src/index.js"),
        path.resolve(currentDirectory, "../dist/index.js"),
        path.resolve(currentDirectory, "../src/index.ts"),
        path.resolve(currentDirectory, "../src/plugin-entry.ts"),
        path.resolve(currentDirectory, "../src/index.js"),
        path.resolve(currentDirectory, "../src/gml.js")
    ];
    return candidates.find((p) => existsSync(p)) || candidates[0];
})();

test(
    "printer tolerates function declarations missing params arrays",
    { concurrency: false },
    async () => {
        const defaultComponents = restoreDefaultGmlPluginComponents();
        const defaultParser = defaultComponents.parsers["gml-parse"];
        const baseParse = defaultParser.parse.bind(defaultParser);

        const mutatedComponents = {
            parsers: {
                ...defaultComponents.parsers,
                "gml-parse": {
                    ...defaultParser,
                    parse(text, parsers, options) {
                        const ast = baseParse(text, parsers, options);

                        if (Array.isArray(ast?.body)) {
                            const functionNode = ast.body.find(
                                (node) => node?.type === "FunctionDeclaration"
                            );

                            if (functionNode) {
                                delete functionNode.params;
                            }
                        }

                        return ast;
                    }
                }
            },
            printers: defaultComponents.printers,
            options: defaultComponents.options
        };

        try {
            setGmlPluginComponentProvider(() => mutatedComponents);

            const source = [
                "function demo() {",
                "    return 42;",
                "}",
                ""
            ].join("\n");

            const formatted = await prettier.format(source, {
                parser: "gml-parse",
                plugins: [pluginPath]
            });

            assert.strictEqual(
                formatted,
                [
                    "",
                    "/// @function demo",
                    "function demo() {",
                    "    return 42;",
                    "}",
                    ""
                ].join("\n")
            );
        } finally {
            restoreDefaultGmlPluginComponents();
        }
    }
);
