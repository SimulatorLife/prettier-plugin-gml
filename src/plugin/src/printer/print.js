import { builders } from "prettier/doc";
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
    concat
} = builders;

import {
    isLastStatement,
    optionalSemicolon,
    isNextLineEmpty,
    isPreviousLineEmpty,
    shouldAddNewlinesAroundStatement,
    hasComment
} from "./util.js";
import {
    buildCachedSizeVariableName,
    getLoopLengthHoistInfo,
    getSizeRetrievalFunctionSuffixes
} from "./optimizations/loop-size-hoisting.js";
import {
    getEnumMemberCommentPadding,
    getEnumNameAlignmentPadding,
    prepareEnumMembersForPrinting
} from "./enum-alignment.js";
import {
    printDanglingComments,
    printDanglingCommentsAsGroup
} from "./comments.js";
import {
    formatLineComment,
    normalizeDocCommentTypeAnnotations
} from "../comments/line-comment-formatting.js";
import {
    getTrailingCommentPadding,
    resolveLineCommentOptions
} from "../options/line-comment-options.js";
import { getCommentArray, isCommentNode } from "../../../shared/comments.js";
import { coercePositiveIntegerOption } from "./option-utils.js";
import {
    getNodeStartIndex,
    getNodeEndIndex
} from "../../../shared/ast-locations.js";
import {
    getIdentifierText,
    getSingleVariableDeclarator,
    isUndefinedLiteral
} from "../../../shared/ast-node-helpers.js";
import { maybeReportIdentifierCaseDryRun } from "../reporting/identifier-case-report.js";
import {
    prepareIdentifierCasePlan,
    getIdentifierCaseRenameForNode
} from "../identifier-case/local-plan.js";

const LOGICAL_OPERATOR_STYLE_KEYWORDS = "keywords";
const LOGICAL_OPERATOR_STYLE_SYMBOLS = "symbols";
const preservedUndefinedDefaultParameters = new WeakSet();

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

function resolvelogicalOperatorsStyle(options) {
    const style = options?.logicalOperatorsStyle;

    if (style === LOGICAL_OPERATOR_STYLE_SYMBOLS) {
        return LOGICAL_OPERATOR_STYLE_SYMBOLS;
    }

    return LOGICAL_OPERATOR_STYLE_KEYWORDS;
}

