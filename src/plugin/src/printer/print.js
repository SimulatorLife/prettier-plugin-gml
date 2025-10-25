import { builders, utils } from "prettier/doc";

import {
    isLastStatement,
    optionalSemicolon,
    isNextLineEmpty,
    isPreviousLineEmpty,
    shouldAddNewlinesAroundStatement,
    hasComment,
    getNormalizedDefineReplacementDirective
} from "./util.js";
import {
    buildCachedSizeVariableName,
    getLoopLengthHoistInfo,
    getSizeRetrievalFunctionSuffixes
} from "./loop-size-hoisting.js";
import {
    getEnumNameAlignmentPadding,
    prepareEnumMembersForPrinting
} from "./enum-alignment.js";
import {
    printDanglingComments,
    printDanglingCommentsAsGroup,
    printComment
} from "../comments/comment-printer.js";
import {
    formatLineComment,
    normalizeDocCommentTypeAnnotations
} from "../comments/line-comment-formatting.js";
import { resolveLineCommentOptions } from "../options/line-comment-options.js";
import { getCommentArray, isCommentNode } from "../shared/comments.js";
import { coercePositiveIntegerOption } from "../shared/numeric-option-utils.js";
import {
    getNonEmptyString,
    isNonEmptyString,
    isNonEmptyTrimmedString,
    toTrimmedString
} from "../shared/string-utils.js";
import { isNonEmptyArray, toMutableArray } from "../shared/array-utils.js";
import { ensureSet } from "../shared/utils/capability-probes.js";
import {
    getNodeStartIndex,
    getNodeEndIndex,
    getNodeRangeIndices
} from "../shared/ast-locations.js";
import {
    getBodyStatements,
    getCallExpressionArguments,
    getIdentifierText,
    getSingleVariableDeclarator,
    isCallExpressionIdentifierMatch,
    isBooleanLiteral,
    isUndefinedLiteral,
    enqueueObjectChildValues
} from "../shared/ast-node-helpers.js";
import { maybeReportIdentifierCaseDryRun } from "../identifier-case/identifier-case-report.js";
import {
    getIdentifierCaseRenameForNode,
    applyIdentifierCasePlanSnapshot
} from "../identifier-case/plan-service.js";
import { teardownIdentifierCaseEnvironment } from "../identifier-case/environment.js";
import {
    LogicalOperatorsStyle,
    normalizeLogicalOperatorsStyle
} from "../options/logical-operators-style.js";
import {
    ObjectWrapOption,
    resolveObjectWrapOption
} from "../options/object-wrap-option.js";

const {
    breakParent,
    join,
    line,
    group,
    conditionalGroup,
    indent,
    ifBreak,
    hardline,
    softline,
    concat,
    lineSuffixBoundary
} = builders;
const { willBreak } = utils;

const FEATHER_COMMENT_OUT_SYMBOL = Symbol.for(
    "prettier.gml.feather.commentOut"
);
const FEATHER_COMMENT_TEXT_SYMBOL = Symbol.for(
    "prettier.gml.feather.commentText"
);

const preservedUndefinedDefaultParameters = new WeakSet();
const ARGUMENT_IDENTIFIER_PATTERN = /^argument(\d+)$/;
const FUNCTION_LIKE_NODE_TYPES = new Set([
    "FunctionDeclaration",
    "FunctionExpression",
    "LambdaExpression",
    "ConstructorDeclaration",
    "MethodDeclaration",
    "StructFunctionDeclaration",
    "StructDeclaration"
]);
const suppressedImplicitDocCanonicalByNode = new WeakMap();
const preferredParamDocNamesByNode = new WeakMap();
const forcedStructArgumentBreaks = new WeakMap();

function stripTrailingLineTerminators(value) {
    if (typeof value !== "string") {
        return value;
    }

    return value.replace(/(?:\r?\n)+$/, "");
}

function resolvePrinterSourceMetadata(options) {
    if (
        !options ||
        (typeof options !== "object" && typeof options !== "function")
    ) {
        return { originalText: null, locStart: null, locEnd: null };
    }

    const originalText =
        typeof options.originalText === "string" ? options.originalText : null;
    const locStart =
        typeof options.locStart === "function" ? options.locStart : null;
    const locEnd = typeof options.locEnd === "function" ? options.locEnd : null;

    return { originalText, locStart, locEnd };
}

function macroTextHasExplicitTrailingBlankLine(text) {
    if (typeof text !== "string") {
        return false;
    }

    const trailingWhitespace = text.match(/[\t \r\n]+$/);
    if (!trailingWhitespace) {
        return false;
    }

    const newlineMatches = trailingWhitespace[0].match(/\r?\n/g);
    return (newlineMatches?.length ?? 0) >= 2;
}

const BINARY_OPERATOR_INFO = new Map([
    ["*", { precedence: 13, associativity: "left" }],
    ["/", { precedence: 13, associativity: "left" }],
    ["div", { precedence: 13, associativity: "left" }],
    ["%", { precedence: 13, associativity: "left" }],
    ["mod", { precedence: 13, associativity: "left" }],
    ["+", { precedence: 12, associativity: "left" }],
    ["-", { precedence: 12, associativity: "left" }],
    ["<<", { precedence: 12, associativity: "left" }],
    [">>", { precedence: 12, associativity: "left" }],
    ["&", { precedence: 11, associativity: "left" }],
    ["^", { precedence: 10, associativity: "left" }],
    ["|", { precedence: 9, associativity: "left" }],
    ["<", { precedence: 8, associativity: "left" }],
    ["<=", { precedence: 8, associativity: "left" }],
    [">", { precedence: 8, associativity: "left" }],
    [">=", { precedence: 8, associativity: "left" }],
    ["==", { precedence: 7, associativity: "left" }],
    ["!=", { precedence: 7, associativity: "left" }],
    ["<>", { precedence: 7, associativity: "left" }],
    ["&&", { precedence: 6, associativity: "left" }],
    ["and", { precedence: 6, associativity: "left" }],
    ["||", { precedence: 5, associativity: "left" }],
    ["or", { precedence: 5, associativity: "left" }],
    ["??", { precedence: 4, associativity: "right" }]
]);

const COMPARISON_OPERATORS = new Set(["<", "<=", ">", ">=", "==", "!=", "<>"]);
const DOC_COMMENT_OUTPUT_FLAG = "_gmlHasDocCommentOutput";

function resolveLogicalOperatorsStyle(options) {
    return normalizeLogicalOperatorsStyle(options?.logicalOperatorsStyle);
}

function applyLogicalOperatorsStyle(operator, style) {
    if (operator === "&&") {
        return style === LogicalOperatorsStyle.KEYWORDS ? "and" : "&&";
    }

    if (operator === "||") {
        return style === LogicalOperatorsStyle.KEYWORDS ? "or" : "||";
    }

    return operator;
}

export function print(path, options, print) {
    const node = path.getValue();

    if (!node) {
        return concat("");
    }

    if (typeof node === "string") {
        return concat(node);
    }

    switch (node.type) {
        case "Program": {
            if (node && node.__identifierCasePlanSnapshot) {
                applyIdentifierCasePlanSnapshot(
                    node.__identifierCasePlanSnapshot,
                    options
                );
            }

            try {
                maybeReportIdentifierCaseDryRun(options);
                if (node.body.length === 0) {
                    return concat(printDanglingCommentsAsGroup(path, options));
                }
                return concat(printStatements(path, options, print, "body"));
            } finally {
                teardownIdentifierCaseEnvironment(options);
            }
        }
        case "BlockStatement": {
            if (node.body.length === 0) {
                return concat(printEmptyBlock(path, options, print));
            }

            let leadingDocs = [hardline];

            const parentNode =
                typeof path.getParentNode === "function"
                    ? path.getParentNode()
                    : null;

            if (parentNode?.type === "ConstructorDeclaration") {
                const { originalText, locStart } =
                    resolvePrinterSourceMetadata(options);
                if (originalText !== null) {
                    const firstStatement = node.body[0];
                    const startProp = firstStatement?.start;
                    const fallbackStart =
                        typeof startProp === "number"
                            ? startProp
                            : typeof startProp?.index === "number"
                              ? startProp.index
                              : 0;
                    const firstStatementStartIndex = locStart
                        ? locStart(firstStatement)
                        : fallbackStart;

                    if (
                        isPreviousLineEmpty(
                            originalText,
                            firstStatementStartIndex
                        )
                    ) {
                        leadingDocs.push(lineSuffixBoundary, hardline);
                    }
                }
            }

            return concat([
                "{",
                printDanglingComments(
                    path,
                    options,
                    (comment) => comment.attachToBrace
                ),
                indent([
                    ...leadingDocs,
                    printStatements(path, options, print, "body")
                ]),
                hardline,
                "}"
            ]);
        }
        case "IfStatement": {
            const simplifiedReturn = printBooleanReturnIf(path, print);
            if (simplifiedReturn) {
                return simplifiedReturn;
            }
            return buildIfStatementDoc(path, options, print, node);
        }
        case "SwitchStatement": {
            const parts = [];
            const discriminantDoc = printWithoutExtraParens(
                path,
                print,
                "discriminant"
            );
            parts.push(["switch (", buildClauseGroup(discriminantDoc), ") "]);
            if (node.cases.length === 0) {
                parts.push(printEmptyBlock(path, options, print));
            } else {
                parts.push([
                    "{",
                    indent([path.map(print, "cases")]),
                    hardline,
                    "}"
                ]);
            }
            return concat(parts);
        }
        case "SwitchCase": {
            const caseText = node.test === null ? "default" : "case ";
            const parts = [[hardline, caseText, print("test"), ":"]];
            const caseBody = node.body;
            if (isNonEmptyArray(caseBody)) {
                parts.push([
                    indent([
                        hardline,
                        printStatements(path, options, print, "body")
                    ])
                ]);
            }
            return concat(parts);
        }
        case "TernaryExpression": {
            const ternaryDoc = group([
                print("test"),
                indent([
                    line,
                    "? ",
                    print("consequent"),
                    line,
                    ": ",
                    print("alternate")
                ])
            ]);

            return shouldWrapTernaryExpression(path)
                ? concat(["(", ternaryDoc, ")"])
                : ternaryDoc;
        }
        case "ForStatement": {
            const shouldHoistLoopLengths =
                options?.optimizeLoopLengthHoisting ?? true;
            const sizeFunctionSuffixes = shouldHoistLoopLengths
                ? getSizeRetrievalFunctionSuffixes(options)
                : undefined;
            const hoistInfo = shouldHoistLoopLengths
                ? getLoopLengthHoistInfo(path.getValue(), sizeFunctionSuffixes)
                : null;
            if (hoistInfo) {
                const cachedLengthName = buildCachedSizeVariableName(
                    hoistInfo.sizeIdentifierName,
                    hoistInfo.cachedLengthSuffix
                );

                if (!loopLengthNameConflicts(path, cachedLengthName)) {
                    const { loopSizeCallDoc, iteratorDoc } =
                        buildLoopLengthDocs(path, print, hoistInfo);

                    const initDoc = path.getValue().init ? print("init") : "";
                    const updateDoc = path.getValue().update
                        ? print("update")
                        : "";
                    const testDoc = concat([
                        iteratorDoc,
                        " ",
                        path.getValue().test.operator,
                        " ",
                        cachedLengthName
                    ]);

                    const needsHoistedSeparator =
                        shouldInsertHoistedLoopSeparator(path, options);

                    return concat([
                        group([
                            "var ",
                            cachedLengthName,
                            " = ",
                            loopSizeCallDoc,
                            ";"
                        ]),
                        hardline,
                        "for (",
                        group([
                            indent([
                                ifBreak(line),
                                concat([
                                    initDoc,
                                    ";",
                                    line,
                                    testDoc,
                                    ";",
                                    line,
                                    updateDoc
                                ])
                            ])
                        ]),
                        ") ",
                        printInBlock(path, options, print, "body"),
                        needsHoistedSeparator ? hardline : ""
                    ]);
                }
            }

            return concat([
                "for (",
                group([
                    indent([
                        ifBreak(line),
                        concat([
                            print("init"),
                            ";",
                            line,
                            print("test"),
                            ";",
                            line,
                            print("update")
                        ])
                    ])
                ]),
                ") ",
                printInBlock(path, options, print, "body")
            ]);
        }
        case "DoUntilStatement": {
            return concat([
                "do ",
                printInBlock(path, options, print, "body"),
                " until (",
                buildClauseGroup(printWithoutExtraParens(path, print, "test")),
                ")",
                ";"
            ]);
        }
        case "WhileStatement": {
            return concat(
                printSingleClauseStatement(
                    path,
                    options,
                    print,
                    "while",
                    "test",
                    "body"
                )
            );
        }
        case "RepeatStatement": {
            return concat(
                printSingleClauseStatement(
                    path,
                    options,
                    print,
                    "repeat",
                    "test",
                    "body"
                )
            );
        }
        case "WithStatement": {
            return concat(
                printSingleClauseStatement(
                    path,
                    options,
                    print,
                    "with",
                    "test",
                    "body"
                )
            );
        }
        case "FunctionDeclaration":
        case "ConstructorDeclaration": {
            const parts = [];

            const { originalText, locStart } =
                resolvePrinterSourceMetadata(options);
            const fallbackStart =
                typeof node?.start === "number"
                    ? node.start
                    : typeof node?.start?.index === "number"
                      ? node.start.index
                      : 0;
            const nodeStartIndex = locStart ? locStart(node) : fallbackStart;

            let docCommentDocs = [];
            const lineCommentOptions = resolveLineCommentOptions(options);
            let needsLeadingBlankLine = false;

            if (isNonEmptyArray(node.docComments)) {
                const firstDocComment = node.docComments[0];
                if (
                    firstDocComment &&
                    typeof firstDocComment.leadingWS === "string"
                ) {
                    const blankLinePattern =
                        /(?:\r\n|\r|\n|\u2028|\u2029)\s*(?:\r\n|\r|\n|\u2028|\u2029)/;
                    if (blankLinePattern.test(firstDocComment.leadingWS)) {
                        needsLeadingBlankLine = true;
                    }
                }
                docCommentDocs = node.docComments
                    .map((comment) =>
                        formatLineComment(comment, lineCommentOptions)
                    )
                    .filter(
                        (text) => typeof text === "string" && text.trim() !== ""
                    );
            }

            if (
                shouldGenerateSyntheticDocForFunction(
                    path,
                    docCommentDocs,
                    options
                )
            ) {
                docCommentDocs = mergeSyntheticDocComments(
                    node,
                    docCommentDocs,
                    options
                );
                // Nested functions (those in BlockStatement parents) should have
                // a leading blank line before their synthetic doc comments
                const parentNode = path.getParentNode();
                if (
                    parentNode &&
                    parentNode.type === "BlockStatement" &&
                    !needsLeadingBlankLine
                ) {
                    needsLeadingBlankLine = true;
                }
            }

            if (docCommentDocs.length > 0) {
                node[DOC_COMMENT_OUTPUT_FLAG] = true;
                const suppressLeadingBlank =
                    docCommentDocs &&
                    docCommentDocs._suppressLeadingBlank === true;

                const hasLeadingNonDocComment =
                    !isNonEmptyArray(node.docComments) &&
                    originalText !== null &&
                    typeof nodeStartIndex === "number" &&
                    hasCommentImmediatelyBefore(originalText, nodeStartIndex);

                const hasExistingBlankLine =
                    originalText !== null &&
                    typeof nodeStartIndex === "number" &&
                    isPreviousLineEmpty(originalText, nodeStartIndex);

                if (
                    !suppressLeadingBlank &&
                    (needsLeadingBlankLine ||
                        (hasLeadingNonDocComment && !hasExistingBlankLine))
                ) {
                    parts.push(hardline);
                }
                parts.push(join(hardline, docCommentDocs), hardline);
            } else if (Object.hasOwn(node, DOC_COMMENT_OUTPUT_FLAG)) {
                delete node[DOC_COMMENT_OUTPUT_FLAG];
            }

            let functionNameDoc = "";
            if (isNonEmptyString(node.id)) {
                let renamed = null;
                if (node.idLocation && node.idLocation.start) {
                    renamed = getIdentifierCaseRenameForNode(
                        {
                            start: node.idLocation.start,
                            scopeId: node.scopeId ?? null
                        },
                        options
                    );
                }
                functionNameDoc = getNonEmptyString(renamed) ?? node.id;
            } else if (node.id) {
                functionNameDoc = print("id");
            }

            const hasFunctionName =
                typeof functionNameDoc === "string"
                    ? isNonEmptyString(functionNameDoc)
                    : Boolean(functionNameDoc);

            parts.push([
                "function",
                hasFunctionName ? " " : "",
                functionNameDoc
            ]);

            if (node.params.length > 0) {
                const {
                    inlineDoc: inlineParamDoc,
                    multilineDoc: multilineParamDoc
                } = buildFunctionParameterDocs(path, print, options);

                parts.push(
                    conditionalGroup([inlineParamDoc, multilineParamDoc])
                );
            } else {
                parts.push(printEmptyParens(path, print, options));
            }

            if (node.type == "ConstructorDeclaration") {
                if (node.parent) {
                    parts.push(print("parent"));
                } else {
                    parts.push(" constructor");
                }
            }

            const inlineDefaultParameterDoc =
                maybePrintInlineDefaultParameterFunctionBody(path, print);

            if (inlineDefaultParameterDoc) {
                parts.push(" ", inlineDefaultParameterDoc);
                return concat(parts);
            }

            parts.push(" ");
            parts.push(printInBlock(path, options, print, "body"));
            return concat(parts);
        }
        case "ConstructorParentClause": {
            let params;
            params =
                node.params.length > 0
                    ? printCommaSeparatedList(
                          path,
                          print,
                          "params",
                          "(",
                          ")",
                          options
                      )
                    : printEmptyParens(path, print, options);
            return concat([" : ", print("id"), params, " constructor"]);
        }
        case "DefaultParameter": {
            if (shouldOmitDefaultValueForParameter(path)) {
                return concat(print("left"));
            }
            return concat(
                printSimpleDeclaration(print("left"), print("right"))
            );
        }
        case "ExpressionStatement": {
            return print("expression");
        }
        case "AssignmentExpression": {
            const padding =
                node.operator === "=" &&
                typeof node._alignAssignmentPadding === "number"
                    ? Math.max(0, node._alignAssignmentPadding)
                    : 0;
            let spacing = " ".repeat(padding + 1);

            if (
                spacing.length === 1 &&
                shouldPreserveCompactUpdateAssignmentSpacing(path, options)
            ) {
                spacing = "";
            }

            return group([
                group(print("left")),
                spacing,
                node.operator,
                " ",
                group(print("right"))
            ]);
        }
        case "GlobalVarStatement": {
            if (options?.preserveGlobalVarStatements === false) {
                return null;
            }

            let decls = [];
            decls =
                node.declarations.length > 1
                    ? printCommaSeparatedList(
                          path,
                          print,
                          "declarations",
                          "",
                          "",
                          options,
                          {
                              leadingNewline: false,
                              trailingNewline: false
                          }
                      )
                    : path.map(print, "declarations");

            const keyword =
                typeof node.kind === "string" ? node.kind : "globalvar";

            return concat([keyword, " ", decls]);
        }
        case "VariableDeclaration": {
            const functionNode = findEnclosingFunctionNode(path);
            const declarators = Array.isArray(node.declarations)
                ? node.declarations
                : [];
            const keptDeclarators = declarators.filter(
                (declarator) =>
                    !shouldOmitParameterAlias(declarator, functionNode, options)
            );

            if (keptDeclarators.length === 0) {
                return;
            }

            if (keptDeclarators.length !== declarators.length) {
                const original = node.declarations;
                node.declarations = keptDeclarators;
                try {
                    const decls =
                        keptDeclarators.length > 1
                            ? printCommaSeparatedList(
                                  path,
                                  print,
                                  "declarations",
                                  "",
                                  "",
                                  options,
                                  {
                                      leadingNewline: false,
                                      trailingNewline: false
                                  }
                              )
                            : path.map(print, "declarations");
                    return concat([node.kind, " ", decls]);
                } finally {
                    node.declarations = original;
                }
            }

            let decls = [];
            decls =
                node.declarations.length > 1
                    ? printCommaSeparatedList(
                          path,
                          print,
                          "declarations",
                          "",
                          "",
                          options,
                          {
                              leadingNewline: false,
                              trailingNewline: false
                          }
                      )
                    : path.map(print, "declarations");
            return concat([node.kind, " ", decls]);
        }
        case "VariableDeclarator": {
            const initializerOverride =
                resolveArgumentAliasInitializerDoc(path);
            if (initializerOverride) {
                return concat(
                    printSimpleDeclaration(print("id"), initializerOverride)
                );
            }
            return concat(printSimpleDeclaration(print("id"), print("init")));
        }
        case "ParenthesizedExpression": {
            if (shouldOmitSyntheticParens(path)) {
                return printWithoutExtraParens(path, print, "expression");
            }

            return concat([
                "(",
                printWithoutExtraParens(path, print, "expression"),
                ")"
            ]);
        }
        case "BinaryExpression": {
            let left = print("left");
            let operator = node.operator;
            let right = print("right");
            const logicalOperatorsStyle = resolveLogicalOperatorsStyle(options);

            const leftIsUndefined = isUndefinedLiteral(node.left);
            const rightIsUndefined = isUndefinedLiteral(node.right);

            if (
                (operator === "==" || operator === "!=") &&
                (leftIsUndefined || rightIsUndefined)
            ) {
                const expressionDoc = leftIsUndefined
                    ? printWithoutExtraParens(path, print, "right")
                    : printWithoutExtraParens(path, print, "left");
                const prefix =
                    operator === "!=" ? "!is_undefined(" : "is_undefined(";
                return group([prefix, expressionDoc, ")"]);
            }

            const booleanSimplification = simplifyBooleanBinaryExpression(
                path,
                print,
                node
            );
            if (booleanSimplification) {
                return booleanSimplification;
            }

            const canConvertDivisionToHalf =
                operator === "/" &&
                node?.right?.type === "Literal" &&
                node.right.value === "2" &&
                !hasComment(node) &&
                !hasComment(node.left) &&
                !hasComment(node.right);

            if (canConvertDivisionToHalf) {
                operator = "*";
                right = "0.5";
            } else {
                const styledOperator = applyLogicalOperatorsStyle(
                    operator,
                    logicalOperatorsStyle
                );

                if (styledOperator === operator) {
                    switch (operator) {
                        case "%": {
                            operator = "mod";

                            break;
                        }
                        case "^^": {
                            operator = "xor";

                            break;
                        }
                        case "<>": {
                            operator = "!=";

                            break;
                        }
                        // Intentionally omit a default branch so any operator that is not
                        // covered above preserves the exact token emitted by the parser.
                        // Introducing a catch-all would make it easy to "fix" unfamiliar
                        // operators into something else, which risks corrupting source that
                        // relies on newly added or editor-specific syntax.
                    }
                } else {
                    operator = styledOperator;
                }
            }

            return group([left, " ", group([operator, line, right])]);
        }
        case "UnaryExpression":
        case "IncDecStatement":
        case "IncDecExpression": {
            return node.prefix
                ? concat([node.operator, print("argument")])
                : concat([print("argument"), node.operator]);
        }
        case "CallExpression": {
            if (node?.[FEATHER_COMMENT_OUT_SYMBOL]) {
                const commentText = getFeatherCommentCallText(node);
                const renderedText =
                    typeof node[FEATHER_COMMENT_TEXT_SYMBOL] === "string" &&
                    node[FEATHER_COMMENT_TEXT_SYMBOL].length > 0
                        ? node[FEATHER_COMMENT_TEXT_SYMBOL]
                        : commentText;

                if (renderedText) {
                    return concat(["// ", renderedText]);
                }

                return "//";
            }

            if (options && typeof options.originalText === "string") {
                const hasNestedPreservedArguments = Array.isArray(
                    node.arguments
                )
                    ? node.arguments.some(
                          (argument) =>
                              argument?.preserveOriginalCallText === true
                      )
                    : false;
                const startIndex = getNodeStartIndex(node);
                const endIndex = getNodeEndIndex(node);

                if (
                    typeof startIndex === "number" &&
                    typeof endIndex === "number" &&
                    endIndex > startIndex
                ) {
                    const synthesizedText =
                        synthesizeMissingCallArgumentSeparators(
                            node,
                            options.originalText,
                            startIndex,
                            endIndex
                        );

                    if (typeof synthesizedText === "string") {
                        return synthesizedText;
                    }

                    if (
                        node.preserveOriginalCallText &&
                        !hasNestedPreservedArguments
                    ) {
                        return options.originalText.slice(startIndex, endIndex);
                    }
                }
            }

            applyTrigonometricFunctionSimplification(path);
            let printedArgs = [];

            if (node.arguments.length === 0) {
                printedArgs = [printEmptyParens(path, print, options)];
            } else {
                const maxParamsPerLine = Number.isFinite(
                    options?.maxParamsPerLine
                )
                    ? options.maxParamsPerLine
                    : 0;
                const elementsPerLineLimit =
                    maxParamsPerLine > 0 ? maxParamsPerLine : Infinity;

                const callbackArguments = node.arguments.filter(
                    (argument) => argument?.type === "FunctionDeclaration"
                );
                const structArguments = node.arguments.filter(
                    (argument) => argument?.type === "StructExpression"
                );
                const structArgumentsToBreak = structArguments.filter(
                    (argument) => shouldForceBreakStructArgument(argument)
                );

                structArgumentsToBreak.forEach((argument) => {
                    forcedStructArgumentBreaks.set(
                        argument,
                        getStructAlignmentInfo(argument, options)
                    );
                });

                const shouldForceBreakArguments =
                    (maxParamsPerLine > 0 &&
                        node.arguments.length > maxParamsPerLine) ||
                    callbackArguments.length > 1 ||
                    structArgumentsToBreak.length > 0;

                const shouldUseCallbackLayout = [
                    node.arguments[0],
                    node.arguments.at(-1)
                ].some(
                    (argumentNode) =>
                        argumentNode?.type === "FunctionDeclaration" ||
                        argumentNode?.type === "StructExpression"
                );

                const shouldIncludeInlineVariant =
                    shouldUseCallbackLayout && !shouldForceBreakArguments;

                const hasCallbackArguments = callbackArguments.length > 0;

                const { inlineDoc, multilineDoc } = buildCallArgumentsDocs(
                    path,
                    print,
                    options,
                    {
                        forceBreak: shouldForceBreakArguments,
                        maxElementsPerLine: elementsPerLineLimit,
                        includeInlineVariant: shouldIncludeInlineVariant,
                        hasCallbackArguments
                    }
                );

                if (shouldUseCallbackLayout) {
                    if (shouldForceBreakArguments) {
                        printedArgs = [concat([breakParent, multilineDoc])];
                    } else if (inlineDoc) {
                        printedArgs = [
                            conditionalGroup([inlineDoc, multilineDoc])
                        ];
                    } else {
                        printedArgs = [multilineDoc];
                    }
                } else {
                    printedArgs = shouldForceBreakArguments
                        ? [concat([breakParent, multilineDoc])]
                        : [multilineDoc];
                }
            }

            const calleeDoc = print("object");

            return isInLValueChain(path)
                ? concat([calleeDoc, ...printedArgs])
                : group([calleeDoc, ...printedArgs]);
        }
        case "MemberDotExpression": {
            if (
                isInLValueChain(path) &&
                path.parent?.type === "CallExpression"
            ) {
                const objectNode = path.getValue()?.object;
                const shouldAllowBreakBeforeDot =
                    objectNode &&
                    (objectNode.type === "CallExpression" ||
                        objectNode.type === "MemberDotExpression" ||
                        objectNode.type === "MemberIndexExpression");

                if (shouldAllowBreakBeforeDot) {
                    return concat([
                        print("object"),
                        softline,
                        ".",
                        print("property")
                    ]);
                }

                return concat([print("object"), ".", print("property")]);
            } else {
                // return [
                //     print("object"),
                //     ".",
                //     print("property")
                // ];
                const objectDoc = print("object");
                let propertyDoc = print("property");

                if (propertyDoc === undefined) {
                    propertyDoc = printCommaSeparatedList(
                        path,
                        print,
                        "property",
                        "",
                        "",
                        options
                    );
                }

                return concat([objectDoc, ".", propertyDoc]);
                // return [
                //     print("object"),
                //     ".",
                //     print("property")
                // ];
            }
        }
        case "MemberIndexExpression": {
            let accessor = print("accessor");
            if (accessor.length > 1) {
                accessor += " ";
            }
            let property = printCommaSeparatedList(
                path,
                print,
                "property",
                "",
                "",
                options
            );
            return concat([
                print("object"),
                accessor,
                group(indent(property)),
                "]"
            ]);
        }
        case "StructExpression": {
            if (node.properties.length === 0) {
                return concat(printEmptyBlock(path, options, print));
            }

            const shouldForceBreakStruct = forcedStructArgumentBreaks.has(node);
            const objectWrapOption = resolveObjectWrapOption(options);
            const shouldPreserveStructWrap =
                objectWrapOption === ObjectWrapOption.PRESERVE &&
                structLiteralHasLeadingLineBreak(node, options);

            return concat(
                printCommaSeparatedList(
                    path,
                    print,
                    "properties",
                    "{",
                    "}",
                    options,
                    {
                        forceBreak:
                            node.hasTrailingComma ||
                            shouldForceBreakStruct ||
                            shouldPreserveStructWrap,
                        // TODO: Keep struct literals flush with their braces for
                        // now. GameMaker's runtime formatter and the examples in
                        // the manual (https://manual.gamemaker.io/monthly/en/#t=GameMaker_Language%2FGML_Reference%2FVariable_Functions%2FStructs.htm)
                        // render `{foo: 1}` without internal padding, and our
                        // documentation screenshots rely on matching that
                        // output. If we decide to adopt spaced braces we need to
                        // coordinate fixture updates and call out the style
                        // shift in the changelog so downstream format-on-save
                        // hooks do not surprise teams mid-upgrade.
                        padding: ""
                    }
                )
            );
        }
        case "Property": {
            const parentNode =
                typeof path.getParentNode === "function"
                    ? path.getParentNode()
                    : null;
            const alignmentInfo = forcedStructArgumentBreaks.get(parentNode);
            const nameDoc = print("name");
            const valueDoc = print("value");

            if (alignmentInfo?.maxNameLength > 0) {
                const nameLength = getStructPropertyNameLength(node, options);
                const paddingWidth = Math.max(
                    alignmentInfo.maxNameLength - nameLength + 1,
                    1
                );
                const padding = " ".repeat(paddingWidth);

                return concat([nameDoc, padding, ": ", valueDoc]);
            }

            const originalPrefix = getStructPropertyPrefix(node, options);
            if (originalPrefix) {
                return concat([originalPrefix, valueDoc]);
            }

            return concat([nameDoc, ": ", valueDoc]);
        }
        case "ArrayExpression": {
            const allowTrailingComma = shouldAllowTrailingComma(options);
            return concat(
                printCommaSeparatedList(
                    path,
                    print,
                    "elements",
                    "[",
                    "]",
                    options,
                    {
                        allowTrailingDelimiter: allowTrailingComma,
                        forceBreak: allowTrailingComma && node.hasTrailingComma
                    }
                )
            );
        }
        case "EnumDeclaration": {
            prepareEnumMembersForPrinting(node, getNodeName);
            return concat([
                "enum ",
                print("name"),
                " ",
                printCommaSeparatedList(
                    path,
                    print,
                    "members",
                    "{",
                    "}",
                    options,
                    {
                        forceBreak: node.hasTrailingComma
                    }
                )
            ]);
        }
        case "ReturnStatement": {
            return node.argument
                ? concat(["return ", print("argument")])
                : concat("return");
        }
        case "ThrowStatement": {
            return node.argument
                ? concat(["throw ", print("argument")])
                : "throw";
        }
        case "MacroDeclaration": {
            const macroText =
                typeof node._featherMacroText === "string"
                    ? node._featherMacroText
                    : options.originalText.slice(
                          node.start.index,
                          node.end.index + 1
                      );

            if (typeof node._featherMacroText === "string") {
                return concat(stripTrailingLineTerminators(macroText));
            }

            let textToPrint = macroText;

            const macroStartIndex = getNodeStartIndex(node);
            const { start: nameStartIndex, end: nameEndIndex } =
                getNodeRangeIndices(node.name);
            if (
                typeof macroStartIndex === "number" &&
                typeof nameStartIndex === "number" &&
                typeof nameEndIndex === "number" &&
                nameStartIndex >= macroStartIndex &&
                nameEndIndex >= nameStartIndex
            ) {
                const renamed = getIdentifierCaseRenameForNode(
                    node.name,
                    options
                );
                if (isNonEmptyString(renamed)) {
                    const relativeStart = nameStartIndex - macroStartIndex;
                    const relativeEnd = nameEndIndex - macroStartIndex;
                    const before = textToPrint.slice(0, relativeStart);
                    const after = textToPrint.slice(relativeEnd);
                    textToPrint = `${before}${renamed}${after}`;
                }
            }

            return concat(stripTrailingLineTerminators(textToPrint));
        }
        case "RegionStatement": {
            return concat(["#region", print("name")]);
        }
        case "EndRegionStatement": {
            return concat(["#endregion", print("name")]);
        }
        case "DefineStatement": {
            const directive =
                typeof node.replacementDirective === "string"
                    ? node.replacementDirective
                    : "#macro";
            const suffixDoc =
                typeof node.replacementSuffix === "string"
                    ? node.replacementSuffix
                    : print("name");

            if (typeof suffixDoc === "string") {
                const needsSeparator =
                    suffixDoc.length > 0 && !/^\s/.test(suffixDoc);

                return needsSeparator
                    ? concat([directive, " ", suffixDoc])
                    : concat([directive, suffixDoc]);
            }

            return concat([directive, suffixDoc]);
        }
        case "DeleteStatement": {
            return concat(["delete ", print("argument")]);
        }
        case "BreakStatement": {
            return concat("break");
        }
        case "ExitStatement": {
            return concat("exit");
        }
        case "ContinueStatement": {
            return concat("continue");
        }
        case "EmptyStatement": {
            return concat("");
        }
        case "Literal": {
            let value = node.value;

            if (value.startsWith(".") && !value.startsWith('"')) {
                value = "0" + value; // Fix decimals without a leading 0.
            }
            if (value.endsWith(".") && !value.endsWith('"')) {
                value = value + "0"; // Fix decimals without a trailing 0.
            }
            return concat(value);
        }
        case "Identifier": {
            const prefix = shouldPrefixGlobalIdentifier(path) ? "global." : "";
            let identifierName = node.name;

            const argumentIndex =
                getArgumentIndexFromIdentifier(identifierName);
            if (argumentIndex !== null) {
                const functionNode = findEnclosingFunctionDeclaration(path);
                const preferredArgumentName = resolvePreferredParameterName(
                    functionNode,
                    argumentIndex,
                    node.name,
                    options
                );
                if (isNonEmptyString(preferredArgumentName)) {
                    identifierName = preferredArgumentName;
                }
            }

            const preferredParamName = getPreferredFunctionParameterName(
                path,
                node,
                options
            );
            if (isNonEmptyString(preferredParamName)) {
                identifierName = preferredParamName;
            }

            const renamed = getIdentifierCaseRenameForNode(node, options);
            if (isNonEmptyString(renamed)) {
                identifierName = renamed;
            }

            let extraPadding = 0;
            if (
                typeof path?.getParentNode === "function" &&
                typeof path?.getName === "function" &&
                path.getName() === "id"
            ) {
                const parentNode = path.getParentNode();
                if (
                    parentNode?.type === "VariableDeclarator" &&
                    typeof parentNode._alignAssignmentPadding === "number"
                ) {
                    extraPadding = Math.max(
                        0,
                        parentNode._alignAssignmentPadding
                    );
                }
            }

            const docs = [prefix, identifierName];
            if (extraPadding > 0) {
                docs.push(" ".repeat(extraPadding));
            }

            return concat(docs);
        }
        case "TemplateStringText": {
            return concat(node.value);
        }
        case "MissingOptionalArgument": {
            return concat("undefined");
        }
        case "NewExpression": {
            let argsPrinted;
            argsPrinted =
                node.arguments.length === 0
                    ? [printEmptyParens(path, print, options)]
                    : [
                          printCommaSeparatedList(
                              path,
                              print,
                              "arguments",
                              "(",
                              ")",
                              options
                          )
                      ];
            return concat(["new ", print("expression"), ...argsPrinted]);
        }
        case "EnumMember": {
            const extraPadding = getEnumNameAlignmentPadding(node);
            let nameDoc = print("name");
            if (extraPadding > 0) {
                nameDoc = concat([nameDoc, " ".repeat(extraPadding)]);
            }
            return concat(
                printSimpleDeclaration(nameDoc, print("initializer"))
            );
        }
        case "CatchClause": {
            const parts = [];
            parts.push(" catch ");
            if (node.param) {
                parts.push(["(", print("param"), ")"]);
            }
            if (node.body) {
                parts.push(" ", printInBlock(path, options, print, "body"));
            }
            return concat(parts);
        }
        case "Finalizer": {
            const parts = [];
            parts.push(" finally ");
            if (node.body) {
                parts.push(printInBlock(path, options, print, "body"));
            }
            return concat(parts);
        }
        case "TryStatement": {
            return concat([
                "try ",
                printInBlock(path, options, print, "block"),
                print("handler"),
                print("finalizer")
            ]);
        }
        case "TemplateStringExpression": {
            const hasAtomArray = Array.isArray(node.atoms);
            const atoms = hasAtomArray ? node.atoms : [];
            const literalTextParts = [];
            let shouldCollapseToLiteral = hasAtomArray;

            for (const atom of atoms) {
                if (atom?.type !== "TemplateStringText") {
                    shouldCollapseToLiteral = false;
                    break;
                }

                if (typeof atom.value !== "string") {
                    shouldCollapseToLiteral = false;
                    break;
                }

                literalTextParts.push(atom.value);
            }

            if (
                shouldCollapseToLiteral &&
                literalTextParts.length === atoms.length
            ) {
                const literalText = literalTextParts.join("");
                const stringLiteral = JSON.stringify(literalText);
                return concat(stringLiteral);
            }

            return concat(buildTemplateStringParts(atoms, path, print));
        }
        default: {
            console.warn(
                "Print.js:print encountered unhandled node type: " + node.type,
                node
            );
        }
    }
}

