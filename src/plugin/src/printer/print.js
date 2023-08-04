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
    shouldAddNewlinesAroundStatement
} from "./util.js";

import {
    printDanglingComments,
    printDanglingCommentsAsGroup
} from "./comments.js";

export function print(path, options, print) {
    const node = path.getValue();

    if (!node) {
        return "";
    }

    if (typeof node === "string") {
        return node;
    }

    switch (node.type) {
        case "Program": {
            if (node.body.length === 0) {
                return printDanglingComments(path, options, true);
            }
            return printStatements(path, options, print, "body");
        }
        case "BlockStatement": {
            if (node.body.length === 0) {
                return printEmptyBlock(path, options, print);
            }

            return [
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
            ];
        }
        case "IfStatement": {
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
            return parts;
        }
        case "SwitchStatement": {
            const parts = [];
            parts.push([
                "switch (",
                group([indent([ifBreak(line), print("discriminant")]), ifBreak(line)]),
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
            return parts;
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
            return parts;
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
            return [
                "for (",
                group([
                    indent([
                        ifBreak(line),
                        join([";", line], [print("init"), print("test"), print("update")])
                    ]),
                    line
                ]),
                ") ",
                printInBlock(path, options, print, "body")
            ];
        }
        case "DoUntilStatement": {
            return [
                "do ",
                printInBlock(path, options, print, "body"),
                " until (",
                group([indent([ifBreak(line), print("test")]), ifBreak(line)]),
                ") "
            ];
        }
        case "WhileStatement": {
            return printSingleClauseStatement(path, options, print, "while", "test", "body");
        }
        case "RepeatStatement": {
            return printSingleClauseStatement(path, options, print, "repeat", "test", "body");
        }
        case "WithStatement": {
            return printSingleClauseStatement(path, options, print, "with", "test", "body");
        }
        case "FunctionDeclaration":
        case "ConstructorDeclaration": {
            const parts = [];
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
                parts.push(print("parent"));
            }

            parts.push(" ");
            parts.push(printInBlock(path, options, print, "body"));
            return parts;
        }
        case "ConstructorParentClause": {
            let params;
            if (node.params.length > 0) {
                params = printDelimitedList(path, print, "params", "(", ")", {
                    delimiter: ",",
                    allowTrailingDelimiter: false
                });
            } else {
                params = printEmptyParens(path, print, options);
            }
            return [
                " : ",
                print("id"),
                params,
                " constructor"
            ];
        }
        case "DefaultParameter": {
            return printSimpleDeclaration(print("left"), print("right"));
        }
        case "AssignmentExpression": {
            return group([
                group(print("left")),
                " ",
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
                    allowTrailingDelimiter: false,
                    leadingNewline: false,
                    trailingNewline: false
                });
            } else {
                decls = path.map(print, "declarations");
            }
            return [node.kind, " ", decls];
        }
        case "VariableDeclarator": {
            return printSimpleDeclaration(print("id"), print("init"));
        }
        case "BinaryExpression": {
            return group([
                print("left"),
                " ",
                group([node.operator, line, print("right")])
            ]);
        }
        case "IncDecStatement":
        case "UnaryExpression": {
            if (node.prefix) {
                return [node.operator, print("argument")];
            } else {
                return [print("argument"), node.operator];
            }
        }
        case "CallExpression": {
            let printedArgs = [];

            if (node.arguments.length === 0) {
                printedArgs = printEmptyParens(path, print, options);
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
                    allowTrailingDelimiter: false,
                    leadingNewline: false,
                    trailingNewline: false
                });

                let optionB = printDelimitedList(path, print, "arguments", "(", ")", {
                    delimiter: ",",
                    allowTrailingDelimiter: false
                });

                printedArgs = conditionalGroup([optionA, optionB]);
            } else {
                printedArgs = printDelimitedList(path, print, "arguments", "(", ")", {
                    delimiter: ",",
                    allowTrailingDelimiter: false
                });
            }

            if (isInLValueChain(path)) {
                return [print("object"), printedArgs];
            } else {
                return group([indent(print("object")), printedArgs]);
            }
        }
        case "MemberDotExpression": {
            if (isInLValueChain(path)) {
                if (path.parent?.type === "CallExpression") {
                // this dot expression is part of a call expression, so add a line break
                    return [
                        print("object"),
                        softline,
                        ".",
                        print("property")
                    ];
                } else {
                    return [
                        print("object"),
                        ".",
                        print("property")
                    ];
                }
            } else {
                const printed = [
                    group(indent(print("object"))),
                    ".",
                    print("property")
                ];
                return printed;
            }
        }
        case "MemberIndexExpression": {
            let accessor = print("accessor");
            if (accessor.length > 1) {
                accessor += " ";
            }
            let property = print("property");
            if (property === undefined) {
                property = printDelimitedList(path, print, "property", "", "", {
                    delimiter: ",",
                    allowTrailingDelimiter: false
                });
            }
            return [
                print("object"),
                accessor,
                group(indent(property)),
                "]"
            ];
        }
        case "StructExpression": {
            if (node.properties.length === 0) {
                return printEmptyBlock(path, options, print);
            }
            return printDelimitedList(path, print, "properties", "{", "}", {
                delimiter: ",",
                allowTrailingDelimiter: true,
                forceBreak: node.hasTrailingComma,
                // TODO: decide whether to add bracket spacing for struct expressions
                padding: ""
            });
        }
        case "Property": {
            return [print("name"), ": ", print("value")];
        }
        case "ArrayExpression": {
            return printDelimitedList(path, print, "elements", "[", "]", {
                delimiter: ",",
                allowTrailingDelimiter: true,
                forceBreak: node.hasTrailingComma
            });
        }
        case "EnumDeclaration": {
            return [
                "enum ",
                printDelimitedList(path, print, "members", "{", "}", {
                    delimiter: ",",
                    allowTrailingDelimiter: true,
                    forceBreak: node.hasTrailingComma
                //padding: " "
                })
            ];
        }
        case "ReturnStatement": {
            if (node.argument) {
                return ["return ", print("argument")];
            } else {
                return "return";
            }
        }
        case "ThrowStatement": {
            if (node.argument) {
                return ["throw ", print("argument")];
            } else {
                return "throw";
            }
        }
        case "MacroDeclaration": {
        // can't touch this
            return options.originalText.slice(node.start.index, node.end.index + 1);
        }
        case "RegionStatement": {
            return ["#region", print("name")];
        }
        case "EndRegionStatement": {
            return ["#endregion", print("name")];
        }
        case "DefineStatement": {
            return ["#define", print("name")];
        }
        case "DeleteStatement": {
            return ["delete ", print("argument")];
        }
        case "BreakStatement": {
            return "break";
        }
        case "ExitStatement": {
            return "exit";
        }
        case "ContinueStatement": {
            return "continue";
        }
        case "EmptyStatement": {
            return "";
        }
        case "Literal": {
            let value = node.value;
            if (value.startsWith('.') && !value.startsWith('"')) {
                value = '0' + value;  // fix decimals without a leading 0
            }
            return value;
        }
        case "Identifier": {
            return node.name;
        }
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
        allowTrailingDelimiter = true,
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
        const separator = (index !== finalIndex) ? delimiter : "";

        if (docHasTrailingComment(printed)) {
            printed.splice(printed.length - 1, 0, separator);
            parts.push(printed);
        } else {
            parts.push(printed);
            parts.push(separator);
        }

        if (index !== finalIndex) {
            parts.push(lineBreak);
        }

        return parts;
    }, listKey);
}

