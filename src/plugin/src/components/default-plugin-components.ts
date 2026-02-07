import type { GameMakerAstNode } from "@gml-modules/core";

import { prettierParserAdapter } from "../parsers/index.js";
import { gmlPluginComponentDependencies } from "./plugin-component-bundles.js";
import type { GmlPluginComponentBundle } from "./plugin-types.js";

export function createDefaultGmlPluginComponents(): GmlPluginComponentBundle {
    const { gmlParserAdapter, print, handleComments, printComment, identifierCaseOptions, LogicalOperatorsStyle } =
        gmlPluginComponentDependencies;

    return {
        parsers: {
            "gml-parse": prettierParserAdapter,
            gmlParserAdapter
        },
        printers: {
            "gml-ast": {
                print,
                // Accept any for the runtime types coming from the AST and comment
                // helpers, satisfying TypeScript without adding deep imports.
                isBlockComment: (comment: GameMakerAstNode) => comment?.type === "CommentBlock",
                canAttachComment: (node: GameMakerAstNode) =>
                    node?.type && !node.type.includes("Comment") && node?.type !== "EmptyStatement",
                printComment,
                handleComments
            }
        },
        options: {
            ...identifierCaseOptions,
            optimizeLoopLengthHoisting: {
                since: "0.0.0",
                type: "boolean",
                category: "gml",
                default: true,
                description:
                    "Hoist supported loop size calls out of for-loop conditions by caching the result in a temporary variable."
            },
            condenseStructAssignments: {
                since: "0.0.0",
                type: "boolean",
                category: "gml",
                default: true,
                description:
                    "Condense consecutive struct property assignments into a single struct literal when possible."
            },
            loopLengthHoistFunctionSuffixes: {
                since: "0.0.0",
                type: "string",
                category: "gml",
                default: "",
                description:
                    "Comma-separated overrides for cached loop size variable suffixes (e.g. 'array_length=len,ds_queue_size=count'). Use '-' as the suffix to disable a function."
            },
            allowSingleLineIfStatements: {
                since: "0.0.0",
                type: "boolean",
                category: "gml",
                default: false,
                description:
                    "Collapse single-statement 'if' bodies to a single line (for example, 'if (condition) { return; }'). When disabled, only guard-style single-line 'if' statements that already appear on one line stay collapsed; other bodies expand across multiple lines."
            },
            logicalOperatorsStyle: {
                since: "0.0.0",
                type: "choice",
                category: "gml",
                default: LogicalOperatorsStyle.KEYWORDS,
                description:
                    "Controls whether logical '&&'/'||' operators are rewritten using GameMaker's word forms. Set to 'symbols' to keep the original operators while formatting.",
                choices: [
                    {
                        value: LogicalOperatorsStyle.KEYWORDS,
                        description: "Replace '&&' and '||' with the GameMaker keywords 'and' and 'or'."
                    },
                    {
                        value: LogicalOperatorsStyle.SYMBOLS,
                        description: "Preserve the symbolic logical operators exactly as written in the source."
                    }
                ]
            },
            optimizeLogicalExpressions: {
                since: "0.0.0",
                type: "boolean",
                category: "gml",
                default: false,
                description:
                    "Optimize logical flow by condensing complementary boolean branches, normalizing early-exit guards, removing redundant temporary-return pairs, caching repeated member access in conditions, and hoisting invariant loop condition members when safe."
            },
            preserveGlobalVarStatements: {
                since: "0.0.0",
                type: "boolean",
                category: "gml",
                default: true,
                description: "Preserve 'globalvar' declarations instead of eliding them during formatting."
            },
            applyFeatherFixes: {
                since: "0.0.0",
                type: "boolean",
                category: "gml",
                default: false,
                description:
                    "Apply safe auto-fixes derived from GameMaker Feather diagnostics (e.g. remove trailing semicolons from macro declarations flagged by GM1051)."
            },
            normalizeDocComments: {
                since: "0.0.0",
                type: "boolean",
                category: "gml",
                default: true,
                description:
                    "Normalize doc comments with a dedicated transform so synthetic summaries, @description text, and spacing are consistent before printing."
            },
            useStringInterpolation: {
                since: "0.0.0",
                type: "boolean",
                category: "gml",
                default: false,
                description:
                    "Rewrite string concatenations like 'Hello ' + name + '!' into template strings such as $\"Hello {name}!\" when all parts are safely composable."
            },
            optimizeMathExpressions: {
                since: "0.0.0",
                type: "boolean",
                category: "gml",
                default: false,
                description:
                    "Optimize math expressions by converting bespoke patterns to built-ins, condensing scalar multipliers, and replacing divisions by constant values with multiplication by their reciprocal."
            },
            sanitizeMissingArgumentSeparators: {
                since: "0.0.0",
                type: "boolean",
                category: "gml",
                default: true,
                description:
                    "Automatically insert missing commas between adjacent call arguments when safe so parsing and formatting can continue."
            }

            // Legacy whitespace toggles (preserveLineBreaks, maintainArrayIndentation,
            // maintainStructIndentation, maintainWithIndentation, maintainSwitchIndentation)
            // were intentionally removed so the formatter can enforce a single opinionated
            // indentation strategy. Avoid re-adding extraneous options that contradict that goal.
        }
    } as GmlPluginComponentBundle;
}