function getFeatherCommentCallText(node) {
    if (!node || node.type !== "CallExpression") {
        return "";
    }

    const calleeName = getIdentifierText(node.object);

    if (!calleeName) {
        return "";
    }

    const args = getCallExpressionArguments(node);

    if (!Array.isArray(args) || args.length === 0) {
        return `${calleeName}()`;
    }

    const placeholderArgs = args.map(() => "...").join(", ");
    return `${calleeName}(${placeholderArgs})`;
}

function buildTemplateStringParts(atoms, path, print) {
    const parts = [];
    parts.push('$"');

    const printedAtoms = path.map(print, "atoms");

    for (const [index, atom] of atoms.entries()) {
        if (
            atom?.type === "TemplateStringText" &&
            typeof atom.value === "string"
        ) {
            parts.push(atom.value);
            continue;
        }

        parts.push("{", printedAtoms[index], "}");
    }

    parts.push('"');
    return parts;
}

function printDelimitedList(
    path,
    print,
    listKey,
    startChar,
    endChar,
    {
        delimiter = ",",
        allowTrailingDelimiter = false,
        leadingNewline = true,
        trailingNewline = true,
        forceBreak = false,
        padding = "",
        addIndent = true,
        groupId,
        forceInline = false,
        maxElementsPerLine = Infinity
    }
) {
    const lineBreak = forceBreak ? hardline : line;
    const finalDelimiter = allowTrailingDelimiter ? delimiter : "";

    const innerDoc = [
        ifBreak(leadingNewline ? lineBreak : "", padding),
        printElements(
            path,
            print,
            listKey,
            delimiter,
            lineBreak,
            maxElementsPerLine
        )
    ];

    const groupElements = [
        startChar,
        addIndent ? indent(innerDoc) : innerDoc,
        // always print a trailing delimiter if the list breaks
        ifBreak([finalDelimiter, trailingNewline ? lineBreak : ""], padding),
        endChar
    ];

    const groupElementsNoBreak = [
        startChar,
        padding,
        printElements(path, print, listKey, delimiter, " ", maxElementsPerLine),
        padding,
        endChar
    ];

    return forceInline
        ? groupElementsNoBreak
        : group(groupElements, { groupId });
}

function synthesizeMissingCallArgumentSeparators(
    node,
    originalText,
    startIndex,
    endIndex
) {
    if (
        !node ||
        node.type !== "CallExpression" ||
        !Array.isArray(node.arguments) ||
        typeof originalText !== "string" ||
        typeof startIndex !== "number" ||
        typeof endIndex !== "number" ||
        endIndex <= startIndex
    ) {
        return null;
    }

    let cursor = startIndex;
    let normalizedText = "";
    let insertedSeparator = false;

    for (let index = 0; index < node.arguments.length; index += 1) {
        const argument = node.arguments[index];
        const argumentStart = getNodeStartIndex(argument);
        const argumentEnd = getNodeEndIndex(argument);

        if (
            typeof argumentStart !== "number" ||
            typeof argumentEnd !== "number" ||
            argumentStart < cursor ||
            argumentEnd > endIndex
        ) {
            return null;
        }

        normalizedText += originalText.slice(cursor, argumentStart);
        normalizedText += originalText.slice(argumentStart, argumentEnd);
        cursor = argumentEnd;

        if (index >= node.arguments.length - 1) {
            continue;
        }

        const nextArgument = node.arguments[index + 1];
        const nextStart = getNodeStartIndex(nextArgument);

        if (typeof nextStart !== "number" || nextStart < cursor) {
            return null;
        }

        const between = originalText.slice(cursor, nextStart);

        if (between.includes(",")) {
            normalizedText += between;
            cursor = nextStart;
            continue;
        }

        const trimmedBetween = between.trim();

        if (trimmedBetween.length === 0) {
            const previousChar =
                cursor > startIndex ? originalText[cursor - 1] : "";
            const nextChar =
                nextStart < originalText.length ? originalText[nextStart] : "";

            if (
                isNumericLiteralBoundaryCharacter(previousChar) &&
                isNumericLiteralBoundaryCharacter(nextChar)
            ) {
                normalizedText += "," + between;
                cursor = nextStart;
                insertedSeparator = true;
                continue;
            }
        }

        normalizedText += between;
        cursor = nextStart;
    }

    normalizedText += originalText.slice(cursor, endIndex);

    return insertedSeparator ? normalizedText : null;
}

function isNumericLiteralBoundaryCharacter(character) {
    return /[0-9.-]/.test(character ?? "");
}

function shouldAllowTrailingComma(options) {
    return options?.trailingComma === "all";
}

function buildCallArgumentsDocs(
    path,
    print,
    options,
    {
        forceBreak = false,
        maxElementsPerLine = Infinity,
        includeInlineVariant = false,
        hasCallbackArguments = false
    } = {}
) {
    const node = path.getValue();
    const simplePrefixLength = countLeadingSimpleCallArguments(node);
    const hasTrailingArguments =
        Array.isArray(node?.arguments) &&
        node.arguments.length > simplePrefixLength;

    if (
        simplePrefixLength > 1 &&
        hasTrailingArguments &&
        hasCallbackArguments &&
        maxElementsPerLine === Infinity
    ) {
        const inlineDoc = includeInlineVariant
            ? printCommaSeparatedList(
                  path,
                  print,
                  "arguments",
                  "(",
                  ")",
                  options,
                  {
                      addIndent: false,
                      forceInline: true,
                      leadingNewline: false,
                      trailingNewline: false,
                      maxElementsPerLine
                  }
              )
            : null;

        const multilineDoc = buildCallbackArgumentsWithSimplePrefix(
            path,
            print,
            simplePrefixLength
        );

        return { inlineDoc, multilineDoc };
    }

    const multilineDoc = printCommaSeparatedList(
        path,
        print,
        "arguments",
        "(",
        ")",
        options,
        {
            forceBreak,
            maxElementsPerLine
        }
    );

    const inlineDoc = includeInlineVariant
        ? printCommaSeparatedList(path, print, "arguments", "(", ")", options, {
              addIndent: false,
              forceInline: true,
              leadingNewline: false,
              trailingNewline: false,
              maxElementsPerLine
          })
        : null;

    return { inlineDoc, multilineDoc };
}

function buildFunctionParameterDocs(path, print, options) {
    const multilineDoc = printCommaSeparatedList(
        path,
        print,
        "params",
        "(",
        ")",
        options,
        {
            allowTrailingDelimiter: false
        }
    );

    const inlineDoc = printCommaSeparatedList(
        path,
        print,
        "params",
        "(",
        ")",
        options,
        {
            addIndent: false,
            allowTrailingDelimiter: false,
            forceInline: true,
            leadingNewline: false,
            trailingNewline: false
        }
    );

    return { inlineDoc, multilineDoc };
}

function maybePrintInlineDefaultParameterFunctionBody(path, print) {
    const node = path.getValue();
    const parentNode = path.parent;

    if (!node || node.type !== "FunctionDeclaration") {
        return null;
    }

    if (!parentNode || parentNode.type !== "DefaultParameter") {
        return null;
    }

    if (isNonEmptyArray(node.docComments)) {
        return null;
    }

    if (hasComment(node)) {
        return null;
    }

    const bodyNode = node.body;
    if (!bodyNode || bodyNode.type !== "BlockStatement") {
        return null;
    }

    if (hasComment(bodyNode)) {
        return null;
    }

    const statements = getBodyStatements(bodyNode);
    if (!Array.isArray(statements) || statements.length !== 1) {
        return null;
    }

    const [onlyStatement] = statements;
    if (!onlyStatement || hasComment(onlyStatement)) {
        return null;
    }

    if (onlyStatement.type !== "CallExpression") {
        return null;
    }

    const statementDoc = path.call(
        (bodyPath) => bodyPath.call(print, "body", 0),
        "body"
    );

    if (!statementDoc || willBreak(statementDoc)) {
        return null;
    }

    const semicolon = optionalSemicolon(onlyStatement.type);
    return group(["{ ", statementDoc, semicolon, " }"]);
}

