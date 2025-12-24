import assert from "node:assert/strict";
import test from "node:test";

import {
    restoreDefaultGmlPluginComponents,
    setGmlPluginComponentProvider
} from "../src/components/plugin-components.js";

import { Plugin } from "../src/index.js";

void test(
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

            const formatted = await Plugin.format(source, {
                parser: "gml-parse"
            });

            assert.strictEqual(
                formatted,
                [
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
