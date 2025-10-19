import { gmlParserAdapter } from "../parsers/gml-parser-adapter.js";
import { print } from "../printer/print.js";
import { handleComments, printComment } from "../comments/comment-printer.js";
import { identifierCaseOptions } from "../options/identifier-case.js";
import { LogicalOperatorsStyle } from "../options/logical-operators-style.js";
import { MissingOptionalArgumentPlaceholder } from "../options/missing-optional-argument-placeholder.js";

export function createDefaultGmlPluginComponents() {
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
                default: true,
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
            lineCommentBannerMinimumSlashes: {
                since: "0.0.0",
                type: "int",
                category: "gml",
                default: 5,
                range: { start: 1, end: Infinity },
                description:
                    "Minimum number of consecutive '/' characters that must prefix a line comment before it is preserved verbatim."
            },
            lineCommentBannerAutofillThreshold: {
                since: "0.0.0",
                type: "int",
                category: "gml",
                default: 4,
                range: { start: 0, end: Infinity },
                description:
                    "Autofill banner comments up to the minimum slash count when they already start with this many '/' characters. Set to 0 to disable autofilling."
            },
            lineCommentBoilerplateFragments: {
                since: "0.0.0",
                type: "string",
                category: "gml",
                default: "",
                description:
                    "Comma-separated substrings that mark trimmed line comments as boilerplate to remove. Provide additional fragments to extend the built-in filter."
            },
            lineCommentCodeDetectionPatterns: {
                since: "0.0.0",
                type: "string",
                category: "gml",
                default: "",
                description:
                    "Comma-separated regular expressions that extend the built-in detector for commented-out code. Entries like '/^SQL:/i' keep matching comments verbatim."
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
                    "Maximum number of arguments allowed on a single line before a function call is forced to wrap. Set to 0 to disable."
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
                    'Rewrite string concatenations like "Hello " + name + "!" into template strings such as $"Hello {name}!" when all parts are safely composable.'
            },
            missingOptionalArgumentPlaceholder: {
                since: "0.0.0",
                type: "choice",
                category: "gml",
                default: MissingOptionalArgumentPlaceholder.UNDEFINED,
                description:
                    "Controls how omitted optional arguments are printed. Set to 'empty' to leave the slot blank instead of inserting 'undefined'.",
                choices: [
                    {
                        value: MissingOptionalArgumentPlaceholder.UNDEFINED,
                        description:
                            "Fill missing optional arguments with the literal 'undefined'."
                    },
                    {
                        value: MissingOptionalArgumentPlaceholder.EMPTY,
                        description:
                            "Leave missing optional arguments empty so calls render as consecutive commas."
                    }
                ]
            },
            fixMissingDecimalZeroes: {
                since: "0.0.0",
                type: "boolean",
                category: "gml",
                default: true,
                description:
                    "Pads bare decimal literals with leading or trailing zeroes to improve readability. Set to false to preserve the original literal text."
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
            },
            allowTrailingCallArguments: {
                since: "0.0.0",
                type: "boolean",
                category: "gml",
                default: false,
                description:
                    "Reserved for future use; enabling this option currently has no effect because trailing call commas are normalized into missing optional argument placeholders (see 'missingOptionalArgumentPlaceholder')."
            },
            preserveLineBreaks: {
                since: "0.0.0",
                type: "boolean",
                category: "gml",
                default: false,
                description:
                    "Reserved for future use; enabling this option currently has no effect while line-break preservation heuristics are evaluated."
            },
            maintainArrayIndentation: {
                since: "0.0.0",
                type: "boolean",
                category: "gml",
                default: false,
                description:
                    "Keep existing indentation for array literals instead of reindenting according to Prettier defaults."
            },
            maintainStructIndentation: {
                since: "0.0.0",
                type: "boolean",
                category: "gml",
                default: false,
                description:
                    "Keep existing indentation for struct literals instead of reindenting according to Prettier defaults."
            },
            maintainWithIndentation: {
                since: "0.0.0",
                type: "boolean",
                category: "gml",
                default: false,
                description:
                    "Preserve the indentation within 'with' statements rather than reindenting the body relative to the statement."
            },
            maintainSwitchIndentation: {
                since: "0.0.0",
                type: "boolean",
                category: "gml",
                default: false,
                description:
                    "Preserve the indentation inside 'switch' statements rather than reindenting cases relative to the switch body."
            }
        }
    };
}