function printCommaSeparatedList(
    path,
    print,
    listKey,
    startChar,
    endChar,
    options,
    overrides = {}
) {
    const allowTrailingDelimiter =
        overrides.allowTrailingDelimiter === undefined
            ? shouldAllowTrailingComma(options)
            : overrides.allowTrailingDelimiter;

    return printDelimitedList(path, print, listKey, startChar, endChar, {
        delimiter: ",",
        ...overrides,
        allowTrailingDelimiter
    });
}

// Force statement-shaped children into explicit `{}` blocks so every call site
// that relies on this helper inherits the same guard rails. The printer uses it
// for `if`, loop, and struct bodies where we always emit braces regardless of
// how the source was written. Centralizing the wrapping ensures semicolon
// bookkeeping stays wired through `optionalSemicolon`, keeps synthetic doc
// comments anchored to the block node they describe, and prevents individual
// callers from drifting in how they indent or collapse single-statement bodies.
// When we experimented with open-coding the wrapping logic in each printer, it
// was easy to miss one of those responsibilities and regress either the
// formatter's brace guarantees or the doc comment synthesis covered by the
// synthetic doc comment integration tests
// (`src/plugin/tests/synthetic-doc-comments.test.js`).
function printInBlock(path, options, print, expressionKey) {
    const node = path.getValue()[expressionKey];
    return node.type === "BlockStatement"
        ? [print(expressionKey), optionalSemicolon(node.type)]
        : [
              "{",
              indent([
                  hardline,
                  print(expressionKey),
                  optionalSemicolon(node.type)
              ]),
              hardline,
              "}"
          ];
}

function shouldPrintBlockAlternateAsElseIf(node) {
    if (!node || node.type !== "BlockStatement") {
        return false;
    }

    if (hasComment(node)) {
        return false;
    }

    const body = getBodyStatements(node);
    if (body.length !== 1) {
        return false;
    }

    const [onlyStatement] = body;
    return onlyStatement?.type === "IfStatement";
}

// print a delimited sequence of elements
// handles the case where a trailing comment follows a delimiter
function printElements(
    path,
    print,
    listKey,
    delimiter,
    lineBreak,
    maxElementsPerLine = Infinity
) {
    const node = path.getValue();
    const finalIndex = node[listKey].length - 1;
    let itemsSinceLastBreak = 0;
    return path.map((childPath, index) => {
        const parts = [];
        const printed = print();
        const separator = index === finalIndex ? "" : delimiter;

        if (docHasTrailingComment(printed)) {
            printed.splice(-1, 0, separator);
            parts.push(printed);
        } else {
            parts.push(printed, separator);
        }

        if (index !== finalIndex) {
            const hasLimit =
                Number.isFinite(maxElementsPerLine) && maxElementsPerLine > 0;
            itemsSinceLastBreak += 1;
            if (hasLimit) {
                const childNode = childPath.getValue();
                const nextNode =
                    index < finalIndex ? node[listKey][index + 1] : null;
                const shouldBreakAfter =
                    isComplexArgumentNode(childNode) ||
                    isComplexArgumentNode(nextNode) ||
                    itemsSinceLastBreak >= maxElementsPerLine;

                if (shouldBreakAfter) {
                    parts.push(lineBreak);
                    itemsSinceLastBreak = 0;
                } else {
                    parts.push(" ");
                }
            } else {
                parts.push(lineBreak);
            }
        }

        return parts;
    }, listKey);
}

function isComplexArgumentNode(node) {
    if (!node || typeof node.type !== "string") {
        return false;
    }

    return (
        node.type === "CallExpression" ||
        node.type === "FunctionDeclaration" ||
        node.type === "StructExpression"
    );
}

const SIMPLE_CALL_ARGUMENT_TYPES = new Set([
    "Identifier",
    "Literal",
    "MemberDotExpression",
    "MemberIndexExpression",
    "ThisExpression",
    "BooleanLiteral",
    "UndefinedLiteral"
]);

function isSimpleCallArgument(node) {
    if (!node || typeof node.type !== "string") {
        return false;
    }

    if (isComplexArgumentNode(node)) {
        return false;
    }

    if (SIMPLE_CALL_ARGUMENT_TYPES.has(node.type)) {
        return true;
    }

    if (node.type === "Literal" && typeof node.value === "string") {
        const literalValue = node.value.toLowerCase();
        if (literalValue === "undefined" || literalValue === "noone") {
            return true;
        }
    }

    return false;
}

function countLeadingSimpleCallArguments(node) {
    if (!node || !Array.isArray(node.arguments)) {
        return 0;
    }

    let count = 0;
    for (const argument of node.arguments) {
        if (!isSimpleCallArgument(argument)) {
            break;
        }

        count += 1;
    }

    return count;
}

function buildCallbackArgumentsWithSimplePrefix(
    path,
    print,
    simplePrefixLength
) {
    const node = path.getValue();
    const args = Array.isArray(node?.arguments) ? node.arguments : [];
    const parts = [];

    for (let index = 0; index < args.length; index += 1) {
        parts.push(path.call(print, "arguments", index));

        if (index >= args.length - 1) {
            continue;
        }

        parts.push(",");

        if (index < simplePrefixLength - 1) {
            parts.push(" ");
            continue;
        }

        parts.push(line);
    }

    return group(["(", indent([softline, ...parts]), softline, ")"]);
}

function shouldForceBreakStructArgument(argument) {
    if (!argument || argument.type !== "StructExpression") {
        return false;
    }

    if (hasComment(argument)) {
        return true;
    }

    const properties = Array.isArray(argument.properties)
        ? argument.properties
        : [];

    if (properties.length === 0) {
        return false;
    }

    if (properties.some((property) => hasComment(property))) {
        return true;
    }

    return properties.length > 2;
}

function getStructAlignmentInfo(structNode, options) {
    if (!structNode || structNode.type !== "StructExpression") {
        return null;
    }

    const properties = Array.isArray(structNode.properties)
        ? structNode.properties
        : [];

    let maxNameLength = 0;

    for (const property of properties) {
        const nameLength = getStructPropertyNameLength(property, options);
        if (nameLength > maxNameLength) {
            maxNameLength = nameLength;
        }
    }

    if (maxNameLength <= 0) {
        return { maxNameLength: 0 };
    }

    return { maxNameLength };
}

function getStructPropertyNameLength(property, options) {
    if (!property) {
        return 0;
    }

    const nameNode = property.name ?? property.key;
    if (typeof nameNode === "string") {
        return nameNode.length;
    }

    if (!nameNode) {
        return 0;
    }

    if (nameNode.type === "Identifier") {
        const identifierText = getIdentifierText(nameNode);
        return typeof identifierText === "string" ? identifierText.length : 0;
    }

    const source = getSourceTextForNode(nameNode, options);
    return typeof source === "string" ? source.length : 0;
}

// variation of printElements that handles semicolons and line breaks in a program or block
function isMacroLikeStatement(node) {
    if (!node || typeof node.type !== "string") {
        return false;
    }

    if (node.type === "MacroDeclaration") {
        return true;
    }

    if (node.type === "DefineStatement") {
        return getNormalizedDefineReplacementDirective(node) === "#macro";
    }

    return false;
}

function shouldSuppressEmptyLineBetween(previousNode, nextNode) {
    if (!previousNode || !nextNode) {
        return false;
    }

    if (isMacroLikeStatement(previousNode) && isMacroLikeStatement(nextNode)) {
        return true;
    }

    return false;
}

function getNextNonWhitespaceCharacter(text, startIndex) {
    if (typeof text !== "string") {
        return null;
    }

    const { length } = text;
    for (let index = startIndex; index < length; index += 1) {
        const characterCode = text.charCodeAt(index);

        // Skip standard ASCII whitespace characters so the caller can reason
        // about the next syntactically meaningful token without repeatedly
        // slicing the original source text.
        switch (characterCode) {
            case 9: // \t
            case 10: // \n
            case 11: // vertical tab
            case 12: // form feed
            case 13: // \r
            case 32: {
                // space
                continue;
            }
            default: {
                return text.charAt(index);
            }
        }
    }

    return null;
}

function printStatements(path, options, print, childrenAttribute) {
    let previousNodeHadNewlineAddedAfter = false; // tracks newline added after the previous node

    const parentNode = path.getValue();
    const containerNode =
        typeof path.getParentNode === "function" ? path.getParentNode() : null;
    const statements =
        parentNode && Array.isArray(parentNode[childrenAttribute])
            ? parentNode[childrenAttribute]
            : null;
    if (statements) {
        applyAssignmentAlignment(statements, options, path, childrenAttribute);
    }

    const syntheticDocByNode = new Map();
    if (statements) {
        for (const statement of statements) {
            const docComment =
                getSyntheticDocCommentForStaticVariable(statement, options) ??
                getSyntheticDocCommentForFunctionAssignment(statement, options);
            if (docComment) {
                syntheticDocByNode.set(statement, docComment);
            }
        }
    }

    // Cache frequently used option lookups to avoid re-evaluating them in the tight map loop.
    const locStart =
        typeof options.locStart === "function" ? options.locStart : null;
    const locEnd = typeof options.locEnd === "function" ? options.locEnd : null;
    const originalTextCache = options.originalText;

    return path.map((childPath, index) => {
        const parts = [];
        const node = childPath.getValue();
        const isTopLevel = childPath.parent?.type === "Program";
        const printed = print();

        if (printed == undefined) {
            return [];
        }

        let semi = optionalSemicolon(node.type);
        const startProp = node?.start;
        const endProp = node?.end;
        const fallbackStart =
            typeof startProp === "number"
                ? startProp
                : typeof startProp?.index === "number"
                  ? startProp.index
                  : 0;
        const fallbackEnd =
            typeof endProp === "number"
                ? endProp
                : typeof endProp?.index === "number"
                  ? endProp.index
                  : fallbackStart;
        const nodeStartIndex = locStart ? locStart(node) : fallbackStart;
        const nodeEndIndex = locEnd ? locEnd(node) - 1 : fallbackEnd;

        const currentNodeRequiresNewline =
            shouldAddNewlinesAroundStatement(node, options) && isTopLevel;

        // Check if a newline should be added BEFORE the statement
        if (currentNodeRequiresNewline && !previousNodeHadNewlineAddedAfter) {
            const hasLeadingComment = isTopLevel
                ? hasCommentImmediatelyBefore(originalTextCache, nodeStartIndex)
                : false;

            if (
                isTopLevel &&
                !isPreviousLineEmpty(options.originalText, nodeStartIndex) &&
                !hasLeadingComment
            ) {
                parts.push(hardline);
            }
        }

        const syntheticDocRecord = syntheticDocByNode.get(node);
        const syntheticDocComment = syntheticDocRecord
            ? syntheticDocRecord.doc
            : null;
        if (syntheticDocComment) {
            parts.push(syntheticDocComment, hardline);
        }

        const textForSemicolons = originalTextCache || "";
        let hasTerminatingSemicolon = textForSemicolons[nodeEndIndex] === ";";
        if (!hasTerminatingSemicolon) {
            const textLength = textForSemicolons.length;
            let cursor = nodeEndIndex + 1;
            while (
                cursor < textLength &&
                isSkippableSemicolonWhitespace(
                    textForSemicolons.charCodeAt(cursor)
                )
            ) {
                cursor++;
            }
            hasTerminatingSemicolon = textForSemicolons[cursor] === ";";
        }

        const isVariableDeclaration = node.type === "VariableDeclaration";
        const isStaticDeclaration =
            isVariableDeclaration && node.kind === "static";
        const hasFunctionInitializer =
            isVariableDeclaration &&
            Array.isArray(node.declarations) &&
            node.declarations.some((declaration) => {
                const initType = declaration?.init?.type;
                return (
                    initType === "FunctionExpression" ||
                    initType === "FunctionDeclaration"
                );
            });

        const isFirstStatementInBlock =
            index === 0 && childPath.parent?.type !== "Program";

        const suppressFollowingEmptyLine =
            node?._featherSuppressFollowingEmptyLine === true ||
            node?._gmlSuppressFollowingEmptyLine === true;

        if (
            isFirstStatementInBlock &&
            isStaticDeclaration &&
            !syntheticDocComment
        ) {
            parts.push(hardline);
        }

        if (semi === ";") {
            const initializerIsFunctionExpression =
                node.type === "VariableDeclaration" &&
                Array.isArray(node.declarations) &&
                node.declarations.length === 1 &&
                (node.declarations[0]?.init?.type === "FunctionExpression" ||
                    node.declarations[0]?.init?.type === "FunctionDeclaration");

            if (initializerIsFunctionExpression && !hasTerminatingSemicolon) {
                // Normalized legacy `#define` directives used to omit trailing
                // semicolons when rewriting to function expressions. The
                // formatter now standardizes those assignments so they always
                // emit an explicit semicolon, matching the golden fixtures and
                // keeping the output consistent regardless of the original
                // source style.
                semi = ";";
            }
        }

        const shouldDropConstructorMethodSemicolon =
            semi === ";" &&
            !hasTerminatingSemicolon &&
            node.type === "AssignmentExpression" &&
            isInsideConstructorFunction(childPath);

        if (shouldDropConstructorMethodSemicolon) {
            semi = "";
        }

        const shouldOmitSemicolon =
            semi === ";" &&
            !hasTerminatingSemicolon &&
            syntheticDocComment &&
            !(syntheticDocRecord?.hasExistingDocLines ?? false) &&
            isLastStatement(childPath) &&
            !isStaticDeclaration;

        if (shouldOmitSemicolon) {
            semi = "";
        }

        // Preserve the `statement; // trailing comment` shape that GameMaker
        // authors rely on. When the child doc ends with a trailing comment token
        // we cannot blindly append the semicolon because Prettier would render
        // `statement // comment;`, effectively moving the comment past the
        // terminator. Inserting the semicolon right before the comment keeps the
        // formatter's "always add the final `;`" guarantee intact without
        // rewriting author comments or dropping the semicolon entirely—a
        // regression we previously hit when normalising legacy `#define`
        // assignments.
        if (docHasTrailingComment(printed)) {
            printed.splice(-1, 0, semi);
            parts.push(printed);
        } else {
            parts.push(printed, semi);
        }

        // Reset flag for next iteration
        previousNodeHadNewlineAddedAfter = false;

        // Check if a newline should be added AFTER the statement
        if (!isLastStatement(childPath)) {
            const nextNode = statements ? statements[index + 1] : null;
            const shouldSuppressExtraEmptyLine = shouldSuppressEmptyLineBetween(
                node,
                nextNode
            );
            const nextNodeIsMacro = isMacroLikeStatement(nextNode);
            const shouldSkipStandardHardline =
                shouldSuppressExtraEmptyLine &&
                isMacroLikeStatement(node) &&
                !nextNodeIsMacro;

            if (!shouldSkipStandardHardline) {
                parts.push(hardline);
            }

            const nextHasSyntheticDoc = nextNode
                ? syntheticDocByNode.has(nextNode)
                : false;
            const nextLineProbeIndex =
                node?.type === "DefineStatement" ||
                node?.type === "MacroDeclaration"
                    ? nodeEndIndex
                    : nodeEndIndex + 1;

            const suppressLeadingEmptyLine =
                nextNode?._featherSuppressLeadingEmptyLine === true;
            const forceFollowingEmptyLine =
                node?._featherForceFollowingEmptyLine === true ||
                node?._gmlForceFollowingEmptyLine === true;

            const nextLineEmpty =
                suppressFollowingEmptyLine || suppressLeadingEmptyLine
                    ? false
                    : isNextLineEmpty(options.originalText, nextLineProbeIndex);

            const isSanitizedMacro =
                node?.type === "MacroDeclaration" &&
                typeof node._featherMacroText === "string";
            const sanitizedMacroHasExplicitBlankLine =
                isSanitizedMacro &&
                macroTextHasExplicitTrailingBlankLine(node._featherMacroText);

            const isMacroLikeNode = isMacroLikeStatement(node);
            const isDefineMacroReplacement =
                getNormalizedDefineReplacementDirective(node) === "#macro";
            const shouldForceMacroPadding =
                isMacroLikeNode &&
                !isDefineMacroReplacement &&
                !nextNodeIsMacro &&
                !nextLineEmpty &&
                !shouldSuppressExtraEmptyLine &&
                !sanitizedMacroHasExplicitBlankLine;

            if (shouldForceMacroPadding) {
                parts.push(hardline);
                previousNodeHadNewlineAddedAfter = true;
            } else if (
                forceFollowingEmptyLine &&
                !nextLineEmpty &&
                !shouldSuppressExtraEmptyLine &&
                !sanitizedMacroHasExplicitBlankLine
            ) {
                parts.push(hardline);
                previousNodeHadNewlineAddedAfter = true;
            } else if (currentNodeRequiresNewline && !nextLineEmpty) {
                parts.push(hardline);
                previousNodeHadNewlineAddedAfter = true;
            } else if (
                nextLineEmpty &&
                !nextHasSyntheticDoc &&
                !shouldSuppressExtraEmptyLine &&
                !sanitizedMacroHasExplicitBlankLine
            ) {
                parts.push(hardline);
            }
        } else if (isTopLevel) {
            parts.push(hardline);
        } else {
            const parentNode = childPath.parent;
            const trailingProbeIndex =
                node?.type === "DefineStatement" ||
                node?.type === "MacroDeclaration"
                    ? nodeEndIndex
                    : nodeEndIndex + 1;
            const enforceTrailingPadding =
                shouldAddNewlinesAroundStatement(node);
            const blockParent =
                typeof childPath.getParentNode === "function"
                    ? childPath.getParentNode()
                    : childPath.parent;
            const constructorAncestor =
                typeof childPath.getParentNode === "function"
                    ? childPath.getParentNode(1)
                    : (blockParent?.parent ?? null);
            const isConstructorBlock =
                blockParent?.type === "BlockStatement" &&
                constructorAncestor?.type === "ConstructorDeclaration";
            const shouldPreserveConstructorStaticPadding =
                isStaticDeclaration &&
                hasFunctionInitializer &&
                isConstructorBlock;
            let shouldPreserveTrailingBlankLine = false;
            const hasAttachedDocComment =
                node?.[DOC_COMMENT_OUTPUT_FLAG] === true ||
                (Array.isArray(node?.docComments) &&
                    node.docComments.length > 0) ||
                Boolean(syntheticDocComment);
            const requiresTrailingPadding =
                enforceTrailingPadding &&
                parentNode?.type === "BlockStatement" &&
                !suppressFollowingEmptyLine;

            if (
                parentNode?.type === "BlockStatement" &&
                !suppressFollowingEmptyLine
            ) {
                const originalText =
                    typeof options.originalText === "string"
                        ? options.originalText
                        : null;
                const hasExplicitTrailingBlankLine =
                    originalText !== null &&
                    isNextLineEmpty(originalText, trailingProbeIndex);

                if (enforceTrailingPadding) {
                    // Large statements such as nested function declarations and
                    // constructor bodies should remain visually separated from
                    // the closing brace even when the original source omitted
                    // the blank line. Relying solely on the input text caused
                    // regressions where the formatter collapsed this padding
                    // altogether. When spacing is mandated by the node type,
                    // always request a trailing hardline so the doc output
                    // restores the expected empty line.
                    shouldPreserveTrailingBlankLine = true;
                } else if (
                    shouldPreserveConstructorStaticPadding &&
                    hasExplicitTrailingBlankLine
                ) {
                    shouldPreserveTrailingBlankLine = true;
                } else if (hasExplicitTrailingBlankLine && originalText) {
                    const textLength = originalText.length;
                    let scanIndex = trailingProbeIndex;
                    let nextCharacter = null;

                    while (scanIndex < textLength) {
                        nextCharacter = getNextNonWhitespaceCharacter(
                            originalText,
                            scanIndex
                        );

                        if (nextCharacter === ";") {
                            if (hasFunctionInitializer) {
                                break;
                            }

                            const semicolonIndex = originalText.indexOf(
                                ";",
                                scanIndex
                            );
                            if (semicolonIndex === -1) {
                                nextCharacter = null;
                                break;
                            }
                            scanIndex = semicolonIndex + 1;
                            continue;
                        }

                        break;
                    }

                    shouldPreserveTrailingBlankLine = nextCharacter
                        ? nextCharacter !== "}"
                        : false;
                }
            }

            if (
                !shouldPreserveTrailingBlankLine &&
                !suppressFollowingEmptyLine
            ) {
                if (
                    shouldForceTrailingBlankLineForNestedFunction(
                        node,
                        parentNode,
                        containerNode
                    )
                ) {
                    shouldPreserveTrailingBlankLine = true;
                } else if (
                    hasAttachedDocComment &&
                    blockParent?.type === "BlockStatement"
                ) {
                    const isFunctionLikeDeclaration =
                        node?.type === "FunctionDeclaration" ||
                        node?.type === "ConstructorDeclaration";

                    if (isFunctionLikeDeclaration) {
                        shouldPreserveTrailingBlankLine = true;
                    }
                }
            }

            const shouldForceConstructorNestedFunctionPadding =
                isConstructorBlock &&
                node?.type === "FunctionDeclaration" &&
                !suppressFollowingEmptyLine &&
                !shouldPreserveTrailingBlankLine;
            if (shouldPreserveTrailingBlankLine) {
                parts.push(hardline);
                previousNodeHadNewlineAddedAfter = true;
            } else if (shouldForceConstructorNestedFunctionPadding) {
                parts.push(hardline);
                previousNodeHadNewlineAddedAfter = true;
            } else if (requiresTrailingPadding) {
                parts.push(hardline);
                previousNodeHadNewlineAddedAfter = true;
            }
        }

        return parts;
    }, childrenAttribute);
}

export function applyAssignmentAlignment(
    statements,
    options,
    path = null,
    childrenAttribute = null
) {
    const minGroupSize = getAssignmentAlignmentMinimum(options);
    /** @type {Array<{ node: any, nameLength: number }>} */
    const currentGroup = [];
    // Tracking the longest identifier as we build the group avoids mapping over
    // the nodes and spreading into Math.max during every flush. This helper
    // runs in tight printer loops, so staying allocation-free keeps it cheap.
    let currentGroupMaxLength = 0;
    let currentGroupHasAlias = false;

    const { originalText, locStart, locEnd } =
        resolvePrinterSourceMetadata(options);

    const insideFunctionBody = isPathInsideFunctionBody(
        path,
        childrenAttribute
    );
    const functionNode = insideFunctionBody
        ? findEnclosingFunctionNode(path)
        : null;
    const functionParameterNames = insideFunctionBody
        ? getFunctionParameterNameSetFromPath(path)
        : null;

    let previousEntry = null;

    const resetGroup = () => {
        currentGroup.length = 0;
        currentGroupMaxLength = 0;
        currentGroupHasAlias = false;
    };

    const flushGroup = () => {
        if (currentGroup.length === 0) {
            resetGroup();
            return;
        }

        const groupEntries = [...currentGroup];
        const meetsAlignmentThreshold =
            minGroupSize > 0 && groupEntries.length >= minGroupSize;
        const canAlign = meetsAlignmentThreshold && currentGroupHasAlias;

        if (!canAlign) {
            for (const { node } of groupEntries) {
                node._alignAssignmentPadding = 0;
            }
            resetGroup();
            return;
        }

        const targetLength = currentGroupMaxLength;
        for (const { node, nameLength } of groupEntries) {
            node._alignAssignmentPadding = targetLength - nameLength;
        }

        resetGroup();
    };

    for (const statement of statements) {
        const entry = getSimpleAssignmentLikeEntry(
            statement,
            insideFunctionBody,
            functionParameterNames,
            functionNode,
            options
        );

        if (entry) {
            if (
                previousEntry &&
                previousEntry.skipBreakAfter !== true &&
                shouldBreakAssignmentAlignment(
                    previousEntry.locationNode,
                    entry.locationNode,
                    originalText,
                    locStart,
                    locEnd
                )
            ) {
                flushGroup();
                previousEntry = null;
            }

            currentGroup.push({
                node: entry.paddingTarget,
                nameLength: entry.nameLength
            });
            if (entry.nameLength > currentGroupMaxLength) {
                currentGroupMaxLength = entry.nameLength;
            }
            if (entry.enablesAlignment) {
                currentGroupHasAlias = true;
            }

            previousEntry = entry;
        } else {
            flushGroup();
            previousEntry = null;
        }
    }

    flushGroup();
}

