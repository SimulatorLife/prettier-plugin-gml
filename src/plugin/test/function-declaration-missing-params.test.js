import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import prettier from "prettier";

import {
    restoreDefaultGmlPluginComponents,
    setGmlPluginComponentProvider
} from "../src/plugin-components.js";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

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
