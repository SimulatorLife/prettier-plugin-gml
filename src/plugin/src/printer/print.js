import { builders } from "prettier/doc";
import { util } from "prettier";

const {
    breakParent,
    join,
    line,
    lineSuffix,
    group,
    conditionalGroup,
    indent,
    dedent,
    ifBreak,
    hardline,
    softline,
    literalline,
    align,
    dedentToRoot,
    concat,
    indentIfBreak,
    lineSuffixBoundary
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
    printDanglingComments,
    printDanglingCommentsAsGroup,
    formatLineComment
} from "./comments.js";

export function print(path, options, print) {
    const node = path.getValue();

    if (!node) {
        return concat("");
    }

    if (typeof node === "string") {
        return concat(node);
    }

    preprocessFunctionArgumentDefaults(path);

    switch (node.type) {
        case "Program": {
            if (node.body.length === 0) {
                return concat(printDanglingComments(path, options, true));
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
                    true,
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
                printSingleClauseStatement(path, options, print, "if", "test", "consequent")
            );

            if (node.alternate != null) {
                // don't add braces to else-if
                const elseBlock =
                    node.alternate.type === "IfStatement"
                        ? print("alternate")
                        : printInBlock(path, options, print, "alternate");
                parts.push([
                    " else ",
                    elseBlock
                ]);
            }
            return concat(parts);
        }
        case "SwitchStatement": {
            const parts = [];
            const discriminantDoc = printWithoutExtraParens(path, print, "discriminant");
            parts.push([
                "switch (",
                buildClauseGroup(discriminantDoc),
                ") "
            ]);
            if (node.cases.length === 0) {
                parts.push(printEmptyBlock(path, options, print));
            } else {
                parts.push([
                    "{",
                    indent([
                        path.map(print, "cases")
                    ]),
                    hardline,
                    "}"
                ]);
            }
            return concat(parts);
        }
        case "SwitchCase": {
            const caseText = node.test !== null ? "case " : "default";
            const parts = [[hardline, caseText, print("test"), ":"]];
            if (node.consequent !== null) {
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
                    "? ", print("consequent"),
                    line,
                    ": ", print("alternate")
                ])
            ]);
        }
        case "ForStatement": {
            const shouldHoistArrayLength =
                options?.optimizeArrayLengthLoops ?? true;
            const hoistInfo = shouldHoistArrayLength
                ? getArrayLengthHoistInfo(path.getValue(), SIZE_RETRIEVAL_FUNCTION_SUFFIXES)
                : null;
            if (hoistInfo) {
                const { arrayLengthCallDoc, iteratorDoc, cachedLengthName } = buildArrayLengthDocs(
                    path,
                    print,
                    hoistInfo
                );

                const initDoc = path.getValue().init ? print("init") : "";
                const updateDoc = path.getValue().update ? print("update") : "";
                const testDoc = concat([
                    iteratorDoc,
                    " ",
                    path.getValue().test.operator,
                    " ",
                    cachedLengthName
                ]);

                return concat([
                    group([
                        "var ",
                        cachedLengthName,
                        " = ",
                        arrayLengthCallDoc,
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
                    printInBlock(path, options, print, "body")
                ]);
            }

            return concat([
                "for (",
                group([
                    indent([
                        ifBreak(line),
                        concat([print("init"), ";", line, print("test"), ";", line, print("update")])
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
                ") "
            ]);
        }
        case "WhileStatement": {
            return concat(printSingleClauseStatement(path, options, print, "while", "test", "body"));
        }
        case "RepeatStatement": {
            return concat(printSingleClauseStatement(path, options, print, "repeat", "test", "body"));
        }
        case "WithStatement": {
            return concat(printSingleClauseStatement(path, options, print, "with", "test", "body"));
        }
        case "FunctionDeclaration":
        case "ConstructorDeclaration": {
            const parts = [];

            let docCommentDocs = [];
            let needsLeadingBlankLine = false;

            if (Array.isArray(node.docComments) && node.docComments.length > 0) {
                const firstDocComment = node.docComments[0];
                if (firstDocComment && typeof firstDocComment.leadingWS === "string") {
                    const blankLinePattern = /(?:\r\n|\r|\n|\u2028|\u2029)\s*(?:\r\n|\r|\n|\u2028|\u2029)/;
                    if (blankLinePattern.test(firstDocComment.leadingWS)) {
                        needsLeadingBlankLine = true;
                    }
                }
                docCommentDocs = node.docComments
                    .map((comment) => formatLineComment(comment))
                    .filter((text) => typeof text === "string" && text.trim() !== "");
            }

            if (shouldGenerateSyntheticDocForFunction(path)) {
                docCommentDocs = mergeSyntheticDocComments(node, docCommentDocs, options);
            }

            if (docCommentDocs.length > 0) {
                if (needsLeadingBlankLine) {
                    parts.push(hardline);
                }
                parts.push(join(hardline, docCommentDocs));
                parts.push(hardline);
            }

            parts.push(["function", node.id ? " " : "", print("id")]);

            if (node.params.length > 0) {
                parts.push(
                    printDelimitedList(path, print, "params", "(", ")", {
                        delimiter: ",",
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
                params = printDelimitedList(path, print, "params", "(", ")", {
                    delimiter: ",",
                    allowTrailingDelimiter: options.trailingComma === "all"
                });
            } else {
                params = printEmptyParens(path, print, options);
            }
            return concat([
                " : ",
                print("id"),
                params,
                " constructor"
            ]);
        }
        case "DefaultParameter": {
            if (shouldOmitDefaultValueForParameter(path)) {
                return concat(print("left"));
            }
            return concat(printSimpleDeclaration(print("left"), print("right")));
        }
        case "AssignmentExpression": {
            const padding = node.operator === "=" && typeof node._alignAssignmentPadding === "number"
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
        case "GlobalVarStatement":
        case "VariableDeclaration": {
            let decls = [];
            if (node.declarations.length > 1) {
                decls = printDelimitedList(path, print, "declarations", "", "", {
                    delimiter: ",",
                    allowTrailingDelimiter: options.trailingComma === "all",
                    leadingNewline: false,
                    trailingNewline: false
                });
            } else {
                decls = path.map(print, "declarations");
            }
            return concat([node.kind, " ", decls]);
        }
        case "VariableDeclarator": {
            return concat(printSimpleDeclaration(print("id"), print("init")));
        }
        case "ParenthesizedExpression": {
            return concat(["(", printWithoutExtraParens(path, print, "expression"), ")"]);
        }
        case "BinaryExpression": {
            let left = print("left");
            let operator = node.operator;
            let right = print("right");

            const leftIsUndefined = isUndefinedLiteral(node.left);
            const rightIsUndefined = isUndefinedLiteral(node.right);

            if ((operator === "==" || operator === "!=") && (leftIsUndefined || rightIsUndefined)) {
                const expressionDoc = leftIsUndefined
                    ? printWithoutExtraParens(path, print, "right")
                    : printWithoutExtraParens(path, print, "left");
                const prefix = operator === "!=" ? "!is_undefined(" : "is_undefined(";
                return group([prefix, expressionDoc, ")"]);
            }

            const booleanSimplification = simplifyBooleanBinaryExpression(path, print, node);
            if (booleanSimplification) {
                return booleanSimplification;
            }

            // Check if the operator is division and the right-hand side is 2
            if (operator === "/" && node.right.value === "2") {
                operator = "*";
                right = "0.5";
            } else if (operator === "&&") { // TODO add option to specify if we want 'and' or '&&'
                operator = "and";
            } else if (operator === "||") {
                operator = "or";
            } else if (operator === "%") {
                operator = "mod";
            } else if (operator === "^^") {
                operator = "xor";
            } else if (operator === "<>") {
                operator = "!=";
            }

            return group([
                left,
                " ",
                group([operator, line, right])
            ]);
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
            } else if (
                [node.arguments[0], node.arguments[node.arguments.length - 1]].some(
                    (node) =>
                        node.type === "FunctionDeclaration" ||
                        node.type === "StructExpression"
                )
            ) {
                // treat this function like it has a callback
                let optionA = printDelimitedList(path, print, "arguments", "(", ")", {
                    addIndent: false,
                    forceInline: true,
                    delimiter: ",",
                    allowTrailingDelimiter: options.trailingComma === "all",
                    leadingNewline: false,
                    trailingNewline: false
                });
        
                let optionB = printDelimitedList(path, print, "arguments", "(", ")", {
                    delimiter: ",",
                    allowTrailingDelimiter: options.trailingComma === "all"
                });
        
                printedArgs = [conditionalGroup([optionA, optionB])];
            } else {
                printedArgs = [printDelimitedList(path, print, "arguments", "(", ")", {
                    delimiter: ",",
                    allowTrailingDelimiter: options.trailingComma === "all"
                })];
            }
        
            if (isInLValueChain(path)) {
                return concat([print("object"), ...printedArgs]);
            } else {
                return group([indent(print("object")), ...printedArgs]);
            }
        }                     
        case "MemberDotExpression": {
            // return [
            //     print("object"),
            //     ".",
            //     print("property")
            // ];
            if (isInLValueChain(path) && path.parent?.type === "CallExpression") {
                // this dot expression is part of a call expression, so add a line break
                return concat([
                    print("object"),
                    softline,
                    ".",
                    print("property")
                ]);
            } else {
                // return [
                //     print("object"),
                //     ".",
                //     print("property")
                // ];
                let property = print("property");
                if (property === undefined) {
                    property = printDelimitedList(path, print, "property", "", "", {
                        delimiter: ",",
                        allowTrailingDelimiter: options.trailingComma === "all"
                    });
                }
                return concat([
                    print("object"),
                    ".",
                    group(indent(property))
                ]);
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
            let property = printDelimitedList(path, print, "property", "", "", {
                delimiter: ",",
                allowTrailingDelimiter: options.trailingComma === "all"
            });            
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
            return concat(printDelimitedList(path, print, "properties", "{", "}", {
                delimiter: ",",
                allowTrailingDelimiter: options.trailingComma === "all",
                forceBreak: node.hasTrailingComma,
                // TODO: decide whether to add bracket spacing for struct expressions
                padding: ""
            }));
        }
        case "Property": {
            return concat([print("name"), ": ", print("value")]);
        }
        case "ArrayExpression": {
            const allowTrailingComma = options.trailingComma === "all";
            return concat(printDelimitedList(path, print, "elements", "[", "]", {
                delimiter: ",",
                allowTrailingDelimiter: allowTrailingComma,
                forceBreak: allowTrailingComma && node.hasTrailingComma
            }));
        }
        case "EnumDeclaration": {
            if (Array.isArray(node.members) && node.members.length > 0) {
                const nameLengths = node.members.map((member) => {
                    const name = getNodeName(member.name);
                    return name ? name.length : 0;
                });
                const maxNameLength = Math.max(...nameLengths);
                node.members.forEach((member, index) => {
                    member._commentColumnTarget = maxNameLength + 2;
                    member._hasTrailingComma = index !== node.members.length - 1;
                    member._nameLengthForAlignment = nameLengths[index];
                });
            }
            return concat([
                "enum ",
                print("name"),
                " ",
                printDelimitedList(path, print, "members", "{", "}", {
                    delimiter: ",",
                    allowTrailingDelimiter: options.trailingComma === "all",
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
        // can't touch this
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
        case "Literal": {  // TODO add option to allow missing trailing/leading zeroes
            let value = node.value;
            if (value.startsWith(".") && !value.startsWith("\"")) {
                value = "0" + value;  // fix decimals without a leading 0
            }
            if (value.endsWith(".") && !value.endsWith("\"")) {
                value = value + "0";  // fix decimals without a trailing 0
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
                argsPrinted = [printDelimitedList(path, print, "arguments", "(", ")", {
                    delimiter: ",",
                    allowTrailingDelimiter: options.trailingComma === "all"
                })];
            }
            return concat(["new ", print("expression"), ...argsPrinted]);
        }
        case "EnumMember": {
            if (Array.isArray(node.comments) && node.comments.length > 0) {
                const baseLength = (node._nameLengthForAlignment || 0) + (node._hasTrailingComma ? 1 : 0);
                const targetColumn = node._commentColumnTarget || 0;
                const padding = Math.max(targetColumn - baseLength - 1, 0);
                node.comments.forEach((comment) => {
                    if (comment && (comment.trailing || comment.placement === "endOfLine")) {
                        comment.inlinePadding = padding;
                    }
                });
            }
            return concat(printSimpleDeclaration(
                print("name"), print("initializer")
            ));
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
            console.warn("Print.js:print encountered unhandled node type: " + node.type, node);
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
        forceInline = false
    } = delimiterOptions
) {
    const lineBreak = forceBreak ? hardline : line;
    const finalDelimiter = allowTrailingDelimiter ? delimiter : "";

    const innerDoc = [
        ifBreak(leadingNewline ? lineBreak : "", padding),
        printElements(path, print, listKey, delimiter, lineBreak)
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
        printElements(path, print, listKey, delimiter, " "),
        padding,
        endChar
    ];

    if (forceInline) {
        return groupElementsNoBreak;
    } else {
        return group(groupElements, { groupId });
    }
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

// print a delimited sequence of elements
// handles the case where a trailing comment follows a delimiter
function printElements(path, print, listKey, delimiter, lineBreak) {
    const node = path.getValue();
    const finalIndex = node[listKey].length - 1;
    return path.map((childPath, index) => {
        const parts = [];
        const printed = print();
        const separator = (index !== finalIndex ? delimiter : "");

        if (docHasTrailingComment(printed)) {
            printed.splice(printed.length - 1, 0, separator);
            parts.push(printed);
        } else {
            parts.push(printed);
            parts.push(separator);
        }

        if (index !== finalIndex && ifBreak(lineBreak)) {
            parts.push(lineBreak);
        }

        return parts;
    }, listKey);
}

// variation of printElements that handles semicolons and line breaks in a program or block
function printStatements(path, options, print, childrenAttribute) {
    let previousNodeHadNewlineAddedAfter = false; // tracks newline added after the previous node
    let currentHadNewlineAddedBefore = false; // tracks newline added before the current node

    const parentNode = path.getValue();
    const statements = parentNode && Array.isArray(parentNode[childrenAttribute])
        ? parentNode[childrenAttribute]
        : null;
    if (statements) {
        applyAssignmentAlignment(statements);
    }

    const syntheticDocByNode = new Map();
    if (statements) {
        for (const statement of statements) {
            const docComment = getSyntheticDocCommentForStaticVariable(statement, options);
            if (docComment) {
                syntheticDocByNode.set(statement, docComment);
            }
        }
    }

    return path.map((childPath, index) => {
        const parts = [];
        const node = childPath.getValue();
        const isTopLevel = childPath.parent?.type === "Program";
        const printed = print();
        let semi = optionalSemicolon(node.type);
        const startProp = node?.start;
        const endProp = node?.end;
        const fallbackStart = typeof startProp === "number"
            ? startProp
            : (typeof startProp?.index === "number" ? startProp.index : 0);
        const fallbackEnd = typeof endProp === "number"
            ? endProp
            : (typeof endProp?.index === "number" ? endProp.index : fallbackStart);
        const nodeStartIndex = typeof options.locStart === "function"
            ? options.locStart(node)
            : fallbackStart;
        const nodeEndIndex = typeof options.locEnd === "function"
            ? options.locEnd(node) - 1
            : fallbackEnd;

        const currentNodeRequiresNewline = shouldAddNewlinesAroundStatement(node, options) && isTopLevel;

        // Reset flag for current node
        currentHadNewlineAddedBefore = false;

        // Check if a newline should be added BEFORE the statement
        if (currentNodeRequiresNewline && !previousNodeHadNewlineAddedAfter) {
            const hasLeadingComment = isTopLevel
                ? hasCommentImmediatelyBefore(options.originalText, nodeStartIndex)
                : false;

            if (isTopLevel &&
                !isPreviousLineEmpty(options.originalText, nodeStartIndex) &&
                !hasLeadingComment
            ) {
                parts.push(hardline);
                currentHadNewlineAddedBefore = true;
            }
        }

        const syntheticDocComment = syntheticDocByNode.get(node);
        if (syntheticDocComment) {
            parts.push(syntheticDocComment);
            parts.push(hardline);
            const originalText = options.originalText || "";
            let hasTerminatingSemicolon = originalText[nodeEndIndex] === ";";
            if (!hasTerminatingSemicolon) {
                let cursor = nodeEndIndex + 1;
                while (cursor < originalText.length && /\s/.test(originalText[cursor])) {
                    cursor++;
                }
                hasTerminatingSemicolon = originalText[cursor] === ";";
            }
            if (!hasTerminatingSemicolon && isLastStatement(childPath)) {
                semi = "";
            }
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
            parts.push(hardline);
            const nextNode = statements ? statements[index + 1] : null;
            const nextHasSyntheticDoc = nextNode ? syntheticDocByNode.has(nextNode) : false;
            const nextLineEmpty = isNextLineEmpty(options.originalText, nodeEndIndex + 1);

            if (currentNodeRequiresNewline && !nextLineEmpty) {
                parts.push(hardline);
                previousNodeHadNewlineAddedAfter = true;
            } else if (nextLineEmpty && !nextHasSyntheticDoc) {
                parts.push(hardline);
            }
        } else if (isTopLevel) {
            parts.push(hardline);
        }

        return parts;
    }, childrenAttribute);
}

function applyAssignmentAlignment(statements) {
    let currentGroup = [];

    const flushGroup = () => {
        if (currentGroup.length <= 1) {
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

    if (!Array.isArray(node.declarations) || node.declarations.length !== 1) {
        return null;
    }

    const declarator = node.declarations[0];
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

function hasCommentImmediatelyBefore(text, index) {
    if (!text || typeof index !== "number") {
        return false;
    }

    let cursor = index - 1;

    while (cursor >= 0 && /[\t \r\n]/.test(text[cursor])) {
        cursor--;
    }

    if (cursor < 0) {
        return false;
    }

    const lineEnd = cursor + 1;
    while (cursor >= 0 && text[cursor] !== "\n" && text[cursor] !== "\r") {
        cursor--;
    }

    const line = text.slice(cursor + 1, lineEnd).trim();

    if (line === "") {
        return false;
    }

    return (
        line.startsWith("//") ||
        line.startsWith("/*") ||
        line.startsWith("///") ||
        line.startsWith("*") ||
        line.endsWith("*/")
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

    const lastLine = existingDocLines[existingDocLines.length - 1];
    const needsSeparator =
        typeof lastLine === "string" &&
        lastLine.trim() !== "" &&
        !/^\/\/\/\s*@function\b/i.test(lastLine.trim());

    if (needsSeparator) {
        return [...existingDocLines, "", ...syntheticLines];
    }

    return [...existingDocLines, ...syntheticLines];
}

function computeSyntheticFunctionDocLines(node, existingDocLines, options, overrides = {}) {
    if (!node) {
        return [];
    }

    const metadata = Array.isArray(existingDocLines)
        ? existingDocLines
            .map(parseDocCommentMetadata)
            .filter((meta) => meta)
        : [];

    const hasFunctionTag = metadata.some((meta) => meta.tag === "function");
    const documentedParams = new Set(
        metadata
            .filter((meta) => meta.tag === "param")
            .map((meta) => meta.name)
            .filter((name) => typeof name === "string" && name.length > 0)
    );

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
        if (documentedParams.has(docName)) {
            continue;
        }
        documentedParams.add(docName);
        lines.push(`/// @param ${docName}`);
    }

    return lines;
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
        const paramMatch = remainder.match(/^(\[[^\]]+\]|[^\s]+)/);
        const name = paramMatch ? paramMatch[1] : null;
        return { tag, name };
    }

    return { tag, name: remainder };
}

function getSourceTextForNode(node, options) {
    if (!node || !options || typeof options.originalText !== "string") {
        return null;
    }

    const startIndex = typeof options.locStart === "function"
        ? options.locStart(node)
        : getNodeStartIndex(node);
    const endIndex = typeof options.locEnd === "function"
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

function getNodeStartIndex(node) {
    if (typeof node?.start === "number") {
        return node.start;
    }

    if (node?.start && typeof node.start.index === "number") {
        return node.start.index;
    }

    return null;
}

function getNodeEndIndex(node) {
    if (typeof node?.end === "number") {
        return node.end + 1;
    }

    if (node?.end && typeof node.end.index === "number") {
        return node.end.index + 1;
    }

    const startIndex = getNodeStartIndex(node);
    return typeof startIndex === "number" ? startIndex : null;
}

function getParameterDocInfo(paramNode, functionNode, options) {
    if (!paramNode) {
        return null;
    }

    if (paramNode.type === "Identifier") {
        const name = getIdentifierText(paramNode);
        return name ? { name, optional: false } : null;
    }

    if (paramNode.type === "DefaultParameter") {
        const name = getIdentifierText(paramNode.left);
        if (!name) {
            return null;
        }

        const defaultIsUndefined = isUndefinedLiteral(paramNode.right);
        const shouldOmitDefault = defaultIsUndefined && functionNode?.type === "FunctionDeclaration";
        const defaultText = !shouldOmitDefault ? getSourceTextForNode(paramNode.right, options) : null;
        const docName = defaultText ? `${name}=${defaultText}` : name;
        return {
            name: docName,
            optional: !shouldOmitDefault
        };
    }

    if (paramNode.type === "MissingOptionalArgument") {
        return null;
    }

    const fallbackName = getIdentifierText(paramNode);
    return fallbackName ? { name: fallbackName, optional: false } : null;
}

function shouldOmitDefaultValueForParameter(path) {
    const node = path.getValue();
    if (!node || node.type !== "DefaultParameter") {
        return false;
    }

    if (!isUndefinedLiteral(node.right)) {
        return false;
    }

    const parent = path.getParentNode();
    if (!parent) {
        return false;
    }

    return parent.type === "FunctionDeclaration";
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

    const argumentDoc = consequentReturn.value === "true"
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

    const wrappedArgs = Array.isArray(firstArg.arguments) ? firstArg.arguments : [];
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
    if (typeof mapping.expectedArgs === "number" && innerArgs.length !== mapping.expectedArgs) {
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
        (node.value.toLowerCase() === "true" || node.value.toLowerCase() === "false")
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

function shouldGenerateSyntheticDocForFunction(path) {
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

    const hasDocComments = Array.isArray(node.docComments) && node.docComments.length > 0;
    if (!hasDocComments) {
        return true;
    }

    return Array.isArray(node.params) && node.params.some((param) => {
        return param?.type === "DefaultParameter";
    });
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

function getIdentifierText(identifier) {
    if (!identifier) {
        return null;
    }

    if (typeof identifier === "string") {
        return identifier;
    }

    if (typeof identifier.name === "string") {
        return identifier.name;
    }

    return null;
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

function preprocessFunctionArgumentDefaults(path) {
    const node = path.getValue();

    if (!node || node.type !== "FunctionDeclaration") {
        return;
    }

    if (node._hasProcessedArgumentCountDefaults) {
        return;
    }

    node._hasProcessedArgumentCountDefaults = true;

    if (!Array.isArray(node.params) || node.params.length === 0) {
        return;
    }

    const body = node.body;
    if (!body || body.type !== "BlockStatement" || !Array.isArray(body.body) || body.body.length === 0) {
        return;
    }

    const paramInfoByName = new Map();
    node.params.forEach((param, index) => {
        if (!param || param.type !== "Identifier") {
            return;
        }

        const name = getIdentifierText(param);
        if (!name) {
            return;
        }

        paramInfoByName.set(name, { index, param });
    });

    if (paramInfoByName.size === 0) {
        return;
    }

    const statementsToRemove = new Set();

    for (const statement of body.body) {
        const match = matchArgumentCountFallbackStatement(statement);
        if (!match) {
            continue;
        }

        const paramInfo = paramInfoByName.get(match.targetName);
        if (!paramInfo) {
            continue;
        }

        if (match.argumentIndex !== paramInfo.index) {
            continue;
        }

        if (!match.fallbackExpression) {
            continue;
        }

        const currentParam = node.params[paramInfo.index];
        if (!currentParam || currentParam.type !== "Identifier") {
            continue;
        }

        node.params[paramInfo.index] = {
            type: "DefaultParameter",
            left: currentParam,
            right: match.fallbackExpression
        };

        statementsToRemove.add(match.statementNode);
        paramInfoByName.delete(match.targetName);
    }

    if (statementsToRemove.size === 0) {
        return;
    }

    body.body = body.body.filter((statement) => !statementsToRemove.has(statement));
}

function matchArgumentCountFallbackStatement(statement) {
    if (!statement) {
        return null;
    }

    if (statement.comments && statement.comments.length > 0) {
        return null;
    }

    if (statement.type === "VariableDeclaration") {
        return matchArgumentCountFallbackFromVariableDeclaration(statement);
    }

    if (statement.type === "IfStatement") {
        return matchArgumentCountFallbackFromIfStatement(statement);
    }

    return null;
}

function matchArgumentCountFallbackFromVariableDeclaration(node) {
    if (!node || node.type !== "VariableDeclaration") {
        return null;
    }

    if (node.kind !== "var") {
        return null;
    }

    if (!Array.isArray(node.declarations) || node.declarations.length !== 1) {
        return null;
    }

    const declarator = node.declarations[0];
    if (!declarator || declarator.type !== "VariableDeclarator") {
        return null;
    }

    if (declarator.comments && declarator.comments.length > 0) {
        return null;
    }

    if (!declarator.init || declarator.init.type !== "TernaryExpression") {
        return null;
    }

    const guard = parseArgumentCountGuard(declarator.init.test);
    if (!guard) {
        return null;
    }

    const consequentIsArgument = isArgumentArrayAccess(declarator.init.consequent, guard.argumentIndex);
    const alternateIsArgument = isArgumentArrayAccess(declarator.init.alternate, guard.argumentIndex);

    if (consequentIsArgument === alternateIsArgument) {
        return null;
    }

    const fallbackExpression = consequentIsArgument ? declarator.init.alternate : declarator.init.consequent;
    if (!fallbackExpression) {
        return null;
    }

    const targetName = getIdentifierText(declarator.id);
    if (!targetName) {
        return null;
    }

    return {
        targetName,
        fallbackExpression,
        argumentIndex: guard.argumentIndex,
        statementNode: node
    };
}

function matchArgumentCountFallbackFromIfStatement(node) {
    if (!node || node.type !== "IfStatement") {
        return null;
    }

    const guard = parseArgumentCountGuard(node.test);
    if (!guard) {
        return null;
    }

    const consequentAssignment = extractAssignmentFromStatement(node.consequent);
    const alternateAssignment = extractAssignmentFromStatement(node.alternate);

    if (!consequentAssignment || !alternateAssignment) {
        return null;
    }

    const consequentIsArgument = isArgumentArrayAccess(consequentAssignment.right, guard.argumentIndex);
    const alternateIsArgument = isArgumentArrayAccess(alternateAssignment.right, guard.argumentIndex);

    if (consequentIsArgument === alternateIsArgument) {
        return null;
    }

    const argumentAssignment = consequentIsArgument ? consequentAssignment : alternateAssignment;
    const fallbackAssignment = consequentIsArgument ? alternateAssignment : consequentAssignment;

    const targetName = getIdentifierText(argumentAssignment.left);
    const fallbackName = getIdentifierText(fallbackAssignment.left);

    if (!targetName || targetName !== fallbackName) {
        return null;
    }

    if (!fallbackAssignment.right) {
        return null;
    }

    return {
        targetName,
        fallbackExpression: fallbackAssignment.right,
        argumentIndex: guard.argumentIndex,
        statementNode: node
    };
}

function extractAssignmentFromStatement(statement) {
    if (!statement) {
        return null;
    }

    if (statement.comments && statement.comments.length > 0) {
        return null;
    }

    if (statement.type === "BlockStatement") {
        if (!Array.isArray(statement.body) || statement.body.length !== 1) {
            return null;
        }
        return extractAssignmentFromStatement(statement.body[0]);
    }

    if (statement.type !== "ExpressionStatement") {
        return null;
    }

    const expression = statement.expression;
    if (!expression || expression.type !== "AssignmentExpression") {
        return null;
    }

    if (expression.operator !== "=") {
        return null;
    }

    if (!expression.left || expression.left.type !== "Identifier") {
        return null;
    }

    return expression;
}

function parseArgumentCountGuard(node) {
    if (!node || node.type !== "BinaryExpression") {
        return null;
    }

    const left = node.left;
    if (!left || left.type !== "Identifier" || left.name !== "argument_count") {
        return null;
    }

    const rightIndex = parseArgumentIndexValue(node.right);
    if (rightIndex === null) {
        return null;
    }

    if (node.operator === ">") {
        return rightIndex >= 0 ? { argumentIndex: rightIndex } : null;
    }

    if (node.operator === ">=") {
        const adjusted = rightIndex - 1;
        return adjusted >= 0 ? { argumentIndex: adjusted } : null;
    }

    return null;
}

function parseArgumentIndexValue(node) {
    if (!node) {
        return null;
    }

    if (node.type === "Literal" && typeof node.value === "string") {
        const numeric = Number.parseInt(node.value, 10);
        if (!Number.isNaN(numeric)) {
            return numeric;
        }
    }

    return null;
}

function isArgumentArrayAccess(node, expectedIndex) {
    if (!node || node.type !== "MemberIndexExpression") {
        return false;
    }

    if (!node.object || node.object.type !== "Identifier" || node.object.name !== "argument") {
        return false;
    }

    if (!Array.isArray(node.property) || node.property.length !== 1) {
        return false;
    }

    const indexNode = node.property[0];
    const actualIndex = parseArgumentIndexValue(indexNode);
    if (actualIndex === null) {
        return false;
    }

    return actualIndex === expectedIndex;
}

function printWithoutExtraParens(path, print, ...keys) {
    return path.call(
        (childPath) => unwrapParenthesizedExpression(childPath, print),
        ...keys
    );
}

const SIZE_RETRIEVAL_FUNCTION_SUFFIXES = new Map([
    ["array_length", "len"],
    ["ds_list_size", "size"],
    ["ds_map_size", "size"],
    ["ds_grid_width", "width"],
    ["ds_grid_height", "height"],
]);

const RADIAN_TRIG_TO_DEGREE = new Map([
    ["sin", "dsin"],
    ["cos", "dcos"],
    ["tan", "dtan"],
]);

const DEGREE_TO_RADIAN_CONVERSIONS = new Map([
    ["dsin", { name: "sin", expectedArgs: 1 }],
    ["dcos", { name: "cos", expectedArgs: 1 }],
    ["dtan", { name: "tan", expectedArgs: 1 }],
    ["darcsin", { name: "arcsin", expectedArgs: 1 }],
    ["darccos", { name: "arccos", expectedArgs: 1 }],
    ["darctan", { name: "arctan", expectedArgs: 1 }],
    ["darctan2", { name: "arctan2", expectedArgs: 2 }],
]);

const RADIAN_TO_DEGREE_CONVERSIONS = new Map([
    ["arcsin", { name: "darcsin", expectedArgs: 1 }],
    ["arccos", { name: "darccos", expectedArgs: 1 }],
    ["arctan", { name: "darctan", expectedArgs: 1 }],
    ["arctan2", { name: "darctan2", expectedArgs: 2 }],
]);

function getArrayLengthHoistInfo(node, sizeFunctionSuffixes = SIZE_RETRIEVAL_FUNCTION_SUFFIXES) {
    if (!node || node.type !== "ForStatement") {
        return null;
    }

    const test = node.test;
    if (!test || test.type !== "BinaryExpression") {
        return null;
    }

    if (!test.operator || !["<", "<="].includes(test.operator)) {
        return null;
    }

    const callExpression = test.right;
    if (!callExpression || callExpression.type !== "CallExpression") {
        return null;
    }

    const callee = callExpression.object;
    if (!callee || callee.type !== "Identifier") {
        return null;
    }

    const functionName = (callee.name || "").toLowerCase();
    const cachedSuffix = sizeFunctionSuffixes.get(functionName);
    if (!cachedSuffix) {
        return null;
    }

    const args = Array.isArray(callExpression.arguments) ? callExpression.arguments : [];
    if (args.length !== 1) {
        return null;
    }

    const arrayIdentifier = args[0];
    const arrayIdentifierName = getIdentifierText(arrayIdentifier);
    if (!arrayIdentifier || !arrayIdentifierName) {
        return null;
    }

    const iterator = test.left;
    if (!iterator || iterator.type !== "Identifier" || !iterator.name) {
        return null;
    }

    const update = node.update;
    if (!update) {
        return null;
    }

    if (update.type === "IncDecStatement") {
        const argument = update.argument;
        if (!argument || argument.type !== "Identifier" || argument.name !== iterator.name) {
            return null;
        }
    } else if (update.type === "AssignmentExpression") {
        const left = update.left;
        if (!left || left.type !== "Identifier" || left.name !== iterator.name) {
            return null;
        }

        const allowedOperators = new Set(["+=", "-="]);
        if (!allowedOperators.has(update.operator)) {
            return null;
        }
    } else {
        return null;
    }

    return {
        iteratorName: iterator.name,
        sizeIdentifierName: arrayIdentifierName,
        cachedLengthSuffix: cachedSuffix
    };
}

function buildArrayLengthDocs(path, print, hoistInfo) {
    const cachedLengthName = buildCachedSizeVariableName(
        hoistInfo.sizeIdentifierName,
        hoistInfo.cachedLengthSuffix
    );
    const arrayLengthCallDoc = printWithoutExtraParens(path, print, "test", "right");
    const iteratorDoc = printWithoutExtraParens(path, print, "test", "left");

    return {
        cachedLengthName,
        arrayLengthCallDoc,
        iteratorDoc
    };
}

function buildCachedSizeVariableName(baseName, suffix) {
    const normalizedSuffix = suffix || "len";

    if (!baseName) {
        return `cached_${normalizedSuffix}`;
    }

    if (baseName.endsWith(`_${normalizedSuffix}`)) {
        return baseName;
    }

    return `${baseName}_${normalizedSuffix}`;
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

function isUndefinedLiteral(node) {
    return !!(
        node &&
        node.type === "Literal" &&
        typeof node.value === "string" &&
        node.value.toLowerCase() === "undefined"
    );
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
function printSingleClauseStatement(path, options, print, keyword, clauseKey, bodyKey) {
    const clauseDoc = wrapInClauseParens(path, print, clauseKey);
    const node = path.getValue();
    const bodyNode = node?.[bodyKey];

    if (bodyNode && bodyNode.type === "ReturnStatement") {
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

    return concat([keyword, " ", clauseDoc, " ", printInBlock(path, options, print, bodyKey)]);
}

function printSimpleDeclaration(leftDoc, rightDoc) {
    return rightDoc ? [leftDoc, " = ", rightDoc] : leftDoc;
}

// prints empty parens with dangling comments
function printEmptyParens(path, options, print) {
    const printed = group([
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
    ], { id: "emptyparen" });
    return printed;
}

// prints an empty block with dangling comments
function printEmptyBlock(path, options, print) {
    const node = path.getValue();
    if (node?.comments?.length > 0) {
        // an empty block with comments
        return [
            "{",
            printDanglingComments(
                path,
                options,
                true,
                (comment) => comment.attachToBrace
            ),
            printDanglingCommentsAsGroup(
                path,
                options,
                true,
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