function shouldForceTrailingBlankLineForNestedFunction(
    node,
    blockNode,
    containerNode
) {
    if (!isFunctionLikeDeclaration(node)) {
        return false;
    }

    if (!blockNode || blockNode.type !== "BlockStatement") {
        return false;
    }

    return isFunctionLikeDeclaration(containerNode);
}

function isFunctionLikeDeclaration(node) {
    const nodeType = node?.type;
    return (
        nodeType === "FunctionDeclaration" ||
        nodeType === "ConstructorDeclaration" ||
        nodeType === "FunctionExpression"
    );
}

function isPathInsideFunctionBody(path, childrenAttribute) {
    if (
        !path ||
        typeof path.getParentNode !== "function" ||
        typeof path.getValue !== "function"
    ) {
        return false;
    }

    if (childrenAttribute !== "body") {
        return false;
    }

    const containerNode = path.getValue();
    if (!containerNode || containerNode.type !== "BlockStatement") {
        return false;
    }

    const parentNode = path.getParentNode();
    if (!parentNode || typeof parentNode.type !== "string") {
        return false;
    }

    if (
        parentNode.type === "FunctionDeclaration" ||
        parentNode.type === "FunctionExpression" ||
        parentNode.type === "ConstructorDeclaration"
    ) {
        return parentNode.body === containerNode;
    }

    return false;
}

function getSimpleAssignmentLikeEntry(
    statement,
    insideFunctionBody,
    functionParameterNames,
    functionNode,
    options
) {
    if (isSimpleAssignment(statement)) {
        const identifier = statement.left;
        if (!identifier || typeof identifier.name !== "string") {
            return null;
        }

        return {
            locationNode: statement,
            paddingTarget: statement,
            nameLength: identifier.name.length,
            enablesAlignment: true
        };
    }

    if (!insideFunctionBody) {
        return null;
    }

    const declarator = getSingleVariableDeclarator(statement);
    if (!declarator) {
        return null;
    }

    const id = declarator.id;
    if (!id || id.type !== "Identifier" || typeof id.name !== "string") {
        return null;
    }

    const init = declarator.init;
    if (!init) {
        return null;
    }

    let enablesAlignment = false;
    if (init.type === "Identifier" && typeof init.name === "string") {
        const argumentIndex = getArgumentIndexFromIdentifier(init.name);
        const hasNamedParameters =
            functionParameterNames && functionParameterNames.size > 0;

        if (argumentIndex !== null) {
            if (!options?.applyFeatherFixes || hasNamedParameters) {
                enablesAlignment = true;
            }
        } else if (functionParameterNames?.has(init.name)) {
            enablesAlignment = true;
        }
    }

    const skipBreakAfter = shouldOmitParameterAlias(
        declarator,
        functionNode,
        options
    );

    return {
        locationNode: statement,
        paddingTarget: declarator,
        nameLength: id.name.length,
        enablesAlignment,
        skipBreakAfter
    };
}

function getFunctionParameterNameSetFromPath(path) {
    if (!path || typeof path.getParentNode !== "function") {
        return null;
    }

    const functionNode = path.getParentNode();
    if (!functionNode || typeof functionNode !== "object") {
        return null;
    }

    const params = getFunctionParams(functionNode);
    if (params.length === 0) {
        return null;
    }

    const names = new Set();
    for (const param of params) {
        const identifier = getIdentifierFromParameterNode(param);
        if (
            identifier &&
            typeof identifier.name === "string" &&
            identifier.name.length > 0
        ) {
            names.add(identifier.name);
        }
    }

    return names.size > 0 ? names : null;
}

function getAssignmentAlignmentMinimum(options) {
    return coercePositiveIntegerOption(
        options?.alignAssignmentsMinGroupSize,
        3,
        {
            zeroReplacement: 0
        }
    );
}

function isSimpleAssignment(node) {
    return !!(
        node &&
        node.type === "AssignmentExpression" &&
        node.operator === "=" &&
        node.left &&
        node.left.type === "Identifier" &&
        typeof node.left.name === "string"
    );
}

function shouldBreakAssignmentAlignment(
    previousNode,
    nextNode,
    originalText,
    locStart,
    locEnd
) {
    if (
        !originalText ||
        typeof originalText !== "string" ||
        !previousNode ||
        !nextNode
    ) {
        return false;
    }

    const previousEnd = getNodeEndIndexForAlignment(previousNode, locEnd);
    const nextStart = getNodeStartIndexForAlignment(nextNode, locStart);

    if (
        !Number.isInteger(previousEnd) ||
        !Number.isInteger(nextStart) ||
        previousEnd >= nextStart
    ) {
        return false;
    }

    const between = originalText.slice(previousEnd + 1, nextStart);

    if (/\n[^\S\r\n]*\n/.test(between)) {
        return true;
    }

    return /(?:^|\n)\s*(?:\/\/|\/\*)/.test(between);
}

function getNodeStartIndexForAlignment(node, locStart) {
    if (!node) {
        return null;
    }

    if (typeof locStart === "function") {
        const resolved = locStart(node);
        if (Number.isInteger(resolved)) {
            return resolved;
        }
    }

    const startProp = node.start;
    if (typeof startProp === "number") {
        return startProp;
    }

    if (startProp && typeof startProp.index === "number") {
        return startProp.index;
    }

    return null;
}

function getNodeEndIndexForAlignment(node, locEnd) {
    if (!node) {
        return null;
    }

    if (typeof locEnd === "function") {
        const resolved = locEnd(node);
        if (Number.isInteger(resolved)) {
            return resolved - 1;
        }
    }

    const endProp = node.end;
    if (typeof endProp === "number") {
        return endProp;
    }

    if (endProp && typeof endProp.index === "number") {
        return endProp.index;
    }

    const startIndex = getNodeStartIndexForAlignment(node, null);
    return Number.isInteger(startIndex) ? startIndex : null;
}

function collectSyntheticDocCommentLines(node, options) {
    const rawComments = getCommentArray(node);
    if (!Array.isArray(rawComments) || rawComments.length === 0) {
        return {
            existingDocLines: [],
            remainingComments: Array.isArray(rawComments) ? rawComments : []
        };
    }

    const lineCommentOptions = resolveLineCommentOptions(options);
    const existingDocLines = [];
    const remainingComments = [];

    for (const comment of rawComments) {
        if (!comment || comment.type !== "CommentLine") {
            remainingComments.push(comment);
            continue;
        }

        const formatted = formatLineComment(comment, lineCommentOptions);
        if (
            typeof formatted !== "string" ||
            !formatted.trim().startsWith("///")
        ) {
            remainingComments.push(comment);
            continue;
        }

        comment.printed = true;
        existingDocLines.push(formatted);
    }

    return { existingDocLines, remainingComments };
}

function buildSyntheticDocComment(
    functionNode,
    existingDocLines,
    options,
    overrides = {}
) {
    const hasExistingDocLines = existingDocLines.length > 0;

    const syntheticLines = hasExistingDocLines
        ? mergeSyntheticDocComments(
              functionNode,
              existingDocLines,
              options,
              overrides
          )
        : reorderDescriptionLinesAfterFunction(
              computeSyntheticFunctionDocLines(
                  functionNode,
                  [],
                  options,
                  overrides
              )
          );

    if (syntheticLines.length === 0) {
        return null;
    }

    return {
        doc: concat([hardline, join(hardline, syntheticLines)]),
        hasExistingDocLines
    };
}

function suppressConstructorAssignmentPadding(functionNode) {
    if (
        !functionNode ||
        functionNode.type !== "ConstructorDeclaration" ||
        functionNode.body?.type !== "BlockStatement" ||
        !Array.isArray(functionNode.body.body)
    ) {
        return;
    }

    for (const statement of functionNode.body.body) {
        if (!statement) {
            continue;
        }

        if (hasComment(statement)) {
            break;
        }

        if (statement.type === "AssignmentExpression") {
            statement._gmlSuppressFollowingEmptyLine = true;
            continue;
        }

        if (
            statement.type === "VariableDeclaration" &&
            statement.kind !== "static"
        ) {
            statement._gmlSuppressFollowingEmptyLine = true;
            continue;
        }

        break;
    }
}

function getSyntheticDocCommentForStaticVariable(node, options) {
    if (
        !node ||
        node.type !== "VariableDeclaration" ||
        node.kind !== "static"
    ) {
        return null;
    }

    const declarator = getSingleVariableDeclarator(node);
    if (!declarator || declarator.id?.type !== "Identifier") {
        return null;
    }

    if (declarator.init?.type !== "FunctionDeclaration") {
        return null;
    }

    const hasFunctionDoc =
        declarator.init.docComments && declarator.init.docComments.length > 0;

    const { existingDocLines, remainingComments } =
        collectSyntheticDocCommentLines(node, options);

    if (existingDocLines.length > 0) {
        node.comments = remainingComments;
    }

    if (hasFunctionDoc && existingDocLines.length === 0) {
        return null;
    }

    const name = declarator.id.name;
    const functionNode = declarator.init;
    const syntheticOverrides = { nameOverride: name };
    if (node._overridesStaticFunction === true) {
        syntheticOverrides.includeOverrideTag = true;
    }

    return buildSyntheticDocComment(
        functionNode,
        existingDocLines,
        options,
        syntheticOverrides
    );
}

function getSyntheticDocCommentForFunctionAssignment(node, options) {
    if (!node) {
        return null;
    }

    let assignment = null;
    let commentTarget = node;

    if (node.type === "ExpressionStatement") {
        assignment = node.expression;
    } else if (node.type === "AssignmentExpression") {
        assignment = node;
    } else {
        return null;
    }

    if (
        !assignment ||
        assignment.type !== "AssignmentExpression" ||
        assignment.operator !== "=" ||
        assignment.left?.type !== "Identifier" ||
        typeof assignment.left.name !== "string"
    ) {
        return null;
    }

    const functionNode = assignment.right;
    if (
        !functionNode ||
        (functionNode.type !== "FunctionDeclaration" &&
            functionNode.type !== "FunctionExpression" &&
            functionNode.type !== "ConstructorDeclaration")
    ) {
        return null;
    }

    suppressConstructorAssignmentPadding(functionNode);

    const hasFunctionDoc =
        Array.isArray(functionNode.docComments) &&
        functionNode.docComments.length > 0;

    const { existingDocLines, remainingComments } =
        collectSyntheticDocCommentLines(commentTarget, options);

    if (existingDocLines.length > 0) {
        commentTarget.comments = remainingComments;
    }

    if (hasFunctionDoc && existingDocLines.length === 0) {
        return null;
    }

    const syntheticOverrides = { nameOverride: assignment.left.name };

    return buildSyntheticDocComment(
        functionNode,
        existingDocLines,
        options,
        syntheticOverrides
    );
}

function isSkippableSemicolonWhitespace(charCode) {
    // Mirrors the range of characters matched by /\s/ without incurring the
    // per-iteration RegExp machinery cost.
    switch (charCode) {
        case 9: // tab
        case 10: // line feed
        case 11: // vertical tab
        case 12: // form feed
        case 13: // carriage return
        case 32: // space
        case 160:
        case 0x20_28:
        case 0x20_29: {
            // GameMaker occasionally serializes or copy/pastes scripts with the
            // U+00A0 non-breaking space and the U+2028/U+2029 line and
            // paragraph separators—for example when creators paste snippets
            // from the IDE or import JSON exports. Treat them as
            // semicolon-trimmable whitespace so the cleanup logic keeps
            // matching GameMaker's parser expectations instead of leaving stray
            // semicolons behind.
            return true;
        }
        default: {
            return false;
        }
    }
}

function isInlineWhitespace(charCode) {
    // These checks are intentionally tiny and branchless to avoid regex
    // allocations when scanning large source files inside tight loops.
    return (
        charCode === 9 || // tab
        charCode === 10 || // line feed
        charCode === 13 || // carriage return
        charCode === 32 // space
    );
}

function hasCommentImmediatelyBefore(text, index) {
    if (!text || typeof index !== "number") {
        return false;
    }

    let cursor = index - 1;

    while (cursor >= 0 && isInlineWhitespace(text.charCodeAt(cursor))) {
        cursor--;
    }

    if (cursor < 0) {
        return false;
    }

    const lineEndExclusive = cursor + 1;
    while (cursor >= 0) {
        const charCode = text.charCodeAt(cursor);
        if (charCode === 10 || charCode === 13) {
            break;
        }
        cursor--;
    }

    let lineStart = cursor + 1;
    while (
        lineStart < lineEndExclusive &&
        isInlineWhitespace(text.charCodeAt(lineStart))
    ) {
        lineStart++;
    }

    if (lineStart >= lineEndExclusive) {
        return false;
    }

    let lineEnd = lineEndExclusive - 1;
    while (
        lineEnd >= lineStart &&
        isInlineWhitespace(text.charCodeAt(lineEnd))
    ) {
        lineEnd--;
    }

    if (lineEnd < lineStart) {
        return false;
    }

    const first = text.charCodeAt(lineStart);
    const second =
        lineStart + 1 <= lineEnd ? text.charCodeAt(lineStart + 1) : -1;

    if (first === 47) {
        // '/'
        if (second === 47 || second === 42) {
            // '/', '*'
            return true;
        }
    } else if (first === 42) {
        // '*'
        return true;
    }

    return (
        lineEnd >= lineStart + 1 &&
        text.charCodeAt(lineEnd) === 47 &&
        text.charCodeAt(lineEnd - 1) === 42
    );
}

function reorderDescriptionLinesAfterFunction(docLines) {
    const normalizedDocLines = toMutableArray(docLines);

    if (normalizedDocLines.length === 0) {
        return normalizedDocLines;
    }

    const descriptionIndices = [];
    for (const [index, line] of normalizedDocLines.entries()) {
        if (
            typeof line === "string" &&
            /^\/\/\/\s*@description\b/i.test(line.trim())
        ) {
            descriptionIndices.push(index);
        }
    }

    if (descriptionIndices.length === 0) {
        return normalizedDocLines;
    }

    const functionIndex = normalizedDocLines.findIndex(
        (line) =>
            typeof line === "string" &&
            /^\/\/\/\s*@function\b/i.test(line.trim())
    );

    if (functionIndex === -1) {
        return normalizedDocLines;
    }

    const earliestDescriptionIndex = Math.min(...descriptionIndices);
    if (earliestDescriptionIndex > functionIndex) {
        return normalizedDocLines;
    }

    const descriptionLines = descriptionIndices
        .map((index) => normalizedDocLines[index])
        .filter((line) => {
            const metadata = parseDocCommentMetadata(line);
            const descriptionText =
                typeof metadata?.name === "string" ? metadata.name.trim() : "";

            return descriptionText.length > 0;
        });

    if (descriptionLines.length === 0) {
        return normalizedDocLines.filter(
            (_, index) => !descriptionIndices.includes(index)
        );
    }

    const remainingLines = normalizedDocLines.filter(
        (_, index) => !descriptionIndices.includes(index)
    );

    let lastFunctionIndex = -1;
    for (let index = remainingLines.length - 1; index >= 0; index -= 1) {
        const line = remainingLines[index];
        if (
            typeof line === "string" &&
            /^\/\/\/\s*@function\b/i.test(line.trim())
        ) {
            lastFunctionIndex = index;
            break;
        }
    }

    if (lastFunctionIndex === -1) {
        return [...remainingLines, ...descriptionLines];
    }

    let returnsInsertionIndex = remainingLines.length;
    for (
        let index = lastFunctionIndex + 1;
        index < remainingLines.length;
        index += 1
    ) {
        const line = remainingLines[index];
        if (
            typeof line === "string" &&
            /^\/\/\/\s*@returns\b/i.test(line.trim())
        ) {
            returnsInsertionIndex = index;
            break;
        }
    }

    return [
        ...remainingLines.slice(0, returnsInsertionIndex),
        ...descriptionLines,
        ...remainingLines.slice(returnsInsertionIndex)
    ];
}