function applylogicalOperatorsStyle(operator, style) {
    if (operator === "&&") {
        return style === LOGICAL_OPERATOR_STYLE_KEYWORDS ? "and" : "&&";
    }

    if (operator === "||") {
        return style === LOGICAL_OPERATOR_STYLE_KEYWORDS ? "or" : "||";
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
            prepareIdentifierCasePlan(options);
            maybeReportIdentifierCaseDryRun(options);
            if (node.body.length === 0) {
                return concat(printDanglingCommentsAsGroup(path, options));
            }
            return concat(printStatements(path, options, print, "body"));
        }
        case "BlockStatement": {
            if (node.body.length === 0) {
                return concat(printEmptyBlock(path, options, print));
            }

            return concat([
                "{",
                printDanglingComments(
                    path,
                    options,
                    (comment) => comment.attachToBrace
                ),
                indent([
                    hardline, // the first statement of a non-empty block must begin on its own line.
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
            const parts = [];
            parts.push(
                printSingleClauseStatement(
                    path,
                    options,
                    print,
                    "if",
                    "test",
                    "consequent"
                )
            );

            if (node.alternate != null) {
                const alternateNode = node.alternate;

                let elseDoc;
                if (alternateNode.type === "IfStatement") {
                    // don't add braces to else-if chains
                    elseDoc = print("alternate");
                } else if (shouldPrintBlockAlternateAsElseIf(alternateNode)) {
                    elseDoc = path.call(
                        (alternatePath) => alternatePath.call(print, "body", 0),
                        "alternate"
                    );
                } else {
                    elseDoc = printInBlock(path, options, print, "alternate");
                }

                parts.push([" else ", elseDoc]);
            }
            return concat(parts);
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
            const caseText = node.test !== null ? "case " : "default";
            const parts = [[hardline, caseText, print("test"), ":"]];
            const caseBody = node.body;
            if (Array.isArray(caseBody) && caseBody.length > 0) {
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
            return group([
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

            let docCommentDocs = [];
            const lineCommentOptions = resolveLineCommentOptions(options);
            let needsLeadingBlankLine = false;

            if (
                Array.isArray(node.docComments) &&
                node.docComments.length > 0
            ) {
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
                        (text) =>
                            typeof text === "string" && text.trim() !== ""
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
            }

            if (docCommentDocs.length > 0) {
                const suppressLeadingBlank =
                    docCommentDocs &&
                    docCommentDocs._suppressLeadingBlank === true;

                if (needsLeadingBlankLine && !suppressLeadingBlank) {
                    parts.push(hardline);
                }
                parts.push(join(hardline, docCommentDocs));
                parts.push(hardline);
            }

            parts.push(["function", node.id ? " " : "", print("id")]);

            if (node.params.length > 0) {
                parts.push(
                    printCommaSeparatedList(
                        path,
                        print,
                        "params",
                        "(",
                        ")",
                        options,
                        {
                            allowTrailingDelimiter: false
                        }
                    )
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

            parts.push(" ");
            parts.push(printInBlock(path, options, print, "body"));
            return concat(parts);
        }
        case "ConstructorParentClause": {
            let params;
            if (node.params.length > 0) {
                params = printCommaSeparatedList(
                    path,
                    print,
                    "params",
                    "(",
                    ")",
                    options
                );
            } else {
                params = printEmptyParens(path, print, options);
            }
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
        case "AssignmentExpression": {
            const padding =
                node.operator === "=" &&
                typeof node._alignAssignmentPadding === "number"
                    ? Math.max(0, node._alignAssignmentPadding)
                    : 0;
            const spacing = " ".repeat(padding + 1);

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
            if (node.declarations.length > 1) {
                decls = printCommaSeparatedList(
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
                );
            } else {
                decls = path.map(print, "declarations");
            }

            const keyword =
                typeof node.kind === "string" ? node.kind : "globalvar";

            return concat([keyword, " ", decls]);
        }
        case "VariableDeclaration": {
            let decls = [];
            if (node.declarations.length > 1) {
                decls = printCommaSeparatedList(
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
                );
            } else {
                decls = path.map(print, "declarations");
            }
            return concat([node.kind, " ", decls]);
        }
        case "VariableDeclarator": {
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
            const logicalOperatorsStyle = resolvelogicalOperatorsStyle(options);

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
                const styledOperator = applylogicalOperatorsStyle(
                    operator,
                    logicalOperatorsStyle
                );

                if (styledOperator !== operator) {
                    operator = styledOperator;
                } else if (operator === "%") {
                    operator = "mod";
                } else if (operator === "^^") {
                    operator = "xor";
                } else if (operator === "<>") {
                    operator = "!=";
                }
            }

            return group([left, " ", group([operator, line, right])]);
        }
        case "UnaryExpression":
        case "IncDecStatement":
        case "IncDecExpression":
            if (node.prefix) {
                return concat([node.operator, print("argument")]);
            } else {
                return concat([print("argument"), node.operator]);
            }
        case "CallExpression": {
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

                const shouldForceBreakArguments =
                    (maxParamsPerLine > 0 &&
                        node.arguments.length > maxParamsPerLine) ||
                    callbackArguments.length > 1;

                const shouldUseCallbackLayout = [
                    node.arguments[0],
                    node.arguments[node.arguments.length - 1]
                ].some(
                    (argumentNode) =>
                        argumentNode?.type === "FunctionDeclaration" ||
                        argumentNode?.type === "StructExpression"
                );

                const { inlineDoc, multilineDoc } = buildCallArgumentsDocs(
                    path,
                    print,
                    options,
                    {
                        forceBreak: shouldForceBreakArguments,
                        maxElementsPerLine: elementsPerLineLimit,
                        includeInlineVariant:
                            shouldUseCallbackLayout &&
                            !shouldForceBreakArguments
                    }
                );

                if (shouldUseCallbackLayout) {
                    printedArgs = shouldForceBreakArguments
                        ? [concat([breakParent, multilineDoc])]
                        : [conditionalGroup([inlineDoc, multilineDoc])];
                } else {
                    printedArgs = shouldForceBreakArguments
                        ? [concat([breakParent, multilineDoc])]
                        : [multilineDoc];
                }
            }

            if (isInLValueChain(path)) {
                return concat([print("object"), ...printedArgs]);
            } else {
                return group([indent(print("object")), ...printedArgs]);
            }
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
                let property = print("property");
                if (property === undefined) {
                    property = printCommaSeparatedList(
                        path,
                        print,
                        "property",
                        "",
                        "",
                        options
                    );
                }
                return concat([print("object"), ".", group(indent(property))]);
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
            return concat(
                printCommaSeparatedList(
                    path,
                    print,
                    "properties",
                    "{",
                    "}",
                    options,
                    {
                        forceBreak: node.hasTrailingComma,
                        // TODO: decide whether to add bracket spacing for struct expressions
                        padding: ""
                    }
                )
            );
        }
        case "Property": {
            const originalPrefix = getStructPropertyPrefix(node, options);
            if (originalPrefix) {
                return concat([originalPrefix, print("value")]);
            }

            return concat([print("name"), ": ", print("value")]);
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
            prepareEnumMembersForPrinting(
                node.members,
                getTrailingCommentPadding(options),
                getNodeName
            );
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
            if (node.argument) {
                return concat(["return ", print("argument")]);
            } else {
                return concat("return");
            }
        }
        case "ThrowStatement": {
            if (node.argument) {
                return concat(["throw ", print("argument")]);
            } else {
                return "throw";
            }
        }
        case "MacroDeclaration": {
            if (typeof node._featherMacroText === "string") {
                return concat(node._featherMacroText);
            }

            return options.originalText.slice(
                node.start.index,
                node.end.index + 1
            );
        }
        case "RegionStatement": {
            return concat(["#region", print("name")]);
        }
        case "EndRegionStatement": {
            return concat(["#endregion", print("name")]);
        }
        case "DefineStatement": {
            // GameMaker Studio has historically supported both `#define` and
            // `#macro` directives. The formatter normalises legacy `#define`
            // entries to the modern `#macro` spelling so that the generated
            // output matches GameMaker's current syntax expectations and the
            // existing golden fixtures. Preserve the original spacing and
            // payload by reusing the captured `name` token text.
            return concat(["#macro", print("name")]);
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
            // TODO add option to allow missing trailing/leading zeroes
            let value = node.value;
            if (value.startsWith(".") && !value.startsWith('"')) {
                value = "0" + value; // fix decimals without a leading 0
            }
            if (value.endsWith(".") && !value.endsWith('"')) {
                value = value + "0"; // fix decimals without a trailing 0
            }
            return concat(value);
        }
        case "Identifier": {
            const prefix = shouldPrefixGlobalIdentifier(path) ? "global." : "";
            const renamed = getIdentifierCaseRenameForNode(node, options);
            const shouldApplyRename =
                options?.__identifierCaseDryRun === false &&
                typeof renamed === "string" &&
                renamed.length > 0;
            const identifierName = shouldApplyRename ? renamed : node.name;
            return concat([prefix, identifierName]);
        }
        case "TemplateStringText": {
            return concat(node.value);
        }
        case "MissingOptionalArgument": {
            return concat("undefined"); // TODO: Add plugin option to choose undefined or just empty comma
        }
        case "NewExpression": {
            let argsPrinted;
            if (node.arguments.length === 0) {
                argsPrinted = [printEmptyParens(path, print, options)];
            } else {
                argsPrinted = [
                    printCommaSeparatedList(
                        path,
                        print,
                        "arguments",
                        "(",
                        ")",
                        options
                    )
                ];
            }
            return concat(["new ", print("expression"), ...argsPrinted]);
        }
        case "EnumMember": {
            const comments = getCommentArray(node);
            if (comments.length > 0) {
                const padding = getEnumMemberCommentPadding(node);
                comments.forEach((comment) => {
                    if (
                        comment &&
                        (comment.trailing || comment.placement === "endOfLine")
                    ) {
                        comment.inlinePadding = padding;
                    }
                });
            }
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
            const parts = [];
            parts.push('$"');
            node.atoms.forEach((atom, index) => {
                if (atom.type === "TemplateStringText") {
                    parts.push(atom.value);
                } else {
                    parts.push("{", path.map(print, "atoms")[index], "}");
                }
            });
            parts.push('"');
            return concat(parts);
        }
        default:
            console.warn(
                "Print.js:print encountered unhandled node type: " + node.type,
                node
            );
    }
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
        groupId = undefined,
        forceInline = false,
        maxElementsPerLine = Infinity
    } = delimiterOptions
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

    if (forceInline) {
        return groupElementsNoBreak;
    } else {
        return group(groupElements, { groupId });
    }
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
        includeInlineVariant = false
    } = {}
) {
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
        overrides.allowTrailingDelimiter !== undefined
            ? overrides.allowTrailingDelimiter
            : shouldAllowTrailingComma(options);

    return printDelimitedList(path, print, listKey, startChar, endChar, {
        delimiter: ",",
        ...overrides,
        allowTrailingDelimiter
    });
}

// wrap a statement in a block if it's not already a block
function printInBlock(path, options, print, expressionKey) {
    const node = path.getValue()[expressionKey];
    if (node.type !== "BlockStatement") {
        return [
            "{",
            indent([
                hardline,
                print(expressionKey),
                optionalSemicolon(node.type)
            ]),
            hardline,
            "}"
        ];
    } else {
        return [print(expressionKey), optionalSemicolon(node.type)];
    }
}

function shouldPrintBlockAlternateAsElseIf(node) {
    if (!node || node.type !== "BlockStatement") {
        return false;
    }

    if (hasComment(node)) {
        return false;
    }

    const body = Array.isArray(node.body) ? node.body : [];
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
        const separator = index !== finalIndex ? delimiter : "";

        if (docHasTrailingComment(printed)) {
            printed.splice(printed.length - 1, 0, separator);
            parts.push(printed);
        } else {
            parts.push(printed);
            parts.push(separator);
        }

        if (index !== finalIndex) {
            const hasLimit =
                Number.isFinite(maxElementsPerLine) && maxElementsPerLine > 0;
            itemsSinceLastBreak += 1;
            if (hasLimit) {
                const childNode = childPath.getValue();
                const shouldBreakAfter =
                    isComplexArgumentNode(childNode) ||
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

// variation of printElements that handles semicolons and line breaks in a program or block
function shouldSuppressEmptyLineBetween(previousNode, nextNode) {
    if (!previousNode || !nextNode) {
        return false;
    }

    if (
        previousNode.type === "MacroDeclaration" &&
        nextNode.type === "MacroDeclaration"
    ) {
        return true;
    }

    return false;
}

function printStatements(path, options, print, childrenAttribute) {
    let previousNodeHadNewlineAddedAfter = false; // tracks newline added after the previous node

    const parentNode = path.getValue();
    const statements =
        parentNode && Array.isArray(parentNode[childrenAttribute])
            ? parentNode[childrenAttribute]
            : null;
    if (statements) {
        applyAssignmentAlignment(statements, options);
    }

    const syntheticDocByNode = new Map();
    if (statements) {
        for (const statement of statements) {
            const docComment = getSyntheticDocCommentForStaticVariable(
                statement,
                options
            );
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

        if (printed == null) {
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

        const syntheticDocComment = syntheticDocByNode.get(node);
        if (syntheticDocComment) {
            parts.push(syntheticDocComment);
            parts.push(hardline);
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

        const shouldOmitSemicolon =
            semi === ";" &&
            !hasTerminatingSemicolon &&
            syntheticDocComment &&
            isLastStatement(childPath);

        if (shouldOmitSemicolon) {
            semi = "";
        }

        // Print the statement
        if (docHasTrailingComment(printed)) {
            printed.splice(printed.length - 1, 0, semi);
            parts.push(printed);
        } else {
            parts.push(printed);
            parts.push(semi);
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
            const shouldSkipStandardHardline =
                shouldSuppressExtraEmptyLine &&
                node?.type === "MacroDeclaration";

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

            const nextLineEmpty = isNextLineEmpty(
                options.originalText,
                nextLineProbeIndex
            );

            if (currentNodeRequiresNewline && !nextLineEmpty) {
                parts.push(hardline);
                previousNodeHadNewlineAddedAfter = true;
            } else if (
                nextLineEmpty &&
                !nextHasSyntheticDoc &&
                !shouldSuppressExtraEmptyLine
            ) {
                parts.push(hardline);
            }
        } else if (isTopLevel) {
            parts.push(hardline);
        }

        return parts;
    }, childrenAttribute);
}

function applyAssignmentAlignment(statements, options) {
    const minGroupSize = getAssignmentAlignmentMinimum(options);
    /** @type {Array<{ node: any, nameLength: number }>} */
    const currentGroup = [];
    // Tracking the longest identifier as we build the group avoids mapping over
    // the nodes and spreading into Math.max during every flush. This helper
    // runs in tight printer loops, so staying allocation-free keeps it cheap.
    let currentGroupMaxLength = 0;

    const resetGroup = () => {
        currentGroup.length = 0;
        currentGroupMaxLength = 0;
    };

    const flushGroup = () => {
        if (currentGroup.length === 0) {
            resetGroup();
            return;
        }

        const meetsAlignmentThreshold =
            minGroupSize > 0 && currentGroup.length >= minGroupSize;

        if (!meetsAlignmentThreshold) {
            for (const { node } of currentGroup) {
                node._alignAssignmentPadding = 0;
            }
            resetGroup();
            return;
        }

        const targetLength = currentGroupMaxLength;
        for (const { node, nameLength } of currentGroup) {
            node._alignAssignmentPadding = targetLength - nameLength;
        }

        resetGroup();
    };

    for (const statement of statements) {
        if (isSimpleAssignment(statement)) {
            const nameLength = statement.left.name.length;
            currentGroup.push({ node: statement, nameLength });
            if (nameLength > currentGroupMaxLength) {
                currentGroupMaxLength = nameLength;
            }
        } else {
            flushGroup();
        }
    }

    flushGroup();
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

    const rawComments = getCommentArray(node);
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

    if (existingDocLines.length > 0) {
        node.comments = remainingComments;
    }

    if (hasFunctionDoc && existingDocLines.length === 0) {
        return null;
    }

    const name = declarator.id.name;
    const syntheticLines =
        existingDocLines.length > 0
            ? mergeSyntheticDocComments(
                declarator.init,
                existingDocLines,
                options,
                { nameOverride: name }
            )
            : computeSyntheticFunctionDocLines(declarator.init, [], options, {
                nameOverride: name
            });

    if (syntheticLines.length === 0) {
        return null;
    }

    return concat([hardline, join(hardline, syntheticLines)]);
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
        case 160: // non-breaking space
        case 0x2028: // line separator
        case 0x2029: // paragraph separator
            return true;
        default:
            return false;
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

function mergeSyntheticDocComments(
    node,
    existingDocLines,
    options,
    overrides = {}
) {
    const syntheticLines = computeSyntheticFunctionDocLines(
        node,
        existingDocLines,
        options,
        overrides
    );

    if (syntheticLines.length === 0) {
        return existingDocLines;
    }

    if (existingDocLines.length === 0) {
        return syntheticLines;
    }

    const isFunctionLine = (line) =>
        typeof line === "string" && /^\/\/\/\s*@function\b/i.test(line.trim());
    const isParamLine = (line) =>
        typeof line === "string" && /^\/\/\/\s*@param\b/i.test(line.trim());

    const isDescriptionLine = (line) =>
        typeof line === "string" &&
        /^\/\/\/\s*@description\b/i.test(line.trim());

    const functionLines = syntheticLines.filter(isFunctionLine);
    let otherLines = syntheticLines.filter((line) => !isFunctionLine(line));
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

    let mergedLines = existingDocLines.slice();
    let removedAnyLine = false;

    if (functionLines.length > 0) {
        const existingFunctionIndices = mergedLines
            .map((line, index) => (isFunctionLine(line) ? index : -1))
            .filter((index) => index !== -1);

        if (existingFunctionIndices.length > 0) {
            const [firstIndex, ...duplicateIndices] = existingFunctionIndices;
            mergedLines = mergedLines.slice();

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

    const paramLineIndices = new Map();
    mergedLines.forEach((line, index) => {
        if (!isParamLine(line)) {
            return;
        }

        const canonical = getParamCanonicalName(line);
        if (canonical) {
            paramLineIndices.set(canonical, index);
        }
    });

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
            .filter((name) => typeof name === "string" && name.length > 0)
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

    const findLastFunctionIndex = () => {
        for (let index = mergedLines.length - 1; index >= 0; index -= 1) {
            if (isFunctionLine(mergedLines[index])) {
                return index;
            }
        }
        return -1;
    };

    const lastFunctionIndex = findLastFunctionIndex();
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

    const orderedParamDocs = [];
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

    for (const doc of paramDocsByCanonical.values()) {
        orderedParamDocs.push(doc);
    }

    const finalDocs = [];
    let insertedParams = false;

    for (const line of result) {
        if (typeof line === "string" && isParamLine(line)) {
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

        let lastParamIndex = -1;
        for (let index = 0; index < docsWithoutDescription.length; index += 1) {
            if (
                typeof docsWithoutDescription[index] === "string" &&
                isParamLine(docsWithoutDescription[index])
            ) {
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

    reorderedDocs = reorderedDocs.map((line) => {
        if (!isParamLine(line) || typeof line !== "string") {
            return line;
        }

        const match = line.match(
            /^(\/\/\/\s*@param\s*)(\{[^}]*\}\s*)?(\S+)(.*)$/i
        );
        if (!match) {
            return normalizeDocCommentTypeAnnotations(line);
        }

        const [, prefix, rawTypeSection = "", rawName = "", remainder = ""] =
            match;
        let normalizedTypeSection = rawTypeSection.trim();
        if (
            normalizedTypeSection.startsWith("{") &&
            normalizedTypeSection.endsWith("}")
        ) {
            const innerType = normalizedTypeSection.slice(
                1,
                normalizedTypeSection.length - 1
            );
            const normalizedInner = innerType.replace(/\|/g, ",");
            normalizedTypeSection = `{${normalizedInner}}`;
        }
        const typePart =
            normalizedTypeSection.length > 0 ? `${normalizedTypeSection} ` : "";
        const normalizedName = rawName.trim();
        const remainderText = remainder.trim();
        const hasDescription = remainderText.length > 0;
        const normalizedDescription = hasDescription
            ? remainderText.replace(/^[-\s]+/, "")
            : "";
        const descriptionPart = hasDescription
            ? ` - ${normalizedDescription}`
            : "";

        const updatedLine = `${prefix}${typePart}${normalizedName}${descriptionPart}`;
        return normalizeDocCommentTypeAnnotations(updatedLine);
    });

    const wrappedDocs = [];
    const wrapWidth = 100;

    const wrapSegments = (text, available) => {
        if (available <= 0) {
            return [text];
        }

        const words = text.split(/\s+/).filter((word) => word.length > 0);
        if (words.length === 0) {
            return [];
        }

        const segments = [];
        let current = words[0];

        for (let index = 1; index < words.length; index += 1) {
            const word = words[index];
            if (current.length + 1 + word.length > available) {
                segments.push(current);
                current = word;
            } else {
                current += ` ${word}`;
            }
        }

        segments.push(current);
        return segments;
    };

    for (let index = 0; index < reorderedDocs.length; index += 1) {
        const line = reorderedDocs[index];
        if (typeof line === "string" && isDescriptionLine(line)) {
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
            const segments = wrapSegments(descriptionText, available);

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

    return result;
}

function getCanonicalParamNameFromText(name) {
    if (typeof name !== "string") {
        return null;
    }

    let trimmed = name.trim();
    const bracketMatch = trimmed.match(/^\[([^\]]+)]$/);
    if (bracketMatch) {
        trimmed = bracketMatch[1] ?? "";
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex !== -1) {
        trimmed = trimmed.slice(0, equalsIndex);
    }

    const normalized = normalizeDocMetadataName(trimmed.trim());
    return normalized && normalized.length > 0 ? normalized : null;
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
        ? existingDocLines.map(parseDocCommentMetadata).filter((meta) => meta)
        : [];

    const hasFunctionTag = metadata.some(
        (meta) =>
            meta.tag === "function" &&
            typeof meta.name === "string" &&
            meta.name.trim().length > 0
    );
    const hasReturnsTag = metadata.some((meta) => meta.tag === "returns");
    const documentedParamNames = new Set();
    const paramMetadataByCanonical = new Map();
    const overrideName = overrides?.nameOverride;
    const functionName = overrideName ?? getNodeName(node);

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

    const lines = [];

    if (functionName && !hasFunctionTag) {
        lines.push(`/// @function ${functionName}`);
    }

    const implicitArgumentDocNames = collectImplicitArgumentDocNames(
        node,
        options
    );

    if (!Array.isArray(node.params)) {
        for (const docName of implicitArgumentDocNames) {
            if (documentedParamNames.has(docName)) {
                continue;
            }

            documentedParamNames.add(docName);
            lines.push(`/// @param ${docName}`);
        }

        return maybeAppendReturnsDoc(lines, node, hasReturnsTag);
    }

    for (const param of node.params) {
        const paramInfo = getParameterDocInfo(param, node, options);
        if (!paramInfo || !paramInfo.name) {
            continue;
        }
        const canonicalParamName = getCanonicalParamNameFromText(
            paramInfo.name
        );
        const existingMetadata =
            canonicalParamName &&
            paramMetadataByCanonical.has(canonicalParamName)
                ? paramMetadataByCanonical.get(canonicalParamName)
                : null;
        const existingDocName = existingMetadata?.name;
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
        const docName = shouldMarkOptional
            ? `[${paramInfo.name}]`
            : paramInfo.name;

        if (documentedParamNames.has(docName)) {
            continue;
        }
        documentedParamNames.add(docName);
        lines.push(`/// @param ${docName}`);
    }

    for (const docName of implicitArgumentDocNames) {
        if (documentedParamNames.has(docName)) {
            continue;
        }

        documentedParamNames.add(docName);
        lines.push(`/// @param ${docName}`);
    }

    return maybeAppendReturnsDoc(lines, node, hasReturnsTag).map((line) =>
        normalizeDocCommentTypeAnnotations(line)
    );
}

function collectImplicitArgumentDocNames(functionNode, options) {
    if (
        !functionNode ||
        functionNode.type !== "FunctionDeclaration" ||
        options?.applyFeatherFixes !== true
    ) {
        return [];
    }

    const referencedIndices = new Set();
    const aliasByIndex = new Map();

    const visit = (node, parent) => {
        if (!node || typeof node !== "object") {
            return;
        }

        if (node === functionNode) {
            visit(functionNode.body, node);
            return;
        }

        if (Array.isArray(node)) {
            for (const child of node) {
                visit(child, parent);
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

        if (node.type === "VariableDeclarator") {
            const aliasIndex = getArgumentIndexFromNode(node.init);
            if (
                aliasIndex !== null &&
                node.id?.type === "Identifier" &&
                !aliasByIndex.has(aliasIndex)
            ) {
                const aliasName = normalizeDocMetadataName(node.id.name);
                if (typeof aliasName === "string" && aliasName.length > 0) {
                    aliasByIndex.set(aliasIndex, aliasName);
                }
            }
        }

        const directIndex = getArgumentIndexFromNode(node);
        if (directIndex !== null) {
            referencedIndices.add(directIndex);
        }

        for (const value of Object.values(node)) {
            if (!value || typeof value !== "object") {
                continue;
            }

            visit(value, node);
        }
    };

    visit(functionNode.body, functionNode);

    if (referencedIndices.size === 0) {
        return [];
    }

    const sortedIndices = [...referencedIndices].sort(
        (left, right) => left - right
    );
    return sortedIndices.map((index) => {
        const alias = aliasByIndex.get(index);
        return alias && alias.length > 0 ? alias : `argument${index}`;
    });
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

function maybeAppendReturnsDoc(lines, functionNode, hasReturnsTag) {
    if (!Array.isArray(lines)) {
        return [];
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
            case "FunctionExpression":
                continue;
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
            default:
                break;
        }

        for (const value of Object.values(current)) {
            if (!value || typeof value !== "object") {
                continue;
            }

            if (Array.isArray(value)) {
                for (let index = 0; index < value.length; index += 1) {
                    const child = value[index];
                    if (child && typeof child === "object") {
                        stack.push(child);
                    }
                }
                continue;
            }

            stack.push(value);
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
        return { tag, name };
    }

    return { tag, name: remainder };
}

function getSourceTextForNode(node, options) {
    if (!node || !options || typeof options.originalText !== "string") {
        return null;
    }

    const startIndex =
        typeof options.locStart === "function"
            ? options.locStart(node)
            : getNodeStartIndex(node);
    const endIndex =
        typeof options.locEnd === "function"
            ? options.locEnd(node)
            : getNodeEndIndex(node);

    if (typeof startIndex !== "number" || typeof endIndex !== "number") {
        return null;
    }

    if (endIndex <= startIndex) {
        return null;
    }

    return options.originalText.slice(startIndex, endIndex).trim();
}

function getStructPropertyPrefix(node, options) {
    if (!node || !options || typeof options.originalText !== "string") {
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

    const prefix = options.originalText.slice(propertyStart, valueStart);
    if (prefix.length === 0 || prefix.indexOf(":") === -1) {
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
    return typeof normalizedName === "string" && normalizedName.length > 0
        ? normalizedName
        : null;
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

        const optional = defaultIsUndefined
            ? !signatureOmitsUndefinedDefault
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

    const args = Array.isArray(node.arguments) ? node.arguments : [];
    if (args.length !== 1) {
        return false;
    }

    const [firstArg] = args;
    if (!isCallExpressionWithName(firstArg, "degtorad")) {
        return false;
    }

    if (hasComment(firstArg)) {
        return false;
    }

    const wrappedArgs = Array.isArray(firstArg.arguments)
        ? firstArg.arguments
        : [];
    if (wrappedArgs.length !== 1) {
        return false;
    }

    updateCallExpressionNameAndArgs(node, mapping, wrappedArgs);
    return true;
}

function applyOuterTrigConversion(node, conversionMap) {
    const args = Array.isArray(node.arguments) ? node.arguments : [];
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

    const innerArgs = Array.isArray(firstArg.arguments)
        ? firstArg.arguments
        : [];
    if (
        typeof mapping.expectedArgs === "number" &&
        innerArgs.length !== mapping.expectedArgs
    ) {
        return false;
    }

    updateCallExpressionNameAndArgs(node, mapping.name, innerArgs);
    return true;
}

function isCallExpressionWithName(node, name) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    const identifierName = getIdentifierText(node.object);
    if (!identifierName) {
        return false;
    }

    return identifierName.toLowerCase() === name;
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

    node.arguments = Array.isArray(newArgs) ? [...newArgs] : [];
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

function isBooleanLiteral(node) {
    return !!(
        node &&
        node.type === "Literal" &&
        typeof node.value === "string" &&
        (node.value.toLowerCase() === "true" ||
            node.value.toLowerCase() === "false")
    );
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
    if (!node || !parent || parent.type !== "Program") {
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
    for (let index = 0; index < siblingList.length; index += 1) {
        if (index === nodeIndex) {
            continue;
        }

        if (nodeDeclaresIdentifier(siblingList[index], cachedLengthName)) {
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
        return getIdentifierText(node.id);
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

    const sanitized = stripSyntheticParameterSentinels(name);
    return sanitized.length > 0 ? sanitized : name;
}

function docHasTrailingComment(doc) {
    if (Array.isArray(doc) && doc.length > 0) {
        const lastItem = doc[doc.length - 1];
        if (Array.isArray(lastItem) && lastItem.length > 0) {
            const commentArr = lastItem[0];
            if (Array.isArray(commentArr) && commentArr.length > 0) {
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
    return operator != null ? BINARY_OPERATOR_INFO.get(operator) : undefined;
}

function shouldOmitSyntheticParens(path) {
    if (!path || typeof path.getValue !== "function") {
        return false;
    }

    const node = path.getValue();
    if (
        !node ||
        node.type !== "ParenthesizedExpression" ||
        node.synthetic !== true
    ) {
        return false;
    }

    if (typeof path.getParentNode !== "function") {
        return false;
    }

    const parent = path.getParentNode();
    if (!parent || parent.type !== "BinaryExpression") {
        return false;
    }

    const expression = node.expression;
    const parentInfo = getBinaryOperatorInfo(parent.operator);
    if (
        expression?.type === "BinaryExpression" &&
        shouldFlattenSyntheticBinary(parent, expression, path)
    ) {
        return true;
    }

    if (expression?.type === "BinaryExpression" && parentInfo != null) {
        const childInfo = getBinaryOperatorInfo(expression.operator);

        if (
            childInfo != null &&
            childInfo.precedence > parentInfo.precedence &&
            expression.operator === "*" &&
            isNumericComputationNode(expression)
        ) {
            return true;
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

    if (!isAdditivePair && !isMultiplicativePair) {
        return false;
    }

    if (
        !isNumericComputationNode(parent) ||
        !isNumericComputationNode(expression)
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

    return false;
}

function isNumericComputationNode(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    switch (node.type) {
        case "Literal": {
            const value =
                typeof node.value === "string" ? node.value.trim() : "";
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
        case "MemberIndexExpression":
            return true;
        case "MemberDotExpression":
            return true;
        default:
            return false;
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
        case "mod":
            return true;
        default:
            return false;
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

function buildClauseGroup(doc) {
    return group([indent([ifBreak(line), doc]), ifBreak(line)]);
}

function wrapInClauseParens(path, print, clauseKey) {
    return concat([
        "(",
        buildClauseGroup(printWithoutExtraParens(path, print, clauseKey)),
        ")"
    ]);
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
    const clauseDoc = wrapInClauseParens(path, print, clauseKey);
    const node = path.getValue();
    const bodyNode = node?.[bodyKey];
    const allowSingleLineIfStatements =
        options?.allowSingleLineIfStatements ?? true;

    if (allowSingleLineIfStatements && bodyNode) {
        let inlineReturnDoc = null;

        if (bodyNode.type === "ReturnStatement" && !hasComment(bodyNode)) {
            inlineReturnDoc = print(bodyKey);
        } else if (
            bodyNode.type === "BlockStatement" &&
            !hasComment(bodyNode) &&
            Array.isArray(bodyNode.body) &&
            bodyNode.body.length === 1
        ) {
            const startLine = bodyNode.start?.line;
            const endLine = bodyNode.end?.line;
            if (startLine != null && endLine != null && startLine === endLine) {
                const [onlyStatement] = bodyNode.body;
                if (
                    onlyStatement?.type === "ReturnStatement" &&
                    !hasComment(onlyStatement)
                ) {
                    const blockSource = getSourceTextForNode(bodyNode, options);
                    const blockContainsSemicolon =
                        typeof blockSource === "string" &&
                        blockSource.includes(";");

                    if (blockContainsSemicolon) {
                        inlineReturnDoc = path.call(
                            (childPath) => childPath.call(print, "body", 0),
                            bodyKey
                        );
                    }
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
                optionalSemicolon("ReturnStatement"),
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
function printEmptyBlock(path, options) {
    const node = path.getValue();
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

function isInLValueChain(path) {
    const { node, parent } = path;
    if (
        parent.type === "CallExpression" &&
        parent.arguments.indexOf(node) !== -1
    ) {
        return false;
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
