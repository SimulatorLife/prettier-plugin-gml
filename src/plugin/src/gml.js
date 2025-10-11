// gml.js

import { gmlParserAdapter } from "./parsers/gml-parser-adapter.js";
import { print } from "./printer/print.js";
import { handleComments, printComment } from "./printer/comments.js";

export const languages = [
    {
        name: "GameMaker Language",
        extensions: [".gml"],
        parsers: ["gml-parse"],
        vscodeLanguageIds: ["gml-gms2", "gml"]
    }
];

export const parsers = {
    "gml-parse": {
        ...gmlParserAdapter,
        parse: (text, _parsers, options) => gmlParserAdapter.parse(text, options)
    }
};

export const printers = {
    "gml-ast": {
        print: print,
        isBlockComment: (comment) => comment.type === "CommentBlock",
        canAttachComment: (node) =>
            node.type &&
      !node.type.includes("Comment") &&
      node.type !== "EmptyStatement",
        printComment: printComment,
        handleComments: handleComments
    }
};

export const options = {
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
        default: "keywords",
        description:
      "Controls whether logical '&&'/'||' operators are rewritten using GameMaker's word forms. Set to 'symbols' to keep the original operators while formatting.",
        choices: [
            {
                value: "keywords",
                description:
          "Replace '&&' and '||' with the GameMaker keywords 'and' and 'or'."
            },
            {
                value: "symbols",
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
    alignAssignmentsMinGroupSize: {
        since: "0.0.0",
        type: "int",
        category: "gml",
        default: 3,
        range: { start: 0, end: Infinity },
        description:
      "Minimum number of consecutive simple assignments required before the formatter aligns their '=' operators. Set to 0 to disable alignment entirely."
    },
    trailingCommentPadding: {
        since: "0.0.0",
        type: "int",
        category: "gml",
        default: 2,
        range: { start: 0, end: Infinity },
        description:
      "Spaces inserted between the end of code and trailing comments. Increase to push inline comments further right or set to 0 to minimize padding."
    },
    trailingCommentInlineOffset: {
        since: "0.0.0",
        type: "int",
        category: "gml",
        default: 1,
        range: { start: 0, end: Infinity },
        description:
      "Spaces trimmed from trailingCommentPadding when applying inline comment padding. Set to 0 to keep inline and trailing padding identical."
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
    gmlIdentifierCase: {
        since: "0.0.0",
        type: "choice",
        category: "gml",
        default: "off",
        description:
      "Controls the default identifier case transformation applied while formatting. Leave at 'off' to preserve all identifiers.",
        choices: [
            {
                value: "off",
                description: "Do not modify identifier casing."
            },
            {
                value: "camel",
                description: "Convert identifiers to lower camelCase by default."
            },
            {
                value: "pascal",
                description:
          "Convert identifiers to UpperCamelCase (Pascal case) by default."
            },
            {
                value: "snake-lower",
                description: "Convert identifiers to lower snake_case by default."
            },
            {
                value: "snake-upper",
                description: "Convert identifiers to upper SNAKE_CASE by default."
            }
        ]
    },
    gmlIdentifierCaseFunctions: {
        since: "0.0.0",
        type: "choice",
        category: "gml",
        default: "inherit",
        description:
      "Override the default identifier case for script-level functions. Uses the global gmlIdentifierCase value when set to 'inherit'.",
        choices: [
            {
                value: "inherit",
                description: "Follow the gmlIdentifierCase setting."
            },
            { value: "off", description: "Leave function identifiers unchanged." },
            {
                value: "camel",
                description: "Force function identifiers to lower camelCase."
            },
            {
                value: "pascal",
                description: "Force function identifiers to UpperCamelCase."
            },
            {
                value: "snake-lower",
                description: "Force function identifiers to lower snake_case."
            },
            {
                value: "snake-upper",
                description: "Force function identifiers to upper SNAKE_CASE."
            }
        ]
    },
    gmlIdentifierCaseStructs: {
        since: "0.0.0",
        type: "choice",
        category: "gml",
        default: "inherit",
        description:
      "Override the default identifier case for struct field and constructor names. Uses the global gmlIdentifierCase value when set to 'inherit'.",
        choices: [
            {
                value: "inherit",
                description: "Follow the gmlIdentifierCase setting."
            },
            { value: "off", description: "Leave struct identifiers unchanged." },
            {
                value: "camel",
                description: "Force struct identifiers to lower camelCase."
            },
            {
                value: "pascal",
                description: "Force struct identifiers to UpperCamelCase."
            },
            {
                value: "snake-lower",
                description: "Force struct identifiers to lower snake_case."
            },
            {
                value: "snake-upper",
                description: "Force struct identifiers to upper SNAKE_CASE."
            }
        ]
    },
    gmlIdentifierCaseLocals: {
        since: "0.0.0",
        type: "choice",
        category: "gml",
        default: "inherit",
        description:
      "Override the default identifier case for local variables. Uses the global gmlIdentifierCase value when set to 'inherit'.",
        choices: [
            {
                value: "inherit",
                description: "Follow the gmlIdentifierCase setting."
            },
            { value: "off", description: "Leave local identifiers unchanged." },
            {
                value: "camel",
                description: "Force local identifiers to lower camelCase."
            },
            {
                value: "pascal",
                description: "Force local identifiers to UpperCamelCase."
            },
            {
                value: "snake-lower",
                description: "Force local identifiers to lower snake_case."
            },
            {
                value: "snake-upper",
                description: "Force local identifiers to upper SNAKE_CASE."
            }
        ]
    },
    gmlIdentifierCaseInstance: {
        since: "0.0.0",
        type: "choice",
        category: "gml",
        default: "inherit",
        description:
      "Override the default identifier case for instance-scoped variables. Uses the global gmlIdentifierCase value when set to 'inherit'.",
        choices: [
            {
                value: "inherit",
                description: "Follow the gmlIdentifierCase setting."
            },
            { value: "off", description: "Leave instance identifiers unchanged." },
            {
                value: "camel",
                description: "Force instance identifiers to lower camelCase."
            },
            {
                value: "pascal",
                description: "Force instance identifiers to UpperCamelCase."
            },
            {
                value: "snake-lower",
                description: "Force instance identifiers to lower snake_case."
            },
            {
                value: "snake-upper",
                description: "Force instance identifiers to upper SNAKE_CASE."
            }
        ]
    },
    gmlIdentifierCaseGlobals: {
        since: "0.0.0",
        type: "choice",
        category: "gml",
        default: "inherit",
        description:
      "Override the default identifier case for global variables. Uses the global gmlIdentifierCase value when set to 'inherit'.",
        choices: [
            {
                value: "inherit",
                description: "Follow the gmlIdentifierCase setting."
            },
            { value: "off", description: "Leave global identifiers unchanged." },
            {
                value: "camel",
                description: "Force global identifiers to lower camelCase."
            },
            {
                value: "pascal",
                description: "Force global identifiers to UpperCamelCase."
            },
            {
                value: "snake-lower",
                description: "Force global identifiers to lower snake_case."
            },
            {
                value: "snake-upper",
                description: "Force global identifiers to upper SNAKE_CASE."
            }
        ]
    },
    gmlIdentifierCaseAssets: {
        since: "0.0.0",
        type: "choice",
        category: "gml",
        default: "inherit",
        description:
      "Override the default identifier case for project asset names. Uses the global gmlIdentifierCase value when set to 'inherit'.",
        choices: [
            {
                value: "inherit",
                description: "Follow the gmlIdentifierCase setting."
            },
            { value: "off", description: "Leave asset identifiers unchanged." },
            {
                value: "camel",
                description: "Force asset identifiers to lower camelCase."
            },
            {
                value: "pascal",
                description: "Force asset identifiers to UpperCamelCase."
            },
            {
                value: "snake-lower",
                description: "Force asset identifiers to lower snake_case."
            },
            {
                value: "snake-upper",
                description: "Force asset identifiers to upper SNAKE_CASE."
            }
        ]
    },
    gmlIdentifierCaseMacros: {
        since: "0.0.0",
        type: "choice",
        category: "gml",
        default: "inherit",
        description:
      "Override the default identifier case for macros. Uses the global gmlIdentifierCase value when set to 'inherit'.",
        choices: [
            {
                value: "inherit",
                description: "Follow the gmlIdentifierCase setting."
            },
            { value: "off", description: "Leave macro identifiers unchanged." },
            {
                value: "camel",
                description: "Force macro identifiers to lower camelCase."
            },
            {
                value: "pascal",
                description: "Force macro identifiers to UpperCamelCase."
            },
            {
                value: "snake-lower",
                description: "Force macro identifiers to lower snake_case."
            },
            {
                value: "snake-upper",
                description: "Force macro identifiers to upper SNAKE_CASE."
            }
        ]
    },
    gmlIdentifierCaseIgnore: {
        since: "0.0.0",
        type: "string",
        category: "gml",
        default: "",
        description:
      "Comma-separated patterns for identifiers that should never be renamed when identifier casing is enabled."
    },
    gmlIdentifierCasePreserve: {
        since: "0.0.0",
        type: "string",
        category: "gml",
        default: "",
        description:
      "Comma-separated list of exact identifier names that must be preserved verbatim when identifier casing is enabled."
    },
    gmlIdentifierCaseAcknowledgeAssetUpdates: {
        since: "0.0.0",
        type: "boolean",
        category: "gml",
        default: false,
        description:
      "Acknowledges that enabling asset identifier renames may update project files on disk. Must be true before asset renames are activated."
    }
};

const BASE_PRETTIER_DEFAULTS = {
    tabWidth: 4,
    semi: true,
    trailingComma: "none",
    printWidth: 120
};

function extractOptionDefaults(optionConfigMap) {
    const defaults = {};

    for (const [name, config] of Object.entries(optionConfigMap)) {
        if (config && Object.hasOwn(config, "default")) {
            defaults[name] = config.default;
        }
    }

    return defaults;
}

const gmlOptionDefaults = extractOptionDefaults(options);

export const defaultOptions = {
    ...BASE_PRETTIER_DEFAULTS,
    ...gmlOptionDefaults
};