function mergeSyntheticDocComments(
    node,
    existingDocLines,
    options,
    overrides = {}
) {
    const normalizedExistingLines = reorderDescriptionLinesAfterFunction(
        toMutableArray(existingDocLines)
    );

    const syntheticLines = reorderDescriptionLinesAfterFunction(
        computeSyntheticFunctionDocLines(
            node,
            existingDocLines,
            options,
            overrides
        )
    );

    if (syntheticLines.length === 0) {
        return normalizedExistingLines;
    }

    if (normalizedExistingLines.length === 0) {
        return syntheticLines;
    }

    const docTagMatches = (line, pattern) => {
        const trimmed = toTrimmedString(line);
        if (trimmed.length === 0) {
            return false;
        }

        if (pattern.global || pattern.sticky) {
            pattern.lastIndex = 0;
        }

        return pattern.test(trimmed);
    };

    const isFunctionLine = (line) =>
        docTagMatches(line, /^\/\/\/\s*@function\b/i);
    const isOverrideLine = (line) =>
        docTagMatches(line, /^\/\/\/\s*@override\b/i);
    const isParamLine = (line) => docTagMatches(line, /^\/\/\/\s*@param\b/i);

    const isDescriptionLine = (line) =>
        docTagMatches(line, /^\/\/\/\s*@description\b/i);

    const functionLines = syntheticLines.filter(isFunctionLine);
    const syntheticFunctionMetadata = functionLines
        .map((line) => parseDocCommentMetadata(line))
        .find(
            (meta) => meta?.tag === "function" && typeof meta.name === "string"
        );
    const syntheticFunctionName =
        typeof syntheticFunctionMetadata?.name === "string"
            ? syntheticFunctionMetadata.name.trim()
            : null;
    let otherLines = syntheticLines.filter((line) => !isFunctionLine(line));
    const overrideLines = otherLines.filter(isOverrideLine);
    otherLines = otherLines.filter((line) => !isOverrideLine(line));
    let returnsLines = [];

    // Cache canonical names so we only parse each doc comment line at most once.
    const paramCanonicalNameCache = new Map();
    const getParamCanonicalName = (line, metadata) => {
        if (typeof line !== "string") {
            return null;
        }

        if (paramCanonicalNameCache.has(line)) {
            return paramCanonicalNameCache.get(line);
        }

        const docMetadata =
            metadata === undefined ? parseDocCommentMetadata(line) : metadata;
        const canonical =
            docMetadata?.tag === "param"
                ? getCanonicalParamNameFromText(docMetadata.name)
                : null;

        paramCanonicalNameCache.set(line, canonical);
        return canonical;
    };

    let mergedLines = [...normalizedExistingLines];
    let removedAnyLine = false;

    if (functionLines.length > 0) {
        const existingFunctionIndices = mergedLines
            .map((line, index) => (isFunctionLine(line) ? index : -1))
            .filter((index) => index !== -1);

        if (existingFunctionIndices.length > 0) {
            const [firstIndex, ...duplicateIndices] = existingFunctionIndices;
            mergedLines = [...mergedLines];

            for (let i = duplicateIndices.length - 1; i >= 0; i--) {
                mergedLines.splice(duplicateIndices[i], 1);
                removedAnyLine = true;
            }

            mergedLines.splice(firstIndex, 1, ...functionLines);
            removedAnyLine = true;
        } else {
            const firstParamIndex = mergedLines.findIndex(isParamLine);

            const insertionIndex =
                firstParamIndex === -1 ? mergedLines.length : firstParamIndex;
            const precedingLine =
                insertionIndex > 0 ? mergedLines[insertionIndex - 1] : null;

            const needsSeparatorBeforeFunction =
                typeof precedingLine === "string" &&
                precedingLine.trim() !== "" &&
                !isFunctionLine(precedingLine);

            if (needsSeparatorBeforeFunction) {
                mergedLines = [
                    ...mergedLines.slice(0, insertionIndex),
                    "",
                    ...mergedLines.slice(insertionIndex)
                ];
            }

            const insertAt = needsSeparatorBeforeFunction
                ? insertionIndex + 1
                : insertionIndex;

            mergedLines = [
                ...mergedLines.slice(0, insertAt),
                ...functionLines,
                ...mergedLines.slice(insertAt)
            ];
            removedAnyLine = true;
        }
    }

    if (overrideLines.length > 0) {
        const existingOverrideIndices = mergedLines
            .map((line, index) => (isOverrideLine(line) ? index : -1))
            .filter((index) => index !== -1);

        if (existingOverrideIndices.length > 0) {
            const [firstOverrideIndex, ...duplicateOverrideIndices] =
                existingOverrideIndices;
            mergedLines = [...mergedLines];

            for (let i = duplicateOverrideIndices.length - 1; i >= 0; i -= 1) {
                mergedLines.splice(duplicateOverrideIndices[i], 1);
                removedAnyLine = true;
            }

            mergedLines.splice(firstOverrideIndex, 1, ...overrideLines);
            removedAnyLine = true;
        } else {
            const firstFunctionIndex = mergedLines.findIndex(isFunctionLine);
            const insertionIndex =
                firstFunctionIndex === -1 ? 0 : firstFunctionIndex;

            mergedLines = [
                ...mergedLines.slice(0, insertionIndex),
                ...overrideLines,
                ...mergedLines.slice(insertionIndex)
            ];
            removedAnyLine = true;
        }
    }

    const paramLineIndices = new Map();
    for (const [index, line] of mergedLines.entries()) {
        if (!isParamLine(line)) {
            continue;
        }

        const canonical = getParamCanonicalName(line);
        if (canonical) {
            paramLineIndices.set(canonical, index);
        }
    }

    if (otherLines.length > 0) {
        const normalizedOtherLines = [];

        for (const line of otherLines) {
            const metadata = parseDocCommentMetadata(line);
            const canonical = getParamCanonicalName(line, metadata);

            if (
                canonical &&
                paramLineIndices.has(canonical) &&
                metadata?.name
            ) {
                const lineIndex = paramLineIndices.get(canonical);
                const existingLine = mergedLines[lineIndex];

                const updatedLine = updateParamLineWithDocName(
                    existingLine,
                    metadata.name
                );
                if (updatedLine !== existingLine) {
                    mergedLines[lineIndex] = updatedLine;
                    removedAnyLine = true;
                }
                continue;
            }

            normalizedOtherLines.push(line);
        }

        otherLines = normalizedOtherLines;
    }

    if (otherLines.length > 0) {
        const nonReturnLines = [];
        const extractedReturns = [];

        for (const line of otherLines) {
            const metadata = parseDocCommentMetadata(line);
            if (metadata?.tag === "returns") {
                extractedReturns.push(line);
                continue;
            }

            nonReturnLines.push(line);
        }

        if (extractedReturns.length > 0) {
            otherLines = nonReturnLines;
            returnsLines = extractedReturns;
        }
    }

    const syntheticParamNames = new Set(
        otherLines
            .map((line) => getParamCanonicalName(line))
            .filter(isNonEmptyString)
    );

    if (syntheticParamNames.size > 0) {
        const beforeLength = mergedLines.length;
        mergedLines = mergedLines.filter((line) => {
            if (!isParamLine(line)) {
                return true;
            }

            const canonical = getParamCanonicalName(line);
            if (!canonical) {
                return false;
            }

            return !syntheticParamNames.has(canonical);
        });
        if (mergedLines.length !== beforeLength) {
            removedAnyLine = true;
        }
    }

    const lastFunctionIndex = mergedLines.findLastIndex(isFunctionLine);
    let insertionIndex = lastFunctionIndex === -1 ? 0 : lastFunctionIndex + 1;

    if (lastFunctionIndex === -1) {
        while (
            insertionIndex < mergedLines.length &&
            typeof mergedLines[insertionIndex] === "string" &&
            mergedLines[insertionIndex].trim() === ""
        ) {
            insertionIndex += 1;
        }
    }

    while (
        insertionIndex < mergedLines.length &&
        typeof mergedLines[insertionIndex] === "string" &&
        isParamLine(mergedLines[insertionIndex])
    ) {
        insertionIndex += 1;
    }

    let result = [
        ...mergedLines.slice(0, insertionIndex),
        ...otherLines,
        ...mergedLines.slice(insertionIndex)
    ];

    if (returnsLines.length > 0) {
        let appendIndex = result.length;

        while (
            appendIndex > 0 &&
            typeof result[appendIndex - 1] === "string" &&
            result[appendIndex - 1].trim() === ""
        ) {
            appendIndex -= 1;
        }

        result = [
            ...result.slice(0, appendIndex),
            ...returnsLines,
            ...result.slice(appendIndex)
        ];
    }

    const paramDocsByCanonical = new Map();

    for (const line of result) {
        if (typeof line !== "string") {
            continue;
        }

        if (!isParamLine(line)) {
            continue;
        }

        const canonical = getParamCanonicalName(line);
        if (canonical) {
            paramDocsByCanonical.set(canonical, line);
        }
    }

    const implicitDocEntries = collectImplicitArgumentDocNames(node, options);
    const suppressedCanonicals = suppressedImplicitDocCanonicalByNode.get(node);

    if (suppressedCanonicals && suppressedCanonicals.size > 0) {
        for (const canonical of suppressedCanonicals) {
            paramDocsByCanonical.delete(canonical);
        }
    }

    if (implicitDocEntries.length > 0) {
        const canonicalNames = new Set();
        const fallbackCanonicalsToRemove = new Set();

        for (const entry of implicitDocEntries) {
            if (entry?.canonical) {
                canonicalNames.add(entry.canonical);
            }

            if (
                entry?.fallbackCanonical &&
                entry.fallbackCanonical !== entry.canonical &&
                entry.hasDirectReference !== true
            ) {
                fallbackCanonicalsToRemove.add(entry.fallbackCanonical);
            }
        }

        for (const fallbackCanonical of fallbackCanonicalsToRemove) {
            if (!canonicalNames.has(fallbackCanonical)) {
                paramDocsByCanonical.delete(fallbackCanonical);
            }
        }
    }

    let orderedParamDocs = [];
    if (Array.isArray(node.params)) {
        for (const param of node.params) {
            const paramInfo = getParameterDocInfo(param, node, options);
            const canonical = paramInfo?.name
                ? getCanonicalParamNameFromText(paramInfo.name)
                : null;
            if (canonical && paramDocsByCanonical.has(canonical)) {
                orderedParamDocs.push(paramDocsByCanonical.get(canonical));
                paramDocsByCanonical.delete(canonical);
            }
        }
    }

    if (orderedParamDocs.length === 0) {
        for (const entry of implicitDocEntries) {
            const canonical = entry?.canonical;
            if (canonical && paramDocsByCanonical.has(canonical)) {
                orderedParamDocs.push(paramDocsByCanonical.get(canonical));
                paramDocsByCanonical.delete(canonical);
            }
        }
    }

    for (const doc of paramDocsByCanonical.values()) {
        orderedParamDocs.push(doc);
    }

    if (orderedParamDocs.length > 0) {
        const docsByCanonical = new Map();
        for (const docLine of orderedParamDocs) {
            if (typeof docLine !== "string") {
                continue;
            }

            const canonical = getParamCanonicalName(docLine);
            if (canonical) {
                docsByCanonical.set(canonical, docLine);
            }
        }

        const preferredDocs = preferredParamDocNamesByNode.get(node);
        const implicitEntryByIndex = new Map();
        for (const entry of implicitDocEntries) {
            if (entry && Number.isInteger(entry.index)) {
                implicitEntryByIndex.set(entry.index, entry);
            }
        }
        const reordered = [];

        if (Array.isArray(node.params)) {
            for (const [index, param] of node.params.entries()) {
                const implicitEntry = implicitEntryByIndex.get(index);
                if (implicitEntry) {
                    const implicitCanonical =
                        implicitEntry.canonical ||
                        getCanonicalParamNameFromText(implicitEntry.name);
                    if (
                        implicitCanonical &&
                        docsByCanonical.has(implicitCanonical)
                    ) {
                        reordered.push(docsByCanonical.get(implicitCanonical));
                        docsByCanonical.delete(implicitCanonical);
                        continue;
                    }
                }

                const preferredName = preferredDocs?.get(index);
                if (preferredName) {
                    const preferredCanonical =
                        getCanonicalParamNameFromText(preferredName);
                    if (
                        preferredCanonical &&
                        docsByCanonical.has(preferredCanonical)
                    ) {
                        reordered.push(docsByCanonical.get(preferredCanonical));
                        docsByCanonical.delete(preferredCanonical);
                        continue;
                    }
                }

                const paramInfo = getParameterDocInfo(param, node, options);
                const paramCanonical = paramInfo?.name
                    ? getCanonicalParamNameFromText(paramInfo.name)
                    : null;
                if (paramCanonical && docsByCanonical.has(paramCanonical)) {
                    reordered.push(docsByCanonical.get(paramCanonical));
                    docsByCanonical.delete(paramCanonical);
                }
            }
        }

        for (const docLine of docsByCanonical.values()) {
            reordered.push(docLine);
        }

        orderedParamDocs = reordered;
    }

    const finalDocs = [];
    let insertedParams = false;

    for (const line of result) {
        if (isParamLine(line)) {
            if (!insertedParams && orderedParamDocs.length > 0) {
                finalDocs.push(...orderedParamDocs);
                insertedParams = true;
            }
            continue;
        }

        finalDocs.push(line);
    }

    if (!insertedParams && orderedParamDocs.length > 0) {
        finalDocs.push(...orderedParamDocs);
    }

    let reorderedDocs = finalDocs;

    const descriptionStartIndex = reorderedDocs.findIndex(isDescriptionLine);
    if (descriptionStartIndex !== -1) {
        let descriptionEndIndex = descriptionStartIndex + 1;

        while (
            descriptionEndIndex < reorderedDocs.length &&
            typeof reorderedDocs[descriptionEndIndex] === "string" &&
            reorderedDocs[descriptionEndIndex].startsWith("///") &&
            !parseDocCommentMetadata(reorderedDocs[descriptionEndIndex])
        ) {
            descriptionEndIndex += 1;
        }

        const descriptionBlock = reorderedDocs.slice(
            descriptionStartIndex,
            descriptionEndIndex
        );
        const docsWithoutDescription = [
            ...reorderedDocs.slice(0, descriptionStartIndex),
            ...reorderedDocs.slice(descriptionEndIndex)
        ];

        let shouldOmitDescriptionBlock = false;
        if (descriptionBlock.length === 1) {
            const descriptionMetadata = parseDocCommentMetadata(
                descriptionBlock[0]
            );
            const descriptionText =
                typeof descriptionMetadata?.name === "string"
                    ? descriptionMetadata.name.trim()
                    : "";

            // Omit empty description blocks
            if (descriptionText.length === 0) {
                shouldOmitDescriptionBlock = true;
            } else if (
                syntheticFunctionName &&
                descriptionText.startsWith(syntheticFunctionName)
            ) {
                // Omit alias-style descriptions like "functionName()"
                const remainder = descriptionText.slice(
                    syntheticFunctionName.length
                );
                const trimmedRemainder = remainder.trim();
                if (
                    trimmedRemainder.startsWith("(") &&
                    trimmedRemainder.endsWith(")")
                ) {
                    shouldOmitDescriptionBlock = true;
                }
            }
        }

        if (shouldOmitDescriptionBlock) {
            reorderedDocs = docsWithoutDescription;
        } else {
            let lastParamIndex = -1;
            for (const [index, element] of docsWithoutDescription.entries()) {
                if (isParamLine(element)) {
                    lastParamIndex = index;
                }
            }

            const insertionAfterParams =
                lastParamIndex === -1
                    ? docsWithoutDescription.length
                    : lastParamIndex + 1;

            reorderedDocs = [
                ...docsWithoutDescription.slice(0, insertionAfterParams),
                ...descriptionBlock,
                ...docsWithoutDescription.slice(insertionAfterParams)
            ];
        }
    }

    reorderedDocs = reorderDescriptionLinesAfterFunction(reorderedDocs);

    if (suppressedCanonicals && suppressedCanonicals.size > 0) {
        reorderedDocs = reorderedDocs.filter((line) => {
            if (!isParamLine(line)) {
                return true;
            }

            const canonical = getParamCanonicalName(line);
            return !canonical || !suppressedCanonicals.has(canonical);
        });
    }

    reorderedDocs = reorderedDocs.map((line) => {
        if (!isParamLine(line)) {
            return line;
        }

        const match = line.match(
            /^(\/\/\/\s*@param\s*)(\{[^}]*\}\s*)?(\s*\S+)(.*)$/i
        );
        if (!match) {
            return normalizeDocCommentTypeAnnotations(line);
        }

        const [, prefix, rawTypeSection = "", rawName = "", remainder = ""] =
            match;
        const normalizedPrefix = `${prefix.replace(/\s*$/, "")} `;
        let normalizedTypeSection = rawTypeSection.trim();
        if (
            normalizedTypeSection.startsWith("{") &&
            normalizedTypeSection.endsWith("}")
        ) {
            const innerType = normalizedTypeSection.slice(1, -1);
            const normalizedInner = innerType.replaceAll("|", ",");
            normalizedTypeSection = `{${normalizedInner}}`;
        }
        const typePart =
            normalizedTypeSection.length > 0 ? `${normalizedTypeSection} ` : "";
        const normalizedName = rawName.trim();
        const remainderText = remainder.trim();
        const hasDescription = remainderText.length > 0;
        let descriptionPart = "";

        if (hasDescription) {
            const hyphenMatch = remainder.match(/^(\s*-\s*)(.*)$/);
            let normalizedDescription = "";
            let hyphenSpacing = " - ";

            if (hyphenMatch) {
                const [, rawHyphenSpacing = "", rawDescription = ""] =
                    hyphenMatch;
                normalizedDescription = rawDescription.trim();

                const trailingSpaceMatch = rawHyphenSpacing.match(/-(\s*)$/);
                if (trailingSpaceMatch) {
                    const originalSpaceCount = trailingSpaceMatch[1].length;
                    const preservedSpaceCount = Math.max(
                        1,
                        Math.min(originalSpaceCount, 2)
                    );
                    hyphenSpacing = ` - ${" ".repeat(preservedSpaceCount - 1)}`;
                }
            } else {
                normalizedDescription = remainderText.replace(/^[-\s]+/, "");
            }

            if (normalizedDescription.length > 0) {
                descriptionPart = `${hyphenSpacing}${normalizedDescription}`;
            }
        }

        const updatedLine = `${normalizedPrefix}${typePart}${normalizedName}${descriptionPart}`;
        return normalizeDocCommentTypeAnnotations(updatedLine);
    });

    const wrappedDocs = [];
    const normalizedPrintWidth = coercePositiveIntegerOption(
        options?.printWidth,
        120
    );
    const wrapWidth = Math.min(normalizedPrintWidth, 100);

    const wrapSegments = (text, firstAvailable, continuationAvailable) => {
        if (firstAvailable <= 0) {
            return [text];
        }

        const words = text.split(/\s+/).filter((word) => word.length > 0);
        if (words.length === 0) {
            return [];
        }

        const segments = [];
        let current = words[0];
        let currentAvailable = firstAvailable;

        for (let index = 1; index < words.length; index += 1) {
            const word = words[index];

            const endsSentence = /[.!?]["')\]]?$/.test(current);
            const startsSentence = /^[A-Z]/.test(word);
            if (
                endsSentence &&
                startsSentence &&
                currentAvailable >= 60 &&
                current.length >=
                    Math.max(Math.floor(currentAvailable * 0.6), 24)
            ) {
                segments.push(current);
                current = word;
                currentAvailable = continuationAvailable;
                continue;
            }

            if (current.length + 1 + word.length > currentAvailable) {
                segments.push(current);
                current = word;
                currentAvailable = continuationAvailable;
            } else {
                current += ` ${word}`;
            }
        }

        segments.push(current);

        const lastIndex = segments.length - 1;
        if (lastIndex >= 2) {
            // `Array#at` handles negative indices but introduces an extra bounds
            // check on every call. This helper runs for every doc comment we
            // wrap, so prefer direct index math to keep the hot path lean.
            const lastSegment = segments[lastIndex];
            const isSingleWord =
                typeof lastSegment === "string" && !/\s/.test(lastSegment);

            if (isSingleWord) {
                const maxSingleWordLength = Math.max(
                    Math.min(continuationAvailable / 2, 16),
                    8
                );

                if (lastSegment.length <= maxSingleWordLength) {
                    const penultimateIndex = lastIndex - 1;
                    const mergedSegment =
                        segments[penultimateIndex] + ` ${lastSegment}`;

                    segments[penultimateIndex] = mergedSegment;
                    segments.pop();
                }
            }
        }

        return segments;
    };

    for (let index = 0; index < reorderedDocs.length; index += 1) {
        const line = reorderedDocs[index];
        if (isDescriptionLine(line)) {
            const blockLines = [line];
            let lookahead = index + 1;

            while (lookahead < reorderedDocs.length) {
                const nextLine = reorderedDocs[lookahead];
                if (
                    typeof nextLine === "string" &&
                    nextLine.startsWith("///") &&
                    !parseDocCommentMetadata(nextLine)
                ) {
                    blockLines.push(nextLine);
                    lookahead += 1;
                    continue;
                }
                break;
            }

            index = lookahead - 1;

            const prefixMatch = line.match(/^(\/\/\/\s*@description\s+)/i);
            if (!prefixMatch) {
                wrappedDocs.push(...blockLines);
                continue;
            }

            const prefix = prefixMatch[1];
            const continuationPrefix =
                "/// " + " ".repeat(Math.max(prefix.length - 4, 0));
            const descriptionText = blockLines
                .map((docLine, blockIndex) => {
                    if (blockIndex === 0) {
                        return docLine.slice(prefix.length).trim();
                    }

                    return docLine.slice(continuationPrefix.length).trim();
                })
                .filter((segment) => segment.length > 0)
                .join(" ");

            if (descriptionText.length === 0) {
                wrappedDocs.push(...blockLines);
                continue;
            }

            const available = Math.max(wrapWidth - prefix.length, 16);
            const continuationAvailable = Math.max(Math.min(available, 62), 16);
            const segments = wrapSegments(
                descriptionText,
                available,
                continuationAvailable
            );

            if (segments.length === 0) {
                wrappedDocs.push(...blockLines);
                continue;
            }

            wrappedDocs.push(`${prefix}${segments[0]}`);
            for (
                let segmentIndex = 1;
                segmentIndex < segments.length;
                segmentIndex += 1
            ) {
                wrappedDocs.push(
                    `${continuationPrefix}${segments[segmentIndex]}`
                );
            }
            continue;
        }

        wrappedDocs.push(line);
    }

    reorderedDocs = wrappedDocs;

    result = reorderedDocs;

    if (removedAnyLine || otherLines.length > 0) {
        result._suppressLeadingBlank = true;
    }

    const filteredResult = result.filter((line) => {
        if (typeof line !== "string") {
            return true;
        }

        if (!/^\/\/\/\s*@description\b/i.test(line.trim())) {
            return true;
        }

        const metadata = parseDocCommentMetadata(line);
        const descriptionText =
            typeof metadata?.name === "string" ? metadata.name.trim() : "";

        return descriptionText.length > 0;
    });

    if (result._suppressLeadingBlank) {
        filteredResult._suppressLeadingBlank = true;
    }

    return filteredResult;
}

function getCanonicalParamNameFromText(name) {
    if (typeof name !== "string") {
        return null;
    }

    let trimmed = name.trim();

    if (trimmed.startsWith("[")) {
        let depth = 0;
        let closingIndex = -1;

        let index = 0;
        for (const char of trimmed) {
            if (char === "[") {
                depth += 1;
            } else if (char === "]") {
                depth -= 1;
                if (depth === 0) {
                    closingIndex = index;
                    break;
                }
            }

            index += 1;
        }

        if (closingIndex > 0) {
            trimmed = trimmed.slice(1, closingIndex);
        }
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex !== -1) {
        trimmed = trimmed.slice(0, equalsIndex);
    }

    const normalized = normalizeDocMetadataName(trimmed.trim());
    return normalized && normalized.length > 0 ? normalized : null;
}

function getPreferredFunctionParameterName(path, node, options) {
    const context = findFunctionParameterContext(path);
    if (context) {
        const { functionNode, paramIndex } = context;
        if (!functionNode || !Number.isInteger(paramIndex) || paramIndex < 0) {
            return null;
        }

        const params = getFunctionParams(functionNode);
        if (paramIndex >= params.length) {
            return null;
        }

        const identifier = getIdentifierFromParameterNode(params[paramIndex]);
        const currentName =
            (identifier && typeof identifier.name === "string"
                ? identifier.name
                : null) ??
            (node && typeof node.name === "string" ? node.name : null);

        const preferredName = resolvePreferredParameterName(
            functionNode,
            paramIndex,
            currentName,
            options
        );

        if (isNonEmptyString(preferredName)) {
            return preferredName;
        }

        return null;
    }

    if (!node || typeof node.name !== "string") {
        return null;
    }

    const argumentIndex = getArgumentIndexFromIdentifier(node.name);
    if (!Number.isInteger(argumentIndex) || argumentIndex < 0) {
        return null;
    }

    const functionNode = findEnclosingFunctionNode(path);
    if (!functionNode) {
        return null;
    }

    const preferredName = resolvePreferredParameterName(
        functionNode,
        argumentIndex,
        node.name,
        options
    );

    if (isNonEmptyString(preferredName)) {
        return preferredName;
    }

    const params = getFunctionParams(functionNode);
    if (argumentIndex >= params.length) {
        return null;
    }

    const identifier = getIdentifierFromParameterNode(params[argumentIndex]);
    if (!identifier || typeof identifier.name !== "string") {
        return null;
    }

    const normalizedIdentifier = normalizePreferredParameterName(
        identifier.name
    );
    if (
        normalizedIdentifier &&
        normalizedIdentifier !== node.name &&
        isValidIdentifierName(normalizedIdentifier)
    ) {
        return normalizedIdentifier;
    }

    return null;
}

function resolvePreferredParameterName(
    functionNode,
    paramIndex,
    currentName,
    options
) {
    if (!functionNode || !Number.isInteger(paramIndex) || paramIndex < 0) {
        return null;
    }

    const params = getFunctionParams(functionNode);
    if (paramIndex >= params.length) {
        return null;
    }

    const hasRenamableCurrentName =
        typeof currentName === "string" &&
        getArgumentIndexFromIdentifier(currentName) !== null;

    if (!hasRenamableCurrentName) {
        return null;
    }

    const preferredSource = resolvePreferredParameterSource(
        functionNode,
        paramIndex,
        currentName,
        options
    );

    const normalizedName = normalizePreferredParameterName(preferredSource);
    if (!normalizedName || normalizedName === currentName) {
        return null;
    }

    return isValidIdentifierName(normalizedName) ? normalizedName : null;
}

function resolvePreferredParameterSource(
    functionNode,
    paramIndex,
    currentName,
    options
) {
    const docPreferences = preferredParamDocNamesByNode.get(functionNode);
    if (docPreferences?.has(paramIndex)) {
        return docPreferences.get(paramIndex) ?? null;
    }

    const implicitEntries = collectImplicitArgumentDocNames(
        functionNode,
        options
    );
    if (!Array.isArray(implicitEntries)) {
        return null;
    }

    const implicitEntry = implicitEntries.find(
        (entry) => entry && entry.index === paramIndex
    );
    if (!implicitEntry) {
        return null;
    }

    if (
        implicitEntry.canonical &&
        implicitEntry.canonical !== implicitEntry.fallbackCanonical
    ) {
        return implicitEntry.name || implicitEntry.canonical;
    }

    if (implicitEntry.name && implicitEntry.name !== currentName) {
        return implicitEntry.name;
    }

    return null;
}

function findEnclosingFunctionNode(path) {
    if (!path || typeof path.getParentNode !== "function") {
        return null;
    }

    for (let depth = 0; ; depth += 1) {
        const parent =
            depth === 0 ? path.getParentNode() : path.getParentNode(depth);
        if (!parent) {
            break;
        }

        if (isFunctionLikeNode(parent)) {
            return parent;
        }
    }

    return null;
}

function isFunctionLikeNode(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    return (
        node.type === "FunctionDeclaration" ||
        node.type === "FunctionExpression" ||
        node.type === "ConstructorDeclaration"
    );
}

function findFunctionParameterContext(path) {
    if (!path || typeof path.getParentNode !== "function") {
        return null;
    }

    let candidate = path.getValue();
    for (let depth = 0; ; depth += 1) {
        const parent =
            depth === 0 ? path.getParentNode() : path.getParentNode(depth);
        if (!parent) {
            break;
        }

        if (parent.type === "DefaultParameter") {
            candidate = parent;
            continue;
        }

        if (
            parent.type === "FunctionDeclaration" ||
            parent.type === "ConstructorDeclaration"
        ) {
            const params = toMutableArray(parent.params);
            const index = params.indexOf(candidate);
            if (index !== -1) {
                return { functionNode: parent, paramIndex: index };
            }
        }

        candidate = parent;
    }

    return null;
}