// variation of printElements that handles semicolons and line breaks in a program or block
function printStatements(path, options, print, childrenAttribute) {
    let precedingBlankLineExists = true;
    return path.map((childPath, index) => {
        const parts = [];
        const node = childPath.getValue();
        const isTopLevel = childPath.parent?.type === "Program";
        const printed = print();
        const semi = optionalSemicolon(node.type);

        const addNewlinePadding = shouldAddNewlinesAroundStatement(node, options) && isTopLevel;
        if (addNewlinePadding && !precedingBlankLineExists) {
            parts.push(hardline);
        }
        precedingBlankLineExists = false;

        if (docHasTrailingComment(printed)) {
            printed.splice(printed.length - 1, 0, semi);
            parts.push(printed);
        } else {
            parts.push(printed);
            parts.push(semi);
        }

        if (!isLastStatement(childPath)) {
            parts.push(hardline);
            if (isNextLineEmpty(options.originalText, node.end.index + 1)) {
                parts.push(hardline);
                precedingBlankLineExists = true;
            }
        } else if (isTopLevel) {
            parts.push(hardline);
        }

        return parts;
    }, childrenAttribute);
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

// prints any statement that matches the structure [keyword, clause, statement]
function printSingleClauseStatement(path, options, print, keyword, clauseKey, bodyKey) {
    return [
        keyword, " (",
        group([indent([ifBreak(line), print(clauseKey)]), ifBreak(line)]),
        ") ",
        printInBlock(path, options, print, bodyKey)
    ];
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