import { resolveGmlPluginComponentDependencies } from "./gml-plugin-component-dependency-registry.js";

export function createDefaultGmlPluginComponents() {
    const {
        gmlParserAdapter,
        print,
        handleComments,
        printComment,
        identifierCaseOptions,
        LogicalOperatorsStyle
    } = resolveGmlPluginComponentDependencies();

    return {
        parsers: {
            "gml-parse": {
                ...gmlParserAdapter,
                parse: (text, _parsers, options) =>
                    gmlParserAdapter.parse(text, options)
            }
        },
        printers: {
            "gml-ast": {
                print,
                isBlockComment: (comment) => comment.type === "CommentBlock",
                canAttachComment: (node) =>
                    node.type &&
                    !node.type.includes("Comment") &&
                    node.type !== "EmptyStatement",
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
                    "Collapse single-statement 'if' bodies to a single line (for example, 'if (condition) { return; }'). Disable to always expand the consequent across multiple lines."
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
                        description:
                            "Replace '&&' and '||' with the GameMaker keywords 'and' and 'or'."
                    },
                    {
                        value: LogicalOperatorsStyle.SYMBOLS,
                        description:
                            "Preserve the symbolic logical operators exactly as written in the source."
                    }
                ]
            },
            condenseLogicalExpressions: {
                since: "0.0.0",
                type: "boolean",
                category: "gml",
                default: false,
                description:
                    "Condense complementary logical return branches into simplified boolean expressions when it is safe to do so."
            },
            preserveGlobalVarStatements: {
                since: "0.0.0",
                type: "boolean",
                category: "gml",
                default: true,
                description:
                    "Preserve 'globalvar' declarations instead of eliding them during formatting."
            },
            alignAssignmentsMinGroupSize: {
                since: "0.0.0",
                type: "int",
                category: "gml",
                default: 3,
                range: { start: 0, end: Infinity },
                description:
                    "Minimum number of consecutive simple assignments required before the formatter aligns their '=' operators. Set to 0 to disable alignment entirely."
            },
            maxParamsPerLine: {
                since: "0.0.0",
                type: "int",
                category: "gml",
                default: 0,
                range: { start: 0, end: Infinity },
                description:
                    "Maximum number of arguments allowed on a single line before a function call is forced to wrap. Set to 0 to disable the numeric limit (nested callback arguments may still wrap for readability)."
            },
            applyFeatherFixes: {
                since: "0.0.0",
                type: "boolean",
                category: "gml",
                default: false,
                description:
                    "Apply safe auto-fixes derived from GameMaker Feather diagnostics (e.g. remove trailing semicolons from macro declarations flagged by GM1051)."
            },
            useStringInterpolation: {
                since: "0.0.0",
                type: "boolean",
                category: "gml",
                default: false,
                description:
                    "Rewrite string concatenations like 'Hello ' + name + '!' into template strings such as $\"Hello {name}!\" when all parts are safely composable."
            },
            convertDivisionToMultiplication: {
                since: "0.0.0",
                type: "boolean",
                category: "gml",
                default: false,
                description:
                    "Replace divisions by constant values with multiplication by their reciprocal (for example, 'value / 2' becomes 'value * 0.5')."
            },
            convertManualMathToBuiltins: {
                since: "0.0.0",
                type: "boolean",
                category: "gml",
                default: false,
                description:
                    "Convert bespoke math expressions into their builtin GML equivalents (e.g. collapsing repeated multiplication into sqr())."
            },
            condenseUnaryBooleanReturns: {
                since: "0.0.0",
                type: "boolean",
                category: "gml",
                default: false,
                description:
                    "Convert return statements like 'return !condition;' into ternaries to preserve unary negation semantics while condensing output."
            },
            condenseReturnStatements: {
                since: "0.0.0",
                type: "boolean",
                category: "gml",
                default: false,
                description:
                    "Combine complementary 'if' branches that return literal booleans into a single return statement with the simplified expression."
            }

            // Legacy whitespace toggles (preserveLineBreaks, maintainArrayIndentation,
            // maintainStructIndentation, maintainWithIndentation, maintainSwitchIndentation)
            // were intentionally removed so the formatter can enforce a single opinionated
            // indentation strategy. Avoid re-adding escape hatches that contradict that goal.
        }
    };
}