function shouldOmitParameterAlias(declarator, functionNode, options) {
    if (
        !declarator ||
        declarator.type !== "VariableDeclarator" ||
        !declarator.id ||
        declarator.id.type !== "Identifier" ||
        !declarator.init ||
        declarator.init.type !== "Identifier"
    ) {
        return false;
    }

    const argumentIndex = getArgumentIndexFromIdentifier(declarator.init.name);
    if (argumentIndex === null) {
        return false;
    }

    const preferredName = resolvePreferredParameterName(
        functionNode,
        argumentIndex,
        declarator.init.name,
        options
    );

    const normalizedAlias = normalizePreferredParameterName(declarator.id.name);
    if (!normalizedAlias) {
        return false;
    }

    if (!functionNode) {
        return false;
    }

    const params = getFunctionParams(functionNode);
    if (argumentIndex < 0 || argumentIndex >= params.length) {
        return false;
    }

    const identifier = getIdentifierFromParameterNode(params[argumentIndex]);
    if (!identifier || typeof identifier.name !== "string") {
        return false;
    }

    const normalizedParamName = normalizePreferredParameterName(
        identifier.name
    );

    if (
        typeof normalizedParamName === "string" &&
        normalizedParamName.length > 0 &&
        normalizedParamName === normalizedAlias
    ) {
        return true;
    }

    const normalizedPreferred = preferredName
        ? normalizePreferredParameterName(preferredName)
        : null;

    if (normalizedPreferred && normalizedPreferred === normalizedAlias) {
        return true;
    }

    return false;
}

function getIdentifierFromParameterNode(param) {
    if (!param || typeof param !== "object") {
        return null;
    }

    if (param.type === "Identifier") {
        return param;
    }

    if (
        param.type === "DefaultParameter" &&
        param.left?.type === "Identifier"
    ) {
        return param.left;
    }

    return null;
}

function isInsideConstructorFunction(path) {
    if (!path || typeof path.getParentNode !== "function") {
        return false;
    }

    let functionAncestorDepth = null;

    for (let depth = 0; ; depth += 1) {
        const ancestor =
            depth === 0 ? path.getParentNode() : path.getParentNode(depth);
        if (!ancestor) {
            break;
        }

        if (
            functionAncestorDepth === null &&
            ancestor.type === "FunctionDeclaration"
        ) {
            const functionParent = path.getParentNode(depth + 1);
            if (!functionParent || functionParent.type !== "BlockStatement") {
                return false;
            }

            functionAncestorDepth = depth;
            continue;
        }

        if (ancestor.type === "ConstructorDeclaration") {
            return functionAncestorDepth !== null;
        }
    }

    return false;
}

function findEnclosingFunctionDeclaration(path) {
    if (!path || typeof path.getParentNode !== "function") {
        return null;
    }

    for (let depth = 0; ; depth += 1) {
        const parent =
            depth === 0 ? path.getParentNode() : path.getParentNode(depth);
        if (!parent) {
            break;
        }

        if (parent.type === "FunctionDeclaration") {
            return parent;
        }
    }

    return null;
}

function normalizePreferredParameterName(name) {
    if (typeof name !== "string" || name.length === 0) {
        return null;
    }

    const canonical = getCanonicalParamNameFromText(name);
    if (canonical && canonical.length > 0) {
        return canonical;
    }

    const normalized = normalizeDocMetadataName(name);
    if (typeof normalized !== "string" || normalized.length === 0) {
        return null;
    }

    return normalized.trim();
}

function isValidIdentifierName(name) {
    return typeof name === "string" && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}

function isOptionalParamDocName(name) {
    return typeof name === "string" && /^\s*\[[^\]]+\]\s*$/.test(name);
}

function updateParamLineWithDocName(line, newDocName) {
    if (typeof line !== "string" || typeof newDocName !== "string") {
        return line;
    }

    const prefixMatch = line.match(/^(\/\/\/\s*@param(?:\s+\{[^}]+\})?\s*)/i);
    if (!prefixMatch) {
        return `/// @param ${newDocName}`;
    }

    const prefix = prefixMatch[0];
    const remainder = line.slice(prefix.length);
    if (remainder.length === 0) {
        return `${prefix}${newDocName}`;
    }

    const updatedRemainder = remainder.replace(/^[^\s]+/, newDocName);
    return `${prefix}${updatedRemainder}`;
}

function computeSyntheticFunctionDocLines(
    node,
    existingDocLines,
    options,
    overrides = {}
) {
    if (!node) {
        return [];
    }

    const metadata = Array.isArray(existingDocLines)
        ? existingDocLines.map(parseDocCommentMetadata).filter(Boolean)
        : [];
    const orderedParamMetadata = metadata.filter(
        (meta) => meta.tag === "param"
    );

    const hasReturnsTag = metadata.some((meta) => meta.tag === "returns");
    const hasOverrideTag = metadata.some((meta) => meta.tag === "override");
    const documentedParamNames = new Set();
    const paramMetadataByCanonical = new Map();
    const overrideName = overrides?.nameOverride;
    const functionName = overrideName ?? getNodeName(node);
    const existingFunctionMetadata = metadata.find(
        (meta) => meta.tag === "function"
    );
    const normalizedFunctionName =
        typeof functionName === "string" &&
        isNonEmptyTrimmedString(functionName)
            ? normalizeDocMetadataName(functionName)
            : null;
    const normalizedExistingFunctionName =
        typeof existingFunctionMetadata?.name === "string" &&
        isNonEmptyTrimmedString(existingFunctionMetadata.name)
            ? normalizeDocMetadataName(existingFunctionMetadata.name)
            : null;

    for (const meta of metadata) {
        if (meta.tag !== "param") {
            continue;
        }

        const rawName = typeof meta.name === "string" ? meta.name : null;
        if (!rawName) {
            continue;
        }

        documentedParamNames.add(rawName);

        const canonical = getCanonicalParamNameFromText(rawName);
        if (canonical && !paramMetadataByCanonical.has(canonical)) {
            paramMetadataByCanonical.set(canonical, meta);
        }
    }

    const shouldInsertOverrideTag =
        overrides?.includeOverrideTag === true && !hasOverrideTag;

    const lines = [];

    if (shouldInsertOverrideTag) {
        lines.push("/// @override");
    }

    const shouldInsertFunctionTag =
        normalizedFunctionName &&
        (normalizedExistingFunctionName === null ||
            normalizedExistingFunctionName !== normalizedFunctionName);

    if (shouldInsertFunctionTag) {
        lines.push(`/// @function ${functionName}`);
    }

    const implicitArgumentDocNames = collectImplicitArgumentDocNames(
        node,
        options
    );
    const implicitDocEntryByIndex = new Map();

    for (const entry of implicitArgumentDocNames) {
        if (!entry) {
            continue;
        }

        const { index } = entry;
        if (!Number.isInteger(index) || index < 0) {
            continue;
        }

        if (!implicitDocEntryByIndex.has(index)) {
            implicitDocEntryByIndex.set(index, entry);
        }
    }

    if (!Array.isArray(node.params)) {
        for (const { name: docName } of implicitArgumentDocNames) {
            if (documentedParamNames.has(docName)) {
                continue;
            }

            documentedParamNames.add(docName);
            lines.push(`/// @param ${docName}`);
        }

        return maybeAppendReturnsDoc(lines, node, hasReturnsTag, overrides);
    }

    for (const [paramIndex, param] of node.params.entries()) {
        const paramInfo = getParameterDocInfo(param, node, options);
        if (!paramInfo || !paramInfo.name) {
            continue;
        }
        const ordinalMetadata =
            Number.isInteger(paramIndex) && paramIndex >= 0
                ? (orderedParamMetadata[paramIndex] ?? null)
                : null;
        const rawOrdinalName =
            typeof ordinalMetadata?.name === "string" &&
            ordinalMetadata.name.length > 0
                ? ordinalMetadata.name
                : null;
        const canonicalOrdinal = rawOrdinalName
            ? getCanonicalParamNameFromText(rawOrdinalName)
            : null;
        const implicitDocEntry = implicitDocEntryByIndex.get(paramIndex);
        const paramIdentifier = getIdentifierFromParameterNode(param);
        const paramIdentifierName =
            typeof paramIdentifier?.name === "string"
                ? paramIdentifier.name
                : null;
        const isGenericArgumentName =
            typeof paramIdentifierName === "string" &&
            getArgumentIndexFromIdentifier(paramIdentifierName) !== null;
        const implicitName =
            implicitDocEntry &&
            typeof implicitDocEntry.name === "string" &&
            implicitDocEntry.name &&
            implicitDocEntry.canonical !== implicitDocEntry.fallbackCanonical
                ? implicitDocEntry.name
                : null;
        const canonicalParamName =
            (implicitDocEntry?.canonical && implicitDocEntry.canonical) ||
            getCanonicalParamNameFromText(paramInfo.name);
        const existingMetadata =
            (canonicalParamName &&
                paramMetadataByCanonical.has(canonicalParamName) &&
                paramMetadataByCanonical.get(canonicalParamName)) ||
            null;
        const existingDocName = existingMetadata?.name;
        const hasCompleteOrdinalDocs =
            Array.isArray(node.params) &&
            orderedParamMetadata.length === node.params.length;
        const shouldAdoptOrdinalName =
            Boolean(rawOrdinalName) &&
            ((Boolean(canonicalOrdinal) &&
                Boolean(canonicalParamName) &&
                canonicalOrdinal === canonicalParamName) ||
                isGenericArgumentName);

        if (
            hasCompleteOrdinalDocs &&
            node &&
            typeof paramIndex === "number" &&
            shouldAdoptOrdinalName
        ) {
            const documentedParamCanonical =
                getCanonicalParamNameFromText(paramInfo.name) ?? null;
            if (
                documentedParamCanonical &&
                paramMetadataByCanonical.has(documentedParamCanonical)
            ) {
                // The parameter already appears in the documented metadata;
                // avoid overriding it with mismatched ordinal ordering.
            } else {
                let preferredDocs = preferredParamDocNamesByNode.get(node);
                if (!preferredDocs) {
                    preferredDocs = new Map();
                    preferredParamDocNamesByNode.set(node, preferredDocs);
                }
                if (!preferredDocs.has(paramIndex)) {
                    preferredDocs.set(paramIndex, rawOrdinalName);
                }
            }
        }
        if (
            !shouldAdoptOrdinalName &&
            canonicalOrdinal &&
            canonicalParamName &&
            canonicalOrdinal !== canonicalParamName &&
            node &&
            !paramMetadataByCanonical.has(canonicalParamName)
        ) {
            let suppressedCanonicals =
                suppressedImplicitDocCanonicalByNode.get(node);
            if (!suppressedCanonicals) {
                suppressedCanonicals = new Set();
                suppressedImplicitDocCanonicalByNode.set(
                    node,
                    suppressedCanonicals
                );
            }
            suppressedCanonicals.add(canonicalOrdinal);
        }
        const ordinalDocName =
            hasCompleteOrdinalDocs &&
            (!existingDocName || existingDocName.length === 0) &&
            shouldAdoptOrdinalName
                ? rawOrdinalName
                : null;
        let effectiveImplicitName = implicitName;
        if (effectiveImplicitName && ordinalDocName) {
            const canonicalImplicit =
                getCanonicalParamNameFromText(effectiveImplicitName) ?? null;
            const fallbackCanonical =
                implicitDocEntry?.fallbackCanonical ??
                getCanonicalParamNameFromText(paramInfo.name);

            if (
                canonicalOrdinal &&
                canonicalOrdinal !== fallbackCanonical &&
                canonicalOrdinal !== canonicalImplicit
            ) {
                const ordinalLength = canonicalOrdinal.length;
                const implicitLength =
                    (canonicalImplicit && canonicalImplicit.length > 0) ||
                    effectiveImplicitName.trim().length > 0;

                if (ordinalLength > implicitLength) {
                    effectiveImplicitName = null;
                    if (implicitDocEntry) {
                        implicitDocEntry._suppressDocLine = true;
                        if (implicitDocEntry.canonical && node) {
                            let suppressedCanonicals =
                                suppressedImplicitDocCanonicalByNode.get(node);
                            if (!suppressedCanonicals) {
                                suppressedCanonicals = new Set();
                                suppressedImplicitDocCanonicalByNode.set(
                                    node,
                                    suppressedCanonicals
                                );
                            }
                            suppressedCanonicals.add(
                                implicitDocEntry.canonical
                            );
                        }
                        if (canonicalOrdinal) {
                            implicitDocEntry.canonical = canonicalOrdinal;
                        }
                        if (ordinalDocName) {
                            implicitDocEntry.name = ordinalDocName;
                            if (node) {
                                let preferredDocs =
                                    preferredParamDocNamesByNode.get(node);
                                if (!preferredDocs) {
                                    preferredDocs = new Map();
                                    preferredParamDocNamesByNode.set(
                                        node,
                                        preferredDocs
                                    );
                                }
                                preferredDocs.set(paramIndex, ordinalDocName);
                            }
                        }
                    }
                }
            }
        }

        const baseDocName =
            (effectiveImplicitName &&
                effectiveImplicitName.length > 0 &&
                effectiveImplicitName) ||
            (ordinalDocName && ordinalDocName.length > 0 && ordinalDocName) ||
            paramInfo.name;
        const shouldMarkOptional =
            paramInfo.optional ||
            (param?.type === "DefaultParameter" &&
                isOptionalParamDocName(existingDocName));
        if (
            shouldMarkOptional &&
            param?.type === "DefaultParameter" &&
            isUndefinedLiteral(param.right)
        ) {
            preservedUndefinedDefaultParameters.add(param);
        }
        const docName =
            (shouldMarkOptional && `[${baseDocName}]`) || baseDocName;

        if (documentedParamNames.has(docName)) {
            if (implicitDocEntry?.name) {
                documentedParamNames.add(implicitDocEntry.name);
            }
            continue;
        }
        documentedParamNames.add(docName);
        if (implicitDocEntry?.name) {
            documentedParamNames.add(implicitDocEntry.name);
        }
        lines.push(`/// @param ${docName}`);
    }

    for (const entry of implicitArgumentDocNames) {
        if (!entry || entry._suppressDocLine) {
            continue;
        }

        const { name: docName, index, canonical, fallbackCanonical } = entry;
        const isFallbackEntry = canonical === fallbackCanonical;
        if (
            isFallbackEntry &&
            Number.isInteger(index) &&
            orderedParamMetadata[index] &&
            typeof orderedParamMetadata[index].name === "string" &&
            orderedParamMetadata[index].name.length > 0
        ) {
            continue;
        }

        if (documentedParamNames.has(docName)) {
            continue;
        }

        documentedParamNames.add(docName);
        lines.push(`/// @param ${docName}`);
    }

    return maybeAppendReturnsDoc(lines, node, hasReturnsTag, overrides).map(
        (line) => normalizeDocCommentTypeAnnotations(line)
    );
}

function collectImplicitArgumentDocNames(functionNode, options) {
    if (!functionNode || functionNode.type !== "FunctionDeclaration") {
        return [];
    }

    const referenceInfo = gatherImplicitArgumentReferences(functionNode);
    const entries = buildImplicitArgumentDocEntries(referenceInfo);
    const suppressedCanonicals =
        suppressedImplicitDocCanonicalByNode.get(functionNode);

    if (!suppressedCanonicals || suppressedCanonicals.size === 0) {
        return entries;
    }

    return entries.filter((entry) => {
        if (!entry || !entry.canonical) {
            return true;
        }

        return !suppressedCanonicals.has(entry.canonical);
    });
}

