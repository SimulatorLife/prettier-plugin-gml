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
    getArrayLengthHoistInfo,
    getSizeRetrievalFunctionSuffixes
} from "./optimizations/loop-size-hoisting.js";
import {
    printDanglingComments,
    printDanglingCommentsAsGroup
} from "./comments.js";
import {
    formatLineComment,
    normalizeDocCommentTypeAnnotations,
    isCommentNode
} from "./comment-utils.js";
import { resolveLineCommentOptions } from "./line-comment-options.js";
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

const LOGICAL_OPERATOR_STYLE_KEYWORDS = "keywords";
const LOGICAL_OPERATOR_STYLE_SYMBOLS = "symbols";

function resolveLogicalOperatorStyle(options) {
    const style = options?.logicalOperatorsStyle;

    if (style === LOGICAL_OPERATOR_STYLE_SYMBOLS) {
        return LOGICAL_OPERATOR_STYLE_SYMBOLS;
    }

    return LOGICAL_OPERATOR_STYLE_KEYWORDS;
}

function applyLogicalOperatorStyle(operator, style) {
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
                // don't add braces to else-if
                const elseBlock =
          node.alternate.type === "IfStatement"
              ? print("alternate")
              : printInBlock(path, options, print, "alternate");
                parts.push([" else ", elseBlock]);
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
                parts.push(["{", indent([path.map(print, "cases")]), hardline, "}"]);
            }
            return concat(parts);
        }
        case "SwitchCase": {
            const caseText = node.test !== null ? "case " : "default";
            const parts = [[hardline, caseText, print("test"), ":"]];
            const caseBody = node.body;
            if (Array.isArray(caseBody) && caseBody.length > 0) {
                parts.push([
                    indent([hardline, printStatements(path, options, print, "body")])
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
            const shouldHoistArrayLength = options?.optimizeArrayLengthLoops ?? true;
            const sizeFunctionSuffixes = shouldHoistArrayLength
                ? getSizeRetrievalFunctionSuffixes(options)
                : undefined;
            const hoistInfo = shouldHoistArrayLength
                ? getArrayLengthHoistInfo(path.getValue(), sizeFunctionSuffixes)
                : null;
            if (hoistInfo) {
                const { arrayLengthCallDoc, iteratorDoc, cachedLengthName } =
          buildArrayLengthDocs(path, print, hoistInfo);

                const initDoc = path.getValue().init ? print("init") : "";
                const updateDoc = path.getValue().update ? print("update") : "";
                const testDoc = concat([
                    iteratorDoc,
                    " ",
                    path.getValue().test.operator,
                    " ",
                    cachedLengthName
                ]);

                const needsHoistedSeparator = shouldInsertHoistedLoopSeparator(
                    path,
                    options
                );

                return concat([
                    group(["var ", cachedLengthName, " = ", arrayLengthCallDoc, ";"]),
                    hardline,
                    "for (",
                    group([
                        indent([
                            ifBreak(line),
                            concat([initDoc, ";", line, testDoc, ";", line, updateDoc])
                        ])
                    ]),
                    ") ",
                    printInBlock(path, options, print, "body"),
                    needsHoistedSeparator ? hardline : ""
                ]);
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

            if (Array.isArray(node.docComments) && node.docComments.length > 0) {
                const firstDocComment = node.docComments[0];
                if (firstDocComment && typeof firstDocComment.leadingWS === "string") {
                    const blankLinePattern =
            /(?:\r\n|\r|\n|\u2028|\u2029)\s*(?:\r\n|\r|\n|\u2028|\u2029)/;
                    if (blankLinePattern.test(firstDocComment.leadingWS)) {
                        needsLeadingBlankLine = true;
                    }
                }
                docCommentDocs = node.docComments
                    .map((comment) => formatLineComment(comment, lineCommentOptions))
                    .filter((text) => typeof text === "string" && text.trim() !== "");
            }

            if (
                shouldGenerateSyntheticDocForFunction(path, docCommentDocs, options)
            ) {
                docCommentDocs = mergeSyntheticDocComments(
                    node,
                    docCommentDocs,
                    options
                );
            }

            if (docCommentDocs.length > 0) {
                const suppressLeadingBlank =
          docCommentDocs && docCommentDocs._suppressLeadingBlank === true;

                if (needsLeadingBlankLine && !suppressLeadingBlank) {
                    parts.push(hardline);
                }
                parts.push(join(hardline, docCommentDocs));
                parts.push(hardline);
            }

            parts.push(["function", node.id ? " " : "", print("id")]);

            if (node.params.length > 0) {
                parts.push(
                    printCommaSeparatedList(path, print, "params", "(", ")", options, {
                        allowTrailingDelimiter: false
                    })
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
            return concat(printSimpleDeclaration(print("left"), print("right")));
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

            const keyword = typeof node.kind === "string" ? node.kind : "globalvar";

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
            const logicalOperatorStyle = resolveLogicalOperatorStyle(options);

            const leftIsUndefined = isUndefinedLiteral(node.left);
            const rightIsUndefined = isUndefinedLiteral(node.right);

            if (
                (operator === "==" || operator === "!=") &&
        (leftIsUndefined || rightIsUndefined)
            ) {
                const expressionDoc = leftIsUndefined
                    ? printWithoutExtraParens(path, print, "right")
                    : printWithoutExtraParens(path, print, "left");
                const prefix = operator === "!=" ? "!is_undefined(" : "is_undefined(";
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
                const styledOperator = applyLogicalOperatorStyle(
                    operator,
                    logicalOperatorStyle
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
                const maxParamsPerLine = Number.isFinite(options?.maxParamsPerLine)
                    ? options.maxParamsPerLine
                    : 0;
                const elementsPerLineLimit =
          maxParamsPerLine > 0 ? maxParamsPerLine : Infinity;

                const callbackArguments = node.arguments.filter(
                    (argument) => argument?.type === "FunctionDeclaration"
                );

                const shouldForceBreakArguments =
          (maxParamsPerLine > 0 && node.arguments.length > maxParamsPerLine) ||
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
              shouldUseCallbackLayout && !shouldForceBreakArguments
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
            if (isInLValueChain(path) && path.parent?.type === "CallExpression") {
                const objectNode = path.getValue()?.object;
                const shouldAllowBreakBeforeDot =
          objectNode &&
          (objectNode.type === "CallExpression" ||
            objectNode.type === "MemberDotExpression" ||
            objectNode.type === "MemberIndexExpression");

                if (shouldAllowBreakBeforeDot) {
                    return concat([print("object"), softline, ".", print("property")]);
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
            return concat([print("object"), accessor, group(indent(property)), "]"]);
        }
        case "StructExpression": {
            if (node.properties.length === 0) {
                return concat(printEmptyBlock(path, options, print));
            }
            return concat(
                printCommaSeparatedList(path, print, "properties", "{", "}", options, {
                    forceBreak: node.hasTrailingComma,
                    // TODO: decide whether to add bracket spacing for struct expressions
                    padding: ""
                })
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
                printCommaSeparatedList(path, print, "elements", "[", "]", options, {
                    allowTrailingDelimiter: allowTrailingComma,
                    forceBreak: allowTrailingComma && node.hasTrailingComma
                })
            );
        }
        case "EnumDeclaration": {
            if (Array.isArray(node.members) && node.members.length > 0) {
                const nameLengths = node.members.map((member) => {
                    const name = getNodeName(member.name);
                    return name ? name.length : 0;
                });
                const maxNameLength = Math.max(...nameLengths);
                const commentPadding = getEnumTrailingCommentPadding(options);
                node.members.forEach((member, index) => {
                    member._commentColumnTarget = maxNameLength + commentPadding;
                    member._hasTrailingComma = index !== node.members.length - 1;
                    member._nameLengthForAlignment = nameLengths[index];
                });
            }
            return concat([
                "enum ",
                print("name"),
                " ",
                printCommaSeparatedList(path, print, "members", "{", "}", options, {
                    forceBreak: node.hasTrailingComma
                })
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

            return options.originalText.slice(node.start.index, node.end.index + 1);
        }
        case "RegionStatement": {
            return concat(["#region", print("name")]);
        }
        case "EndRegionStatement": {
            return concat(["#endregion", print("name")]);
        }
        case "DefineStatement": {
            return concat(["#define", print("name")]);
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
            if (value.startsWith(".") && !value.startsWith("\"")) {
                value = "0" + value; // fix decimals without a leading 0
            }
            if (value.endsWith(".") && !value.endsWith("\"")) {
                value = value + "0"; // fix decimals without a trailing 0
            }
            return concat(value);
        }
        case "Identifier": {
            const prefix = shouldPrefixGlobalIdentifier(path) ? "global." : "";
            return concat([prefix, node.name]);
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
                    printCommaSeparatedList(path, print, "arguments", "(", ")", options)
                ];
            }
            return concat(["new ", print("expression"), ...argsPrinted]);
        }
        case "EnumMember": {
            if (Array.isArray(node.comments) && node.comments.length > 0) {
                const baseLength =
          (node._nameLengthForAlignment || 0) +
          (node._hasTrailingComma ? 1 : 0);
                const targetColumn = node._commentColumnTarget || 0;
                const padding = Math.max(targetColumn - baseLength - 1, 0);
                node.comments.forEach((comment) => {
                    if (
                        comment &&
            (comment.trailing || comment.placement === "endOfLine")
                    ) {
                        comment.inlinePadding = padding;
                    }
                });
            }
            return concat(
                printSimpleDeclaration(print("name"), print("initializer"))
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
            parts.push("$\"");
            node.atoms.forEach((atom, index) => {
                if (atom.type === "TemplateStringText") {
                    parts.push(atom.value);
                } else {
                    parts.push("{", path.map(print, "atoms")[index], "}");
                }
            });
            parts.push("\"");
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
            indent([hardline, print(expressionKey), optionalSemicolon(node.type)]),
            hardline,
            "}"
        ];
    } else {
        return [print(expressionKey), optionalSemicolon(node.type)];
    }
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
        isSkippableSemicolonWhitespace(textForSemicolons.charCodeAt(cursor))
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
            const nextLineEmpty = isNextLineEmpty(
                options.originalText,
                nodeEndIndex + 1
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
    let currentGroup = [];

    const flushGroup = () => {
        if (currentGroup.length === 0) {
            currentGroup = [];
            return;
        }

        const shouldAlign = minGroupSize > 0 && currentGroup.length >= minGroupSize;

        if (!shouldAlign) {
            currentGroup.forEach((node) => {
                node._alignAssignmentPadding = 0;
            });
        } else {
            const maxLength = Math.max(
                ...currentGroup.map((node) => node.left.name.length)
            );
            currentGroup.forEach((node) => {
                node._alignAssignmentPadding = maxLength - node.left.name.length;
            });
        }
        currentGroup = [];
    };

    for (const statement of statements) {
        if (isSimpleAssignment(statement)) {
            currentGroup.push(statement);
        } else {
            flushGroup();
        }
    }

    flushGroup();
}

function getAssignmentAlignmentMinimum(options) {
    return coercePositiveIntegerOption(options?.alignAssignmentsMinGroupSize, 3, {
        zeroReplacement: 0
    });
}

const DEFAULT_ENUM_TRAILING_COMMENT_PADDING = 2;

function getEnumTrailingCommentPadding(options) {
    return coercePositiveIntegerOption(
        options?.enumTrailingCommentPadding,
        DEFAULT_ENUM_TRAILING_COMMENT_PADDING,
        { zeroReplacement: 0 }
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
    if (!node || node.type !== "VariableDeclaration" || node.kind !== "static") {
        return null;
    }

    const declarator = getSingleVariableDeclarator(node);
    if (!declarator || declarator.id?.type !== "Identifier") {
        return null;
    }

    if (declarator.init?.type !== "FunctionDeclaration") {
        return null;
    }

    if (declarator.init.docComments && declarator.init.docComments.length > 0) {
        return null;
    }

    if (node.comments && node.comments.length > 0) {
        return null;
    }

    const name = declarator.id.name;
    const syntheticLines = computeSyntheticFunctionDocLines(
        declarator.init,
        [],
        options,
        { nameOverride: name }
    );

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
    while (lineEnd >= lineStart && isInlineWhitespace(text.charCodeAt(lineEnd))) {
        lineEnd--;
    }

    if (lineEnd < lineStart) {
        return false;
    }

    const first = text.charCodeAt(lineStart);
    const second = lineStart + 1 <= lineEnd ? text.charCodeAt(lineStart + 1) : -1;

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

function mergeSyntheticDocComments(node, existingDocLines, options) {
    const syntheticLines = computeSyntheticFunctionDocLines(
        node,
        existingDocLines,
        options
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

    const functionLines = syntheticLines.filter(isFunctionLine);
    let otherLines = syntheticLines.filter((line) => !isFunctionLine(line));

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

            if (canonical && paramLineIndices.has(canonical) && metadata?.name) {
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

    result = finalDocs;

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
    const documentedParamNames = new Set();

    for (const meta of metadata) {
        if (meta.tag !== "param") {
            continue;
        }

        const rawName = typeof meta.name === "string" ? meta.name : null;
        if (!rawName) {
            continue;
        }

        documentedParamNames.add(rawName);
    }

    const lines = [];
    const overrideName = overrides?.nameOverride;
    const functionName = overrideName ?? getNodeName(node);

    if (functionName && !hasFunctionTag) {
        lines.push(`/// @function ${functionName}`);
    }

    if (!Array.isArray(node.params)) {
        return lines;
    }

    for (const param of node.params) {
        const paramInfo = getParameterDocInfo(param, node, options);
        if (!paramInfo || !paramInfo.name) {
            continue;
        }
        const docName = paramInfo.optional ? `[${paramInfo.name}]` : paramInfo.name;
        if (documentedParamNames.has(docName)) {
            continue;
        }
        documentedParamNames.add(docName);
        lines.push(`/// @param ${docName}`);
    }

    return lines.map((line) => normalizeDocCommentTypeAnnotations(line));
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

        const paramMatch = paramSection.match(/^(\[[^\]]+\]|[^\s]+)/);
        const name = paramMatch ? paramMatch[1] : null;
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

    return concat(["return ", argumentDoc, optionalSemicolon("ReturnStatement")]);
}

function getBooleanReturnBranch(branchNode) {
    if (!branchNode || hasComment(branchNode)) {
        return null;
    }

    if (branchNode.type === "BlockStatement") {
        const statements = Array.isArray(branchNode.body) ? branchNode.body : [];
        if (statements.length !== 1) {
            return null;
        }

        const [onlyStatement] = statements;
        if (hasComment(onlyStatement) || onlyStatement.type !== "ReturnStatement") {
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

    const innerArgs = Array.isArray(firstArg.arguments) ? firstArg.arguments : [];
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

function shouldInsertHoistedLoopSeparator(path, options) {
    if (typeof path?.getValue !== "function") {
        return false;
    }

    const node = path.getValue();
    if (node?.type !== "ForStatement") {
        return false;
    }

    if (typeof path.getParentNode !== "function") {
        return false;
    }

    const parent = path.getParentNode();
    if (!parent) {
        return false;
    }

    // The printer calls this helper while iterating over statement lists, so
    // avoid allocating intermediate arrays via `Object.values` + `Array.find`.
    // A manual property scan lets us bail as soon as the matching list is
    // located while also reusing the index we compute for the adjacency check.
    let siblingList = null;
    let nodeIndex = -1;

    for (const key in parent) {
        if (!Object.hasOwn(parent, key)) {
            continue;
        }

        const value = parent[key];
        if (!Array.isArray(value)) {
            continue;
        }

        for (let index = 0; index < value.length; index += 1) {
            if (value[index] === node) {
                siblingList = value;
                nodeIndex = index;
                break;
            }
        }

        if (siblingList) {
            break;
        }
    }

    if (!siblingList) {
        return false;
    }

    const nextNode = siblingList[nodeIndex + 1];
    if (nextNode?.type !== "ForStatement") {
        return false;
    }

    return options?.optimizeArrayLengthLoops ?? true;
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

function buildArrayLengthDocs(path, print, hoistInfo) {
    const cachedLengthName = buildCachedSizeVariableName(
        hoistInfo.sizeIdentifierName,
        hoistInfo.cachedLengthSuffix
    );
    const arrayLengthCallDoc = printWithoutExtraParens(
        path,
        print,
        "test",
        "right"
    );
    const iteratorDoc = printWithoutExtraParens(path, print, "test", "left");

    return {
        cachedLengthName,
        arrayLengthCallDoc,
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

    if (
        allowSingleLineIfStatements &&
    bodyNode &&
    bodyNode.type === "ReturnStatement"
    ) {
        return group([
            keyword,
            " ",
            clauseDoc,
            " { ",
            print(bodyKey),
            optionalSemicolon(bodyNode.type),
            " }"
        ]);
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
function printEmptyParens(path, options) {
    const printed = group(
        [
            "(",
            indent([
                printDanglingCommentsAsGroup(
                    path,
                    options,
                    true,
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
    const comments = Array.isArray(node?.comments) ? node.comments : [];
    const hasPrintableComments = comments.some(isCommentNode);

    if (hasPrintableComments) {
    // an empty block with comments
        return [
            "{",
            printDanglingComments(path, options, (comment) => comment.attachToBrace),
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
