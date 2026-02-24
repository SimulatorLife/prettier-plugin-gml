import type { GameMakerAstNode } from "@gml-modules/core";

import { defaultGmlFormatComponentImplementations } from "./default-component-instances.js";
import type { GmlFormatComponentBundle } from "./format-types.js";

export function createDefaultGmlFormatComponents(): GmlFormatComponentBundle {
    const { gmlParserAdapter, print, handleComments, printComment, LogicalOperatorsStyle } =
        defaultGmlFormatComponentImplementations;

    return {
        parsers: {
            "gml-parse": gmlParserAdapter,
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
            }

            // Legacy whitespace toggles (preserveLineBreaks, maintainArrayIndentation,
            // maintainStructIndentation, maintainWithIndentation, maintainSwitchIndentation)
            // were intentionally removed so the formatter can enforce a single opinionated
            // indentation strategy. Avoid re-adding extraneous options that contradict that goal.
        }
    } as GmlFormatComponentBundle;
}