// Collects index/reference bookkeeping for implicit `arguments[index]` usages
// within a function. The traversal tracks alias declarations, direct
// references, and the set of indices that require doc entries so the caller
// can format them without dipping into low-level mutation logic.
function gatherImplicitArgumentReferences(functionNode) {
    const referencedIndices = new Set();
    const aliasByIndex = new Map();
    const directReferenceIndices = new Set();

    const visit = (node, parent, property) => {
        if (!node || typeof node !== "object") {
            return;
        }

        if (node === functionNode) {
            visit(functionNode.body, node, "body");
            return;
        }

        if (Array.isArray(node)) {
            for (const [index, element] of node.entries()) {
                visit(element, parent, index);
            }
            return;
        }

        if (
            node !== functionNode &&
            (node.type === "FunctionDeclaration" ||
                node.type === "FunctionExpression" ||
                node.type === "ConstructorDeclaration")
        ) {
            return;
        }

        let skipAliasInitializer = false;
        if (node.type === "VariableDeclarator") {
            const aliasIndex = getArgumentIndexFromNode(node.init);
            if (
                aliasIndex !== null &&
                node.id?.type === "Identifier" &&
                !aliasByIndex.has(aliasIndex)
            ) {
                const aliasName = normalizeDocMetadataName(node.id.name);
                if (isNonEmptyString(aliasName)) {
                    aliasByIndex.set(aliasIndex, aliasName);
                    referencedIndices.add(aliasIndex);
                    skipAliasInitializer = true;
                }
            }
        }

        const directIndex = getArgumentIndexFromNode(node);
        if (directIndex !== null) {
            referencedIndices.add(directIndex);
            if (!(skipAliasInitializer && property === "init")) {
                directReferenceIndices.add(directIndex);
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (skipAliasInitializer && key === "init") {
                continue;
            }
            if (!value || typeof value !== "object") {
                continue;
            }

            visit(value, node, key);
        }
    };

    visit(functionNode.body, functionNode, "body");

    return { referencedIndices, aliasByIndex, directReferenceIndices };
}

function buildImplicitArgumentDocEntries({
    referencedIndices,
    aliasByIndex,
    directReferenceIndices
}) {
    if (!referencedIndices || referencedIndices.size === 0) {
        return [];
    }

    const sortedIndices = [...referencedIndices].sort(
        (left, right) => left - right
    );

    return sortedIndices.map((index) =>
        createImplicitArgumentDocEntry({
            index,
            aliasByIndex,
            directReferenceIndices
        })
    );
}

function createImplicitArgumentDocEntry({
    index,
    aliasByIndex,
    directReferenceIndices
}) {
    const fallbackName = `argument${index}`;
    const alias = aliasByIndex?.get(index);
    const docName = (alias && alias.length > 0 && alias) || fallbackName;
    const canonical = getCanonicalParamNameFromText(docName) ?? docName;
    const fallbackCanonical =
        getCanonicalParamNameFromText(fallbackName) ?? fallbackName;

    return {
        name: docName,
        canonical,
        fallbackCanonical,
        index,
        hasDirectReference: directReferenceIndices?.has(index) === true
    };
}

function getArgumentIndexFromNode(node) {
    if (!node || typeof node !== "object") {
        return null;
    }

    if (node.type === "Identifier") {
        return getArgumentIndexFromIdentifier(node.name);
    }

    if (
        node.type === "MemberIndexExpression" &&
        node.object?.type === "Identifier" &&
        node.object.name === "argument" &&
        Array.isArray(node.property) &&
        node.property.length === 1 &&
        node.property[0]?.type === "Literal"
    ) {
        const literal = node.property[0];
        const parsed = Number.parseInt(literal.value, 10);
        return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
    }

    return null;
}

function getArgumentIndexFromIdentifier(name) {
    if (typeof name !== "string") {
        return null;
    }

    const match = name.match(/^argument(\d+)$/);
    if (!match) {
        return null;
    }

    const parsed = Number.parseInt(match[1], 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function maybeAppendReturnsDoc(
    lines,
    functionNode,
    hasReturnsTag,
    overrides = {}
) {
    if (!Array.isArray(lines)) {
        return [];
    }

    if (overrides?.suppressReturns === true) {
        return lines;
    }

    if (
        hasReturnsTag ||
        !functionNode ||
        functionNode.type !== "FunctionDeclaration" ||
        functionNode._suppressSyntheticReturnsDoc
    ) {
        return lines;
    }

    const body = functionNode.body;
    const statements =
        body?.type === "BlockStatement" && Array.isArray(body.body)
            ? body.body
            : null;

    if (!statements) {
        return [...lines, "/// @returns {undefined}"];
    }

    if (statements.length === 0) {
        return [...lines, "/// @returns {undefined}"];
    }

    if (functionReturnsNonUndefinedValue(functionNode)) {
        return lines;
    }

    return [...lines, "/// @returns {undefined}"];
}

function functionReturnsNonUndefinedValue(functionNode) {
    if (!functionNode || functionNode.type !== "FunctionDeclaration") {
        return false;
    }

    const body = functionNode.body;
    if (body?.type !== "BlockStatement" || !Array.isArray(body.body)) {
        return false;
    }

    const stack = [...body.body];
    const visited = new Set();

    while (stack.length > 0) {
        const current = stack.pop();
        if (!current || typeof current !== "object") {
            continue;
        }

        if (visited.has(current)) {
            continue;
        }
        visited.add(current);

        switch (current.type) {
            case "FunctionDeclaration":
            case "ConstructorDeclaration":
            case "FunctionExpression": {
                continue;
            }
            case "ReturnStatement": {
                const argument = current.argument;
                if (!argument) {
                    continue;
                }

                if (!isUndefinedLiteral(argument)) {
                    return true;
                }

                continue;
            }
            default: {
                break;
            }
        }

        for (const value of Object.values(current)) {
            enqueueObjectChildValues(stack, value);
        }
    }

    return false;
}

function parseDocCommentMetadata(line) {
    if (typeof line !== "string") {
        return null;
    }

    const trimmed = line.trim();
    const match = trimmed.match(/^\/\/\/\s*@([a-z]+)\b\s*(.*)$/i);
    if (!match) {
        return null;
    }

    const tag = match[1].toLowerCase();
    const remainder = match[2].trim();

    if (tag === "param") {
        let paramSection = remainder;

        if (paramSection.startsWith("{")) {
            const typeMatch = paramSection.match(/^\{[^}]*\}\s*(.*)$/);
            if (typeMatch) {
                paramSection = typeMatch[1] ?? "";
            }
        }

        let name = null;
        if (paramSection.startsWith("[")) {
            let depth = 0;
            for (let i = 0; i < paramSection.length; i++) {
                const char = paramSection[i];
                if (char === "[") {
                    depth += 1;
                } else if (char === "]") {
                    depth -= 1;
                    if (depth === 0) {
                        name = paramSection.slice(0, i + 1);
                        break;
                    }
                }
            }
        }

        if (!name) {
            const paramMatch = paramSection.match(/^(\S+)/);
            name = paramMatch ? paramMatch[1] : null;
        }
        if (typeof name === "string") {
            name = normalizeOptionalParamNameToken(name);
        }
        return { tag, name };
    }

    return { tag, name: remainder };
}

function normalizeOptionalParamNameToken(name) {
    if (typeof name !== "string") {
        return name;
    }

    const trimmed = name.trim();

    if (/^\[[^\]]+\]$/.test(trimmed)) {
        return trimmed;
    }

    let stripped = trimmed;
    let hadSentinel = false;

    while (stripped.startsWith("*")) {
        stripped = stripped.slice(1);
        hadSentinel = true;
    }

    while (stripped.endsWith("*")) {
        stripped = stripped.slice(0, -1);
        hadSentinel = true;
    }

    if (!hadSentinel) {
        return trimmed;
    }

    const normalized = stripped.trim();

    if (normalized.length === 0) {
        return stripped.replaceAll("*", "");
    }

    return `[${normalized}]`;
}

function getSourceTextForNode(node, options) {
    if (!node) {
        return null;
    }

    const { originalText, locStart, locEnd } =
        resolvePrinterSourceMetadata(options);

    if (originalText === null) {
        return null;
    }

    const startIndex =
        typeof locStart === "function"
            ? locStart(node)
            : getNodeStartIndex(node);
    const endIndex =
        typeof locEnd === "function" ? locEnd(node) : getNodeEndIndex(node);

    if (typeof startIndex !== "number" || typeof endIndex !== "number") {
        return null;
    }

    if (endIndex <= startIndex) {
        return null;
    }

    return originalText.slice(startIndex, endIndex).trim();
}

function shouldPreserveCompactUpdateAssignmentSpacing(path, options) {
    if (
        !path ||
        typeof path.getValue !== "function" ||
        typeof path.getParentNode !== "function"
    ) {
        return false;
    }

    const node = path.getValue();
    if (!node || node.type !== "AssignmentExpression") {
        return false;
    }

    if (node.operator === "=") {
        return false;
    }

    const parent = path.getParentNode();
    if (parent?.type !== "ForStatement") {
        return false;
    }

    if (typeof path.getName !== "function" || path.getName() !== "update") {
        return false;
    }

    const source = getSourceTextForNode(node, options);
    if (typeof source !== "string" || source.length === 0) {
        return false;
    }

    const operatorIndex = source.indexOf(node.operator);
    if (operatorIndex <= 0) {
        return false;
    }

    const beforeChar = source[operatorIndex - 1] ?? "";
    if (/\s/.test(beforeChar)) {
        return false;
    }

    const afterChar = source[operatorIndex + node.operator.length] ?? "";
    if (!/\s/.test(afterChar)) {
        return false;
    }

    return true;
}

function structLiteralHasLeadingLineBreak(node, options) {
    if (!node) {
        return false;
    }

    const { originalText } = resolvePrinterSourceMetadata(options);
    if (originalText === null) {
        return false;
    }

    if (!Array.isArray(node.properties) || node.properties.length === 0) {
        return false;
    }

    const { start, end } = getNodeRangeIndices(node);
    if (start == null || end == null || end <= start) {
        return false;
    }

    const source = originalText.slice(start, end);
    const openBraceIndex = source.indexOf("{");
    if (openBraceIndex === -1) {
        return false;
    }

    for (let index = openBraceIndex + 1; index < source.length; index += 1) {
        const character = source[index];

        if (character === "\n") {
            return true;
        }

        if (character === "\r") {
            if (source[index + 1] === "\n") {
                return true;
            }
            return true;
        }

        if (character.trim() === "") {
            continue;
        }

        if (character === "/") {
            const lookahead = source[index + 1];

            if (lookahead === "/") {
                index += 2;
                while (index < source.length) {
                    const commentChar = source[index];
                    if (commentChar === "\n") {
                        return true;
                    }
                    if (commentChar === "\r") {
                        if (source[index + 1] === "\n") {
                            return true;
                        }
                        return true;
                    }

                    index += 1;
                }

                return false;
            }

            if (lookahead === "*") {
                index += 2;
                while (index < source.length - 1) {
                    const commentChar = source[index];
                    if (commentChar === "\n") {
                        return true;
                    }
                    if (commentChar === "\r") {
                        if (source[index + 1] === "\n") {
                            return true;
                        }
                        return true;
                    }

                    if (commentChar === "*" && source[index + 1] === "/") {
                        index += 1;
                        break;
                    }

                    index += 1;
                }

                continue;
            }
        }

        if (character === "}") {
            return false;
        }

        return false;
    }

    return false;
}

function getStructPropertyPrefix(node, options) {
    if (!node) {
        return null;
    }

    const { originalText } = resolvePrinterSourceMetadata(options);
    if (originalText === null) {
        return null;
    }

    const propertyStart = getNodeStartIndex(node);
    const valueStart = getNodeStartIndex(node?.value);

    if (
        typeof propertyStart !== "number" ||
        typeof valueStart !== "number" ||
        valueStart <= propertyStart
    ) {
        return null;
    }

    const prefix = originalText.slice(propertyStart, valueStart);
    if (prefix.length === 0 || !prefix.includes(":")) {
        return null;
    }

    const colonIndex = prefix.indexOf(":");
    const beforeColon = prefix.slice(0, colonIndex);
    const afterColon = prefix.slice(colonIndex + 1);
    const hasWhitespaceBefore = /\s$/.test(beforeColon);
    const hasWhitespaceAfter = /^\s/.test(afterColon);

    if (!hasWhitespaceBefore && !hasWhitespaceAfter) {
        return null;
    }

    return prefix;
}

function getNormalizedParameterName(paramNode) {
    if (!paramNode) {
        return null;
    }

    const rawName = getIdentifierText(paramNode);
    if (typeof rawName !== "string" || rawName.length === 0) {
        return null;
    }

    const normalizedName = normalizeDocMetadataName(rawName);
    return getNonEmptyString(normalizedName);
}

function getParameterDocInfo(paramNode, functionNode, options) {
    if (!paramNode) {
        return null;
    }

    if (paramNode.type === "Identifier") {
        const name = getNormalizedParameterName(paramNode);
        return name ? { name, optional: false } : null;
    }

    if (paramNode.type === "DefaultParameter") {
        const name = getNormalizedParameterName(paramNode.left);
        if (!name) {
            return null;
        }

        const defaultIsUndefined = isUndefinedLiteral(paramNode.right);
        const signatureOmitsUndefinedDefault =
            defaultIsUndefined &&
            shouldOmitUndefinedDefaultForFunctionNode(functionNode);
        const isConstructorLike =
            functionNode?.type === "ConstructorDeclaration" ||
            functionNode?.type === "ConstructorParentClause";

        const shouldIncludeDefaultText =
            !defaultIsUndefined ||
            (!signatureOmitsUndefinedDefault && !isConstructorLike);

        const defaultText = shouldIncludeDefaultText
            ? getSourceTextForNode(paramNode.right, options)
            : null;

        const docName = defaultText ? `${name}=${defaultText}` : name;

        const optionalOverride = paramNode?._featherOptionalParameter === true;
        const optional = defaultIsUndefined
            ? optionalOverride || !signatureOmitsUndefinedDefault
            : true;

        return {
            name: docName,
            optional
        };
    }

    if (paramNode.type === "MissingOptionalArgument") {
        return null;
    }

    const fallbackName = getNormalizedParameterName(paramNode);
    return fallbackName ? { name: fallbackName, optional: false } : null;
}

function shouldOmitDefaultValueForParameter(path) {
    const node = path.getValue();
    if (!node || node.type !== "DefaultParameter") {
        return false;
    }

    if (
        preservedUndefinedDefaultParameters.has(node) ||
        !isUndefinedLiteral(node.right) ||
        typeof path.getParentNode !== "function"
    ) {
        return false;
    }

    let depth = 0;
    while (true) {
        const ancestor =
            depth === 0 ? path.getParentNode() : path.getParentNode(depth);
        if (!ancestor) {
            break;
        }

        if (shouldOmitUndefinedDefaultForFunctionNode(ancestor)) {
            return true;
        }

        depth += 1;
    }

    return false;
}

function shouldOmitUndefinedDefaultForFunctionNode(functionNode) {
    if (!functionNode || !functionNode.type) {
        return false;
    }

    if (
        functionNode.type === "ConstructorDeclaration" ||
        functionNode.type === "ConstructorParentClause"
    ) {
        return false;
    }

    return functionNode.type === "FunctionDeclaration";
}

function printBooleanReturnIf(path, print) {
    const node = path.getValue();
    if (
        !node ||
        node.type !== "IfStatement" ||
        !node.consequent ||
        !node.alternate ||
        hasComment(node)
    ) {
        return null;
    }

    const consequentReturn = getBooleanReturnBranch(node.consequent);
    const alternateReturn = getBooleanReturnBranch(node.alternate);

    if (!consequentReturn || !alternateReturn) {
        return null;
    }

    if (consequentReturn.value === alternateReturn.value) {
        return null;
    }

    const conditionDoc = printWithoutExtraParens(path, print, "test");
    const conditionNode = node.test;

    const argumentDoc =
        consequentReturn.value === "true"
            ? conditionDoc
            : negateExpressionDoc(conditionDoc, conditionNode);

    return concat([
        "return ",
        argumentDoc,
        optionalSemicolon("ReturnStatement")
    ]);
}

function getBooleanReturnBranch(branchNode) {
    if (!branchNode || hasComment(branchNode)) {
        return null;
    }

    if (branchNode.type === "BlockStatement") {
        const statements = Array.isArray(branchNode.body)
            ? branchNode.body
            : [];
        if (statements.length !== 1) {
            return null;
        }

        const [onlyStatement] = statements;
        if (
            hasComment(onlyStatement) ||
            onlyStatement.type !== "ReturnStatement"
        ) {
            return null;
        }

        return getBooleanReturnStatementInfo(onlyStatement);
    }

    if (branchNode.type === "ReturnStatement") {
        return getBooleanReturnStatementInfo(branchNode);
    }

    return null;
}

/**
 * Builds the document representation for an if statement, ensuring that the
 * orchestration logic in the main printer delegates the clause assembly and
 * alternate handling to a single abstraction layer.
 */
function buildIfStatementDoc(path, options, print, node) {
    const parts = [
        printSingleClauseStatement(
            path,
            options,
            print,
            "if",
            "test",
            "consequent"
        )
    ];

    const elseDoc = buildIfAlternateDoc(path, options, print, node);
    if (elseDoc) {
        parts.push([" else ", elseDoc]);
    }

    return concat(parts);
}

function buildIfAlternateDoc(path, options, print, node) {
    if (!node || node.alternate == null) {
        return null;
    }

    const alternateNode = node.alternate;

    if (alternateNode.type === "IfStatement") {
        // Keep chained `else if` statements unwrapped. Printing the alternate
        // with braces would produce `else { if (...) ... }`, which breaks the
        // cascade that GameMaker expects, introduces an extra block for the
        // runtime to evaluate, and diverges from the control-structure style
        // documented in the GameMaker manual (see https://manual.gamemaker.io/monthly/en/#t=GML_Overview%2FGML_Syntax.htm%23ElseIf).
        // By delegating directly to the child printer we preserve the
        // flattened `else if` ladder that authors wrote and that downstream
        // tools rely on when parsing the control flow.
        return print("alternate");
    }

    if (shouldPrintBlockAlternateAsElseIf(alternateNode)) {
        return path.call(
            (alternatePath) => alternatePath.call(print, "body", 0),
            "alternate"
        );
    }

    return printInBlock(path, options, print, "alternate");
}

function getBooleanReturnStatementInfo(returnNode) {
    if (!returnNode || hasComment(returnNode)) {
        return null;
    }

    const argument = returnNode.argument;
    if (!argument || hasComment(argument) || !isBooleanLiteral(argument)) {
        return null;
    }

    return { value: argument.value.toLowerCase() };
}

function simplifyBooleanBinaryExpression(path, print, node) {
    if (!node) {
        return null;
    }

    if (node.operator !== "==" && node.operator !== "!=") {
        return null;
    }

    const leftBoolean = isBooleanLiteral(node.left);
    const rightBoolean = isBooleanLiteral(node.right);

    if (!leftBoolean && !rightBoolean) {
        return null;
    }

    const booleanNode = leftBoolean ? node.left : node.right;
    const expressionKey = leftBoolean ? "right" : "left";
    const expressionNode = leftBoolean ? node.right : node.left;
    const expressionDoc = printWithoutExtraParens(path, print, expressionKey);
    const isEquality = node.operator === "==";
    const isTrue = booleanNode.value.toLowerCase() === "true";

    if (isTrue) {
        return isEquality
            ? expressionDoc
            : negateExpressionDoc(expressionDoc, expressionNode);
    }

    return isEquality
        ? negateExpressionDoc(expressionDoc, expressionNode)
        : expressionDoc;
}

function applyTrigonometricFunctionSimplification(path) {
    const node = path.getValue();
    if (!node || node.type !== "CallExpression") {
        return;
    }

    simplifyTrigonometricCall(node);
}

function simplifyTrigonometricCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    if (hasComment(node)) {
        return false;
    }

    const identifierName = getIdentifierText(node.object);
    if (!identifierName) {
        return false;
    }

    const normalizedName = identifierName.toLowerCase();

    if (applyInnerDegreeWrapperConversion(node, normalizedName)) {
        return true;
    }

    if (normalizedName === "degtorad") {
        return applyOuterTrigConversion(node, DEGREE_TO_RADIAN_CONVERSIONS);
    }

    if (normalizedName === "radtodeg") {
        return applyOuterTrigConversion(node, RADIAN_TO_DEGREE_CONVERSIONS);
    }

    return false;
}

function applyInnerDegreeWrapperConversion(node, functionName) {
    const mapping = RADIAN_TRIG_TO_DEGREE.get(functionName);
    if (!mapping) {
        return false;
    }

    const args = getCallExpressionArguments(node);
    if (args.length !== 1) {
        return false;
    }

    const [firstArg] = args;
    if (
        !isCallExpressionIdentifierMatch(firstArg, "degtorad", {
            caseInsensitive: true
        })
    ) {
        return false;
    }

    if (hasComment(firstArg)) {
        return false;
    }

    const wrappedArgs = getCallExpressionArguments(firstArg);
    if (wrappedArgs.length !== 1) {
        return false;
    }

    updateCallExpressionNameAndArgs(node, mapping, wrappedArgs);
    return true;
}

function applyOuterTrigConversion(node, conversionMap) {
    const args = getCallExpressionArguments(node);
    if (args.length !== 1) {
        return false;
    }

    const [firstArg] = args;
    if (!firstArg || firstArg.type !== "CallExpression") {
        return false;
    }

    if (hasComment(firstArg)) {
        return false;
    }

    const innerName = getIdentifierText(firstArg.object);
    if (!innerName) {
        return false;
    }

    const mapping = conversionMap.get(innerName.toLowerCase());
    if (!mapping) {
        return false;
    }

    const innerArgs = getCallExpressionArguments(firstArg);
    if (
        typeof mapping.expectedArgs === "number" &&
        innerArgs.length !== mapping.expectedArgs
    ) {
        return false;
    }

    updateCallExpressionNameAndArgs(node, mapping.name, innerArgs);
    return true;
}

function updateCallExpressionNameAndArgs(node, newName, newArgs) {
    if (!node || node.type !== "CallExpression") {
        return;
    }

    if (!node.object || node.object.type !== "Identifier") {
        node.object = { type: "Identifier", name: newName };
    } else {
        node.object.name = newName;
    }

    node.arguments = toMutableArray(newArgs, { clone: true });
}

function negateExpressionDoc(expressionDoc, expressionNode) {
    if (needsParensForNegation(expressionNode)) {
        return group(["!", "(", expressionDoc, ")"]);
    }
    return group(["!", expressionDoc]);
}

function needsParensForNegation(node) {
    if (!node) {
        return true;
    }

    if (node.type === "ParenthesizedExpression") {
        return needsParensForNegation(node.expression);
    }

    return [
        "BinaryExpression",
        "AssignmentExpression",
        "TernaryExpression",
        "LogicalExpression"
    ].includes(node.type);
}

function shouldPrefixGlobalIdentifier(path) {
    const node = path.getValue();
    if (!node || !node.isGlobalIdentifier) {
        return false;
    }

    const parent = path.getParentNode();
    if (!parent) {
        return true;
    }

    if (parent.type === "MemberDotExpression" && parent.property === node) {
        return false;
    }

    if (parent.type === "Property" && parent.name === node) {
        return false;
    }

    if (parent.type === "VariableDeclarator" && parent.id === node) {
        return false;
    }

    if (parent.type === "FunctionDeclaration" && parent.id === node) {
        return false;
    }

    if (parent.type === "ConstructorDeclaration" && parent.id === node) {
        return false;
    }

    if (parent.type === "ConstructorParentClause" && parent.id === node) {
        return false;
    }

    if (parent.type === "EnumMember" && parent.name === node) {
        return false;
    }

    return true;
}

function shouldGenerateSyntheticDocForFunction(
    path,
    existingDocLines,
    options
) {
    const node = path.getValue();
    const parent = path.getParentNode();
    if (
        !node ||
        !parent ||
        (parent.type !== "Program" && parent.type !== "BlockStatement")
    ) {
        return false;
    }

    if (node.type === "ConstructorDeclaration") {
        return true;
    }

    if (node.type !== "FunctionDeclaration") {
        return false;
    }

    const syntheticLines = computeSyntheticFunctionDocLines(
        node,
        existingDocLines,
        options
    );

    if (syntheticLines.length > 0) {
        return true;
    }

    return (
        Array.isArray(node.params) &&
        node.params.some((param) => {
            return param?.type === "DefaultParameter";
        })
    );
}

function findSiblingListAndIndex(parent, targetNode) {
    if (!parent || !targetNode) {
        return null;
    }

    // Iterate using `for...in` to preserve the original hot-path optimisation
    // while keeping the scan readable and short-circuiting as soon as the node
    // is located.
    for (const key in parent) {
        if (!Object.hasOwn(parent, key)) {
            continue;
        }

        const value = parent[key];
        if (!Array.isArray(value)) {
            continue;
        }

        for (let index = 0; index < value.length; index += 1) {
            if (value[index] === targetNode) {
                return { list: value, index };
            }
        }
    }

    return null;
}

function loopLengthNameConflicts(path, cachedLengthName) {
    if (typeof cachedLengthName !== "string" || cachedLengthName.length === 0) {
        return false;
    }

    const siblingInfo = getParentStatementList(path);
    if (!siblingInfo) {
        return false;
    }

    const { siblingList, nodeIndex } = siblingInfo;
    for (const [index, element] of siblingList.entries()) {
        if (index === nodeIndex) {
            continue;
        }

        if (nodeDeclaresIdentifier(element, cachedLengthName)) {
            return true;
        }
    }

    return false;
}

function nodeDeclaresIdentifier(node, identifierName) {
    if (!node || typeof identifierName !== "string") {
        return false;
    }

    if (node.type === "VariableDeclaration") {
        const declarations = node.declarations;
        if (!Array.isArray(declarations)) {
            return false;
        }

        for (const declarator of declarations) {
            if (!declarator || declarator.type !== "VariableDeclarator") {
                continue;
            }

            const declaratorName = getIdentifierText(declarator.id);
            if (declaratorName === identifierName) {
                return true;
            }
        }

        return false;
    }

    if (node.type === "ForStatement") {
        return nodeDeclaresIdentifier(node.init, identifierName);
    }

    const nodeIdName = getIdentifierText(node.id);
    return nodeIdName === identifierName;
}

function getParentStatementList(path) {
    if (
        typeof path?.getValue !== "function" ||
        typeof path.getParentNode !== "function"
    ) {
        return null;
    }

    const node = path.getValue();
    if (!node) {
        return null;
    }

    const parent = path.getParentNode();
    if (!parent) {
        return null;
    }

    const siblingInfo = findSiblingListAndIndex(parent, node);
    if (!siblingInfo) {
        return null;
    }

    return {
        siblingList: siblingInfo.list,
        nodeIndex: siblingInfo.index
    };
}

function shouldInsertHoistedLoopSeparator(path, options) {
    if (typeof path?.getValue !== "function") {
        return false;
    }

    const node = path.getValue();
    if (node?.type !== "ForStatement") {
        return false;
    }

    const siblingInfo = getParentStatementList(path);
    if (!siblingInfo) {
        return false;
    }

    const nextNode = siblingInfo.siblingList[siblingInfo.nodeIndex + 1];
    if (nextNode?.type !== "ForStatement") {
        return false;
    }

    return options?.optimizeLoopLengthHoisting ?? true;
}

function getNodeName(node) {
    if (!node) {
        return null;
    }

    if (node.id !== undefined) {
        const idName = getIdentifierText(node.id);
        if (idName) {
            return idName;
        }
    }

    if (node.key !== undefined) {
        const keyName = getIdentifierText(node.key);
        if (keyName) {
            return keyName;
        }
    }

    return getIdentifierText(node);
}

function stripSyntheticParameterSentinels(name) {
    if (typeof name !== "string") {
        return name;
    }

    // GameMaker constructors commonly prefix private parameters with underscores
    // (e.g., `_value`, `__foo__`) or similar characters like `$`. These sentinels
    // should not appear in generated documentation metadata, so remove them from
    // the beginning and end of the identifier while leaving the core name intact.
    let sanitized = name;
    sanitized = sanitized.replace(/^[_$]+/, "");
    sanitized = sanitized.replace(/[_$]+$/, "");

    return sanitized.length > 0 ? sanitized : name;
}

function normalizeDocMetadataName(name) {
    if (typeof name !== "string") {
        return name;
    }

    const optionalNormalized = normalizeOptionalParamNameToken(name);
    if (typeof optionalNormalized === "string") {
        if (/^\[[^\]]+\]$/.test(optionalNormalized)) {
            return optionalNormalized;
        }

        const sanitized = stripSyntheticParameterSentinels(optionalNormalized);
        return sanitized.length > 0 ? sanitized : optionalNormalized;
    }

    return name;
}

function docHasTrailingComment(doc) {
    if (isNonEmptyArray(doc)) {
        const lastItem = doc.at(-1);
        if (isNonEmptyArray(lastItem)) {
            const commentArr = lastItem[0];
            if (isNonEmptyArray(commentArr)) {
                return commentArr.some((item) => {
                    return (
                        typeof item === "string" &&
                        (item.startsWith("//") || item.startsWith("/*"))
                    );
                });
            }
        }
    }
    return false;
}

function printWithoutExtraParens(path, print, ...keys) {
    return path.call(
        (childPath) => unwrapParenthesizedExpression(childPath, print),
        ...keys
    );
}

function getBinaryOperatorInfo(operator) {
    return operator == undefined
        ? undefined
        : BINARY_OPERATOR_INFO.get(operator);
}

function shouldOmitSyntheticParens(path) {
    if (!path || typeof path.getValue !== "function") {
        return false;
    }

    const node = path.getValue();
    if (!node || node.type !== "ParenthesizedExpression") {
        return false;
    }

    // Only process synthetic parentheses for most cases
    const isSynthetic = node.synthetic === true;

    if (typeof path.getParentNode !== "function") {
        return false;
    }

    const parent = path.getParentNode();
    if (!parent) {
        return false;
    }

    // For ternary expressions, omit unnecessary parentheses around simple
    // identifiers or member expressions in the test position
    if (parent.type === "TernaryExpression") {
        const parentKey =
            typeof path.getName === "function" ? path.getName() : undefined;
        if (parentKey === "test") {
            const expression = node.expression;
            // Trim redundant parentheses when the ternary guard is just a bare
            // identifier or property lookup. The parser faithfully records the
            // author-supplied parens as a `ParenthesizedExpression`, so without
            // this branch the printer would emit `(foo) ?` style guards that look
            // like extra precedence handling. The formatter's ternary examples in
            // README.md#formatter-at-a-glance promise minimal grouping, and
            // teams lean on that contract when reviewing formatter diffs. We keep
            // the removal scoped to trivially safe shapes so we do not second-
            // guess parentheses that communicate evaluation order for compound
            // boolean logic or arithmetic.
            if (
                expression?.type === "Identifier" ||
                expression?.type === "MemberDotExpression" ||
                expression?.type === "MemberIndexExpression"
            ) {
                return true;
            }
        }
        return false;
    }

    // For non-ternary cases, only process synthetic parentheses
    if (!isSynthetic) {
        return false;
    }

    if (parent.type !== "BinaryExpression") {
        return false;
    }

    const expression = node.expression;
    if (!isSyntheticParenFlatteningEnabled(path)) {
        return false;
    }

    const parentInfo = getBinaryOperatorInfo(parent.operator);
    if (
        expression?.type === "BinaryExpression" &&
        shouldFlattenSyntheticBinary(parent, expression, path)
    ) {
        return true;
    }

    if (expression?.type === "BinaryExpression" && parentInfo != undefined) {
        const childInfo = getBinaryOperatorInfo(expression.operator);

        if (
            childInfo != undefined &&
            childInfo.precedence > parentInfo.precedence
        ) {
            if (
                (parent.operator === "&&" ||
                    parent.operator === "and" ||
                    parent.operator === "||" ||
                    parent.operator === "or") &&
                COMPARISON_OPERATORS.has(expression.operator) &&
                isControlFlowLogicalTest(path)
            ) {
                return true;
            }

            if (
                expression.operator === "*" &&
                isNumericComputationNode(expression)
            ) {
                return false;
            }
        }
    }

    if (parent.operator !== "+") {
        return false;
    }

    if (!binaryExpressionContainsString(parent)) {
        return false;
    }

    let depth = 1;
    while (true) {
        const ancestor =
            depth === 1 ? path.getParentNode() : path.getParentNode(depth - 1);
        if (!ancestor) {
            return false;
        }

        if (
            ancestor.type === "ParenthesizedExpression" &&
            ancestor.synthetic !== true
        ) {
            return true;
        }

        depth += 1;
    }
}

function isControlFlowLogicalTest(path) {
    if (!path || typeof path.getParentNode !== "function") {
        return false;
    }

    let depth = 1;
    let currentNode = path.getValue();

    while (true) {
        const ancestor =
            depth === 1 ? path.getParentNode() : path.getParentNode(depth - 1);

        if (!ancestor) {
            return false;
        }

        if (
            ancestor.type === "ParenthesizedExpression" ||
            ancestor.type === "BinaryExpression"
        ) {
            currentNode = ancestor;
            depth += 1;
            continue;
        }

        if (
            (ancestor.type === "IfStatement" &&
                ancestor.test === currentNode) ||
            (ancestor.type === "WhileStatement" &&
                ancestor.test === currentNode) ||
            (ancestor.type === "DoUntilStatement" &&
                ancestor.test === currentNode) ||
            (ancestor.type === "RepeatStatement" &&
                ancestor.test === currentNode) ||
            (ancestor.type === "WithStatement" &&
                ancestor.test === currentNode) ||
            (ancestor.type === "ForStatement" && ancestor.test === currentNode)
        ) {
            return true;
        }

        return false;
    }
}

function shouldWrapTernaryExpression(path) {
    if (!path || typeof path.getParentNode !== "function") {
        return false;
    }

    const parent = path.getParentNode();
    if (!parent) {
        return false;
    }

    if (parent.type === "ParenthesizedExpression") {
        return false;
    }

    const parentKey =
        typeof path.getName === "function" ? path.getName() : undefined;

    if (parent.type === "VariableDeclarator" && parentKey === "init") {
        return true;
    }

    if (parent.type === "AssignmentExpression" && parentKey === "right") {
        return true;
    }

    return false;
}

function shouldFlattenSyntheticBinary(parent, expression, path) {
    const parentInfo = getBinaryOperatorInfo(parent.operator);
    const childInfo = getBinaryOperatorInfo(expression.operator);

    if (!parentInfo || !childInfo) {
        return false;
    }

    if (parentInfo.associativity !== "left") {
        return false;
    }

    const parentOperator = parent.operator;
    const childOperator = expression.operator;
    const isAdditivePair =
        (parentOperator === "+" || parentOperator === "-") &&
        (childOperator === "+" || childOperator === "-");
    const isMultiplicativePair =
        parentOperator === "*" && childOperator === "*";
    const isLogicalAndPair =
        (parentOperator === "&&" || parentOperator === "and") &&
        (childOperator === "&&" || childOperator === "and");
    const isLogicalOrPair =
        (parentOperator === "||" || parentOperator === "or") &&
        (childOperator === "||" || childOperator === "or");

    if (
        !isAdditivePair &&
        !isMultiplicativePair &&
        !isLogicalAndPair &&
        !isLogicalOrPair
    ) {
        return false;
    }

    if (
        !isLogicalAndPair &&
        !isLogicalOrPair &&
        (!isNumericComputationNode(parent) ||
            !isNumericComputationNode(expression))
    ) {
        return false;
    }

    if (
        isAdditivePair &&
        (binaryExpressionContainsString(parent) ||
            binaryExpressionContainsString(expression))
    ) {
        return false;
    }

    if (isAdditivePair) {
        const sanitizedMacroNames = getSanitizedMacroNames(path);
        if (
            sanitizedMacroNames &&
            (expressionReferencesSanitizedMacro(parent, sanitizedMacroNames) ||
                expressionReferencesSanitizedMacro(
                    expression,
                    sanitizedMacroNames
                ))
        ) {
            return false;
        }
    }

    const operandName =
        typeof path.getName === "function" ? path.getName() : undefined;
    const isLeftOperand = operandName === "left";
    const isRightOperand = operandName === "right";

    if (!isLeftOperand && !isRightOperand) {
        return false;
    }

    if (childInfo.precedence !== parentInfo.precedence) {
        return false;
    }

    if (isLeftOperand) {
        return true;
    }

    if (
        parentOperator === "+" &&
        (childOperator === "+" || childOperator === "-")
    ) {
        return true;
    }

    if (parentOperator === "*" && childOperator === "*") {
        return true;
    }

    if (
        (parentOperator === "&&" || parentOperator === "and") &&
        (childOperator === "&&" || childOperator === "and")
    ) {
        return true;
    }

    if (
        (parentOperator === "||" || parentOperator === "or") &&
        (childOperator === "||" || childOperator === "or")
    ) {
        return true;
    }

    return false;
}

function isSyntheticParenFlatteningEnabled(path) {
    if (!path || typeof path.getParentNode !== "function") {
        return false;
    }

    let depth = 1;
    while (true) {
        const ancestor =
            depth === 1 ? path.getParentNode() : path.getParentNode(depth - 1);

        if (!ancestor) {
            return false;
        }

        if (
            ancestor.type === "FunctionDeclaration" ||
            ancestor.type === "ConstructorDeclaration"
        ) {
            if (ancestor._flattenSyntheticNumericParens === true) {
                return true;
            }
        } else if (ancestor.type === "Program") {
            return ancestor._flattenSyntheticNumericParens !== false;
        }

        depth += 1;
    }
}

// Synthetic parenthesis flattening only treats select call expressions as
// numeric so we avoid unwrapping macro invocations that expand to complex
// expressions. The list is intentionally small and can be extended as other
// numeric helpers require the same treatment.
const NUMERIC_CALL_IDENTIFIERS = new Set(["sqr"]);

function getSanitizedMacroNames(path) {
    if (!path || typeof path.getParentNode !== "function") {
        return null;
    }

    let depth = 1;
    while (true) {
        const ancestor =
            depth === 1 ? path.getParentNode() : path.getParentNode(depth - 1);

        if (!ancestor) {
            return null;
        }

        if (ancestor.type === "Program") {
            const { _featherSanitizedMacroNames: names } = ancestor;

            if (!names) {
                return null;
            }

            const registry = ensureSet(names);

            if (registry !== names) {
                ancestor._featherSanitizedMacroNames = registry;
            }

            return registry.size > 0 ? registry : null;
        }

        depth += 1;
    }
}

function expressionReferencesSanitizedMacro(node, sanitizedMacroNames) {
    if (!sanitizedMacroNames || sanitizedMacroNames.size === 0) {
        return false;
    }

    const stack = [node];

    while (stack.length > 0) {
        const current = stack.pop();

        if (!current || typeof current !== "object") {
            continue;
        }

        if (
            current.type === "Identifier" &&
            typeof current.name === "string" &&
            sanitizedMacroNames.has(current.name)
        ) {
            return true;
        }

        if (current.type === "CallExpression") {
            const calleeName = getIdentifierText(current.object);
            if (
                typeof calleeName === "string" &&
                sanitizedMacroNames.has(calleeName)
            ) {
                return true;
            }
        }

        for (const value of Object.values(current)) {
            if (!value || typeof value !== "object") {
                continue;
            }

            if (Array.isArray(value)) {
                for (const entry of value) {
                    if (entry && typeof entry === "object") {
                        stack.push(entry);
                    }
                }
                continue;
            }

            if (value.type) {
                stack.push(value);
            }
        }
    }

    return false;
}

function isNumericCallExpression(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    const calleeName = getIdentifierText(node.object);

    if (typeof calleeName !== "string") {
        return false;
    }

    return NUMERIC_CALL_IDENTIFIERS.has(calleeName.toLowerCase());
}

function isNumericComputationNode(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    switch (node.type) {
        case "Literal": {
            const value = toTrimmedString(node.value);
            if (value === "") {
                return false;
            }

            const numericValue = Number(value);
            return Number.isFinite(numericValue);
        }
        case "UnaryExpression": {
            if (node.operator === "+" || node.operator === "-") {
                return isNumericComputationNode(node.argument);
            }

            return false;
        }
        case "Identifier": {
            return true;
        }
        case "ParenthesizedExpression": {
            return isNumericComputationNode(node.expression);
        }
        case "BinaryExpression": {
            if (!isArithmeticBinaryOperator(node.operator)) {
                return false;
            }

            return (
                isNumericComputationNode(node.left) &&
                isNumericComputationNode(node.right)
            );
        }
        case "MemberIndexExpression": {
            return true;
        }
        case "MemberDotExpression": {
            return true;
        }
        case "CallExpression": {
            if (expressionIsStringLike(node)) {
                return false;
            }

            return true;
        }
        default: {
            return false;
        }
    }
}

function isArithmeticBinaryOperator(operator) {
    switch (operator) {
        case "+":
        case "-":
        case "*":
        case "/":
        case "div":
        case "%":
        case "mod": {
            return true;
        }
        default: {
            return false;
        }
    }
}

function binaryExpressionContainsString(node) {
    if (!node || node.type !== "BinaryExpression") {
        return false;
    }

    if (node.operator !== "+") {
        return false;
    }

    return (
        expressionIsStringLike(node.left) || expressionIsStringLike(node.right)
    );
}

function expressionIsStringLike(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    if (node.type === "Literal") {
        if (typeof node.value === "string" && /^\".*\"$/.test(node.value)) {
            return true;
        }

        return false;
    }

    if (node.type === "ParenthesizedExpression") {
        return expressionIsStringLike(node.expression);
    }

    if (node.type === "BinaryExpression" && node.operator === "+") {
        return (
            expressionIsStringLike(node.left) ||
            expressionIsStringLike(node.right)
        );
    }

    if (node.type === "CallExpression") {
        const calleeName = getIdentifierText(node.object);
        if (typeof calleeName === "string") {
            const normalized = calleeName.toLowerCase();
            if (normalized === "string" || normalized.startsWith("string_")) {
                return true;
            }
        }
    }

    return false;
}

const RADIAN_TRIG_TO_DEGREE = new Map([
    ["sin", "dsin"],
    ["cos", "dcos"],
    ["tan", "dtan"]
]);

const DEGREE_TO_RADIAN_CONVERSIONS = new Map([
    ["dsin", { name: "sin", expectedArgs: 1 }],
    ["dcos", { name: "cos", expectedArgs: 1 }],
    ["dtan", { name: "tan", expectedArgs: 1 }],
    ["darcsin", { name: "arcsin", expectedArgs: 1 }],
    ["darccos", { name: "arccos", expectedArgs: 1 }],
    ["darctan", { name: "arctan", expectedArgs: 1 }],
    ["darctan2", { name: "arctan2", expectedArgs: 2 }]
]);

const RADIAN_TO_DEGREE_CONVERSIONS = new Map([
    ["arcsin", { name: "darcsin", expectedArgs: 1 }],
    ["arccos", { name: "darccos", expectedArgs: 1 }],
    ["arctan", { name: "darctan", expectedArgs: 1 }],
    ["arctan2", { name: "darctan2", expectedArgs: 2 }]
]);

function buildLoopLengthDocs(path, print, hoistInfo) {
    const cachedLengthName = buildCachedSizeVariableName(
        hoistInfo.sizeIdentifierName,
        hoistInfo.cachedLengthSuffix
    );
    const loopSizeCallDoc = printWithoutExtraParens(
        path,
        print,
        "test",
        "right"
    );
    const iteratorDoc = printWithoutExtraParens(path, print, "test", "left");

    return {
        cachedLengthName,
        loopSizeCallDoc,
        iteratorDoc
    };
}

function unwrapParenthesizedExpression(childPath, print) {
    const childNode = childPath.getValue();
    if (childNode?.type === "ParenthesizedExpression") {
        return childPath.call(
            (innerPath) => unwrapParenthesizedExpression(innerPath, print),
            "expression"
        );
    }

    return print();
}

function getInnermostClauseExpression(node) {
    let current = node;

    while (current?.type === "ParenthesizedExpression") {
        current = current.expression;
    }

    return current;
}

function buildClauseGroup(doc) {
    return group([indent([ifBreak(line), doc]), ifBreak(line)]);
}

function wrapInClauseParens(path, print, clauseKey) {
    const clauseNode = path.getValue()?.[clauseKey];
    const clauseDoc = printWithoutExtraParens(path, print, clauseKey);

    const clauseExpressionNode = getInnermostClauseExpression(clauseNode);

    if (
        clauseExpressionNode?.type === "CallExpression" &&
        clauseExpressionNode.preserveOriginalCallText
    ) {
        return concat(["(", clauseDoc, ")"]);
    }

    return concat(["(", buildClauseGroup(clauseDoc), ")"]);
}

// prints any statement that matches the structure [keyword, clause, statement]
function printSingleClauseStatement(
    path,
    options,
    print,
    keyword,
    clauseKey,
    bodyKey
) {
    const node = path.getValue();
    const clauseNode = node?.[clauseKey];
    const clauseExpressionNode = getInnermostClauseExpression(clauseNode);
    const clauseDoc = wrapInClauseParens(path, print, clauseKey);
    const bodyNode = node?.[bodyKey];
    const allowSingleLineIfStatements =
        options?.allowSingleLineIfStatements ?? false;
    const clauseIsPreservedCall =
        clauseExpressionNode?.type === "CallExpression" &&
        clauseExpressionNode.preserveOriginalCallText === true;

    if (allowSingleLineIfStatements && bodyNode && !clauseIsPreservedCall) {
        let inlineReturnDoc = null;
        let inlineStatementType = null;

        const inlineableTypes = new Set(["ReturnStatement", "ExitStatement"]);

        if (inlineableTypes.has(bodyNode.type) && !hasComment(bodyNode)) {
            inlineReturnDoc = print(bodyKey);
            inlineStatementType = bodyNode.type;
        } else if (
            bodyNode.type === "BlockStatement" &&
            !hasComment(bodyNode) &&
            Array.isArray(bodyNode.body) &&
            bodyNode.body.length === 1
        ) {
            const [onlyStatement] = bodyNode.body;
            if (
                onlyStatement &&
                inlineableTypes.has(onlyStatement.type) &&
                !hasComment(onlyStatement)
            ) {
                const startLine = bodyNode.start?.line;
                const endLine = bodyNode.end?.line;
                const blockSource = getSourceTextForNode(bodyNode, options);
                const blockContainsSemicolon =
                    typeof blockSource === "string" &&
                    blockSource.includes(";");
                const canInlineBlock =
                    onlyStatement.type === "ExitStatement" ||
                    (startLine != undefined &&
                        endLine != undefined &&
                        startLine === endLine);

                if (blockContainsSemicolon && canInlineBlock) {
                    inlineReturnDoc = path.call(
                        (childPath) => childPath.call(print, "body", 0),
                        bodyKey
                    );
                    inlineStatementType = onlyStatement.type;
                }
            }
        }

        if (inlineReturnDoc) {
            return group([
                keyword,
                " ",
                clauseDoc,
                " { ",
                inlineReturnDoc,
                optionalSemicolon(inlineStatementType ?? "ReturnStatement"),
                " }"
            ]);
        }
    }

    return concat([
        keyword,
        " ",
        clauseDoc,
        " ",
        printInBlock(path, options, print, bodyKey)
    ]);
}

function printSimpleDeclaration(leftDoc, rightDoc) {
    return rightDoc ? [leftDoc, " = ", rightDoc] : leftDoc;
}

function resolveArgumentAliasInitializerDoc(path) {
    const node = path.getValue();
    if (!node || node.type !== "VariableDeclarator") {
        return null;
    }

    const initializer = node.init;
    if (!initializer || initializer.type !== "Identifier") {
        return null;
    }

    const match = ARGUMENT_IDENTIFIER_PATTERN.exec(initializer.name ?? "");
    if (!match) {
        return null;
    }

    const aliasIdentifier = node.id;
    if (!aliasIdentifier || aliasIdentifier.type !== "Identifier") {
        return null;
    }

    const aliasName = aliasIdentifier.name;
    if (!isNonEmptyString(aliasName)) {
        return null;
    }

    const argumentIndex = Number.parseInt(match[1], 10);
    if (!Number.isInteger(argumentIndex) || argumentIndex < 0) {
        return null;
    }

    const functionNode = findEnclosingFunctionForPath(path);
    if (!functionNode) {
        return null;
    }

    const docPreferences = preferredParamDocNamesByNode.get(functionNode);
    let parameterName = null;

    if (docPreferences && docPreferences.has(argumentIndex)) {
        const preferred = docPreferences.get(argumentIndex);
        if (isNonEmptyString(preferred)) {
            parameterName = preferred;
        }
    }

    if (!parameterName) {
        parameterName = getFunctionParameterNameByIndex(
            functionNode,
            argumentIndex
        );
    }

    if (
        !parameterName ||
        parameterName === aliasName ||
        parameterName === initializer.name
    ) {
        return null;
    }

    return parameterName;
}

function findEnclosingFunctionForPath(path) {
    if (!path || typeof path.getParentNode !== "function") {
        return null;
    }

    for (let depth = 0; ; depth += 1) {
        const parent =
            depth === 0 ? path.getParentNode() : path.getParentNode(depth);
        if (!parent) {
            break;
        }

        if (FUNCTION_LIKE_NODE_TYPES.has(parent.type)) {
            return parent;
        }
    }

    return null;
}

function getFunctionParameterNameByIndex(functionNode, index) {
    if (!functionNode || typeof functionNode !== "object") {
        return null;
    }

    const params = getFunctionParams(functionNode);

    if (!Number.isInteger(index) || index < 0 || index >= params.length) {
        return null;
    }

    const param = params[index];
    if (!param || typeof param !== "object") {
        return null;
    }

    if (param.type === "Identifier" && typeof param.name === "string") {
        return param.name;
    }

    if (
        param.type === "DefaultParameter" &&
        param.left?.type === "Identifier" &&
        typeof param.left.name === "string"
    ) {
        return param.left.name;
    }

    return null;
}

function getFunctionParams(functionNode) {
    if (!functionNode || typeof functionNode !== "object") {
        return [];
    }

    const { params } = functionNode;
    if (!Array.isArray(params)) {
        return [];
    }

    return params;
}

// prints empty parens with dangling comments
function printEmptyParens(path, _print, options) {
    const printed = group(
        [
            "(",
            indent([
                printDanglingCommentsAsGroup(
                    path,
                    options,
                    (comment) => !comment.attachToBrace
                )
            ]),
            ifBreak(line, "", { groupId: "emptyparen" }),
            ")"
        ],
        { id: "emptyparen" }
    );
    return printed;
}

// prints an empty block with dangling comments
function printEmptyBlock(path, options, print) {
    const node = path.getValue();
    const inlineCommentDoc = maybePrintInlineEmptyBlockComment(path, options);

    if (inlineCommentDoc) {
        return inlineCommentDoc;
    }

    const comments = getCommentArray(node);
    const hasPrintableComments = comments.some(isCommentNode);

    if (hasPrintableComments) {
        // an empty block with comments
        return [
            "{",
            printDanglingComments(
                path,
                options,
                (comment) => comment.attachToBrace
            ),
            printDanglingCommentsAsGroup(
                path,
                options,
                (comment) => !comment.attachToBrace
            ),
            hardline,
            "}"
        ];
    } else {
        return "{}";
    }
}

function maybePrintInlineEmptyBlockComment(path, options) {
    const node = path.getValue();
    if (!node) {
        return null;
    }

    const comments = getCommentArray(node);
    if (comments.length === 0) {
        return null;
    }

    const inlineIndex = findInlineBlockCommentIndex(comments);

    if (inlineIndex < 0) {
        return null;
    }

    const comment = comments[inlineIndex];
    const leadingSpacing = getInlineBlockCommentSpacing(comment.leadingWS, " ");
    const trailingSpacing = getInlineBlockCommentSpacing(
        comment.trailingWS,
        " "
    );

    return [
        "{",
        leadingSpacing,
        path.call(
            (commentPath) => printComment(commentPath, options),
            "comments",
            inlineIndex
        ),
        trailingSpacing,
        "}"
    ];
}

function findInlineBlockCommentIndex(comments) {
    let inlineIndex = -1;

    for (const [index, comment] of comments.entries()) {
        if (!isCommentNode(comment)) {
            continue;
        }

        if (!isInlineEmptyBlockComment(comment)) {
            return -1;
        }

        if (inlineIndex !== -1) {
            return -1;
        }

        inlineIndex = index;
    }

    return inlineIndex;
}

function isInlineEmptyBlockComment(comment) {
    if (!comment || comment.type !== "CommentBlock") {
        return false;
    }

    if (hasLineBreak(comment.leadingWS) || hasLineBreak(comment.trailingWS)) {
        return false;
    }

    if (typeof comment.lineCount === "number" && comment.lineCount > 1) {
        return false;
    }

    if (typeof comment.value === "string" && hasLineBreak(comment.value)) {
        return false;
    }

    return true;
}

function getInlineBlockCommentSpacing(text, fallback) {
    if (typeof text !== "string" || text.length === 0) {
        return fallback;
    }

    return hasLineBreak(text) ? fallback : text;
}

function hasLineBreak(text) {
    return typeof text === "string" && /[\r\n\u2028\u2029]/.test(text);
}

function isInLValueChain(path) {
    if (!path || typeof path.getParentNode !== "function") {
        return false;
    }

    const node = path.getValue();
    const parent = path.getParentNode();

    if (!parent || typeof parent.type !== "string") {
        return false;
    }

    if (
        parent.type === "CallExpression" &&
        Array.isArray(parent.arguments) &&
        parent.arguments.includes(node)
    ) {
        return false;
    }

    if (parent.type === "CallExpression" && parent.object === node) {
        const grandparent = path.getParentNode(1);

        if (!grandparent || typeof grandparent.type !== "string") {
            return false;
        }

        return isLValueExpression(grandparent.type);
    }

    return isLValueExpression(parent.type);
}

function isLValueExpression(nodeType) {
    return (
        nodeType === "MemberIndexExpression" ||
        nodeType === "CallExpression" ||
        nodeType === "MemberDotExpression"
    );
}
