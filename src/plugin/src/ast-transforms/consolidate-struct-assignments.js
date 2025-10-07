import { util as prettierUtil } from "prettier";
import { getNodeStartIndex, getNodeEndIndex } from "../../../shared/ast-locations.js";

const { addTrailingComment } = prettierUtil;

const STRUCT_EXPRESSION = "StructExpression";
const VARIABLE_DECLARATION = "VariableDeclaration";
const VARIABLE_DECLARATOR = "VariableDeclarator";
const ASSIGNMENT_EXPRESSION = "AssignmentExpression";
const MEMBER_DOT_EXPRESSION = "MemberDotExpression";
const MEMBER_INDEX_EXPRESSION = "MemberIndexExpression";
const IDENTIFIER = "Identifier";
const LITERAL = "Literal";

export function consolidateStructAssignments(ast) {
    if (!isNode(ast)) {
        return ast;
    }

    const tracker = new CommentTracker(Array.isArray(ast.comments) ? ast.comments : []);
    visit(ast, tracker);
    tracker.removeConsumedComments();
    return ast;
}

function visit(node, tracker) {
    if (!isNode(node)) {
        return;
    }

    if (Array.isArray(node)) {
        for (const item of node) {
            visit(item, tracker);
        }
        return;
    }

    if (Array.isArray(node.body)) {
        consolidateBlock(node.body, tracker);
        for (const child of node.body) {
            visit(child, tracker);
        }
    } else if (isNode(node.body)) {
        visit(node.body, tracker);
    }

    for (const [key, value] of Object.entries(node)) {
        if (key === "body" || key === "start" || key === "end" || key === "comments") {
            continue;
        }
        visit(value, tracker);
    }
}

function consolidateBlock(statements, tracker) {
    if (!Array.isArray(statements) || statements.length === 0) {
        return;
    }

    for (let index = 0; index < statements.length; index++) {
        const initializer = getStructInitializer(statements[index]);
        if (!initializer) {
            continue;
        }

        const { identifierName, structNode } = initializer;
        const structEndIndex = getNodeEndIndex(structNode);
        if (structEndIndex == null) {
            continue;
        }

        const initializerStart = getNodeStartIndex(statements[index]);
        const initializerEnd = getNodeEndIndex(statements[index]);
        if (tracker.hasBetween(initializerStart, initializerEnd)) {
            continue;
        }

        const collected = collectPropertyAssignments({
            statements,
            startIndex: index + 1,
            identifierName,
            previousEnd: structEndIndex,
            tracker
        });

        if (!collected) {
            continue;
        }

        structNode.properties = collected.properties;
        structNode.hasTrailingComma = collected.shouldForceBreak;

        statements.splice(index + 1, collected.count);
    }
}

function collectPropertyAssignments({ statements, startIndex, identifierName, previousEnd, tracker }) {
    const properties = [];
    let cursor = startIndex;
    let lastEnd = previousEnd;
    let previousStatement = null;
    let lastProperty = null;

    while (cursor < statements.length) {
        const statement = statements[cursor];
        if (!isPropertyAssignment(statement, identifierName)) {
            break;
        }

        const start = getNodeStartIndex(statement);
        const end = getNodeEndIndex(statement);
        if (start == null || end == null) {
            break;
        }

        if (!allowTrailingCommentsBetween({
            tracker,
            left: lastEnd,
            right: start,
            precedingStatement: previousStatement,
            precedingProperty: lastProperty
        })) {
            break;
        }

        if (tracker.hasBetween(start, end)) {
            break;
        }

        const property = buildPropertyFromAssignment(statement, identifierName);
        if (!property) {
            break;
        }

        const nextStatement = statements[cursor + 1];
        const nextStart = getNodeStartIndex(nextStatement);
        const attachableComments = tracker.takeBetween(
            end,
            nextStart ?? Number.POSITIVE_INFINITY,
            (comment) => isAttachableTrailingComment(comment, statement)
        );

        if (attachableComments.length > 0) {
            property.comments = Array.isArray(property.comments) ? property.comments : [];
            for (const comment of attachableComments) {
                comment.enclosingNode = property;
                comment.precedingNode = property;
                comment.followingNode = property;
                comment.leading = false;
                comment.trailing = true;
                comment.placement = "endOfLine";
                comment._structPropertyTrailing = true;
                comment._structPropertyHandled = false;
                property.comments.push(comment);
            }
            const lastComment = attachableComments[attachableComments.length - 1];
            const commentEnd = getNodeEndIndex(lastComment);
            lastEnd = commentEnd != null ? commentEnd : end;
        } else {
            lastEnd = end;
        }

        properties.push(property);
        previousStatement = statement;
        lastProperty = property;
        cursor++;
    }

    if (properties.length === 0) {
        return null;
    }

    const nextStatement = statements[cursor];
    if (nextStatement) {
        const nextStart = getNodeStartIndex(nextStatement);
        if (!allowTrailingCommentsBetween({
            tracker,
            left: lastEnd,
            right: nextStart,
            precedingStatement: previousStatement,
            precedingProperty: lastProperty
        })) {
            return null;
        }
    } else {
        if (!allowTrailingCommentsBetween({
            tracker,
            left: lastEnd,
            right: Number.POSITIVE_INFINITY,
            precedingStatement: previousStatement,
            precedingProperty: lastProperty
        })) {
            return null;
        }

        if (tracker.hasAfter(lastEnd)) {
            return null;
        }
    }

    const shouldForceBreak = properties.some((property) => property?._hasTrailingInlineComment);

    return {
        properties,
        count: properties.length,
        shouldForceBreak
    };
}

function getStructInitializer(statement) {
    if (!isNode(statement)) {
        return null;
    }

    if (statement.type === VARIABLE_DECLARATION) {
        if (!Array.isArray(statement.declarations) || statement.declarations.length !== 1) {
            return null;
        }

        const declarator = statement.declarations[0];
        if (!isNode(declarator) || declarator.type !== VARIABLE_DECLARATOR) {
            return null;
        }

        if (!isNode(declarator.id) || declarator.id.type !== IDENTIFIER) {
            return null;
        }

        if (!isNode(declarator.init) || declarator.init.type !== STRUCT_EXPRESSION) {
            return null;
        }

        if (Array.isArray(declarator.init.properties) && declarator.init.properties.length > 0) {
            return null;
        }

        return {
            identifierName: declarator.id.name,
            structNode: declarator.init
        };
    }

    if (statement.type === ASSIGNMENT_EXPRESSION) {
        if (statement.operator !== "=") {
            return null;
        }

        if (!isNode(statement.left) || statement.left.type !== IDENTIFIER) {
            return null;
        }

        if (!isNode(statement.right) || statement.right.type !== STRUCT_EXPRESSION) {
            return null;
        }

        if (Array.isArray(statement.right.properties) && statement.right.properties.length > 0) {
            return null;
        }

        return {
            identifierName: statement.left.name,
            structNode: statement.right
        };
    }

    return null;
}

function isPropertyAssignment(statement, identifierName) {
    if (!isNode(statement) || statement.type !== ASSIGNMENT_EXPRESSION) {
        return false;
    }

    if (statement.operator !== "=") {
        return false;
    }

    const left = statement.left;
    if (!isNode(left)) {
        return false;
    }

    if (left.type === MEMBER_DOT_EXPRESSION) {
        return isIdentifierRoot(left.object, identifierName);
    }

    if (left.type === MEMBER_INDEX_EXPRESSION) {
        return isIdentifierRoot(left.object, identifierName);
    }

    return false;
}

function isIdentifierRoot(node, identifierName) {
    return isNode(node) && node.type === IDENTIFIER && node.name === identifierName;
}

function buildPropertyFromAssignment(assignment, identifierName) {
    if (!isNode(assignment) || assignment.type !== ASSIGNMENT_EXPRESSION) {
        return null;
    }

    const propertyAccess = getStructPropertyAccess(assignment.left, identifierName);
    if (!propertyAccess) {
        return null;
    }

    const propertyKey = getPropertyKeyInfo(propertyAccess.propertyNode);
    const propertyName = buildPropertyNameNode(propertyKey);
    if (!propertyName) {
        return null;
    }

    return {
        type: "Property",
        name: propertyName,
        value: assignment.right,
        start: cloneLocation(
            getPreferredLocation(propertyAccess.propertyStart, assignment.start)
        ),
        end: cloneLocation(getPreferredLocation(assignment.right?.end, assignment.end))
    };
}

function getStructPropertyAccess(left, identifierName) {
    if (!isNode(left)) {
        return null;
    }

    if (!isIdentifierRoot(left.object, identifierName)) {
        return null;
    }

    if (left.type === MEMBER_DOT_EXPRESSION && isNode(left.property)) {
        return {
            propertyNode: left.property,
            propertyStart: left.property?.start
        };
    }

    if (left.type === MEMBER_INDEX_EXPRESSION) {
        if (!Array.isArray(left.property) || left.property.length !== 1) {
            return null;
        }

        const [propertyNode] = left.property;
        if (!isNode(propertyNode)) {
            return null;
        }

        return {
            propertyNode,
            propertyStart: propertyNode?.start
        };
    }

    return null;
}

function getPropertyKeyInfo(propertyNode) {
    if (!isNode(propertyNode)) {
        return null;
    }

    if (propertyNode.type === IDENTIFIER && typeof propertyNode.name === "string") {
        return {
            identifierName: propertyNode.name,
            raw: propertyNode.name,
            start: propertyNode.start,
            end: propertyNode.end
        };
    }

    if (propertyNode.type === LITERAL && typeof propertyNode.value === "string") {
        const unquoted = stripStringQuotes(propertyNode.value);
        return {
            identifierName: unquoted,
            raw: propertyNode.value,
            start: propertyNode.start,
            end: propertyNode.end
        };
    }

    return null;
}

function buildPropertyNameNode(propertyKey) {
    if (!propertyKey) {
        return null;
    }

    const identifierName = propertyKey.identifierName;
    if (identifierName && isIdentifierSafe(identifierName)) {
        return {
            type: IDENTIFIER,
            name: identifierName,
            start: cloneLocation(propertyKey.start),
            end: cloneLocation(propertyKey.end)
        };
    }

    if (typeof propertyKey.raw === "string") {
        return {
            type: LITERAL,
            value: propertyKey.raw,
            start: cloneLocation(propertyKey.start),
            end: cloneLocation(propertyKey.end)
        };
    }

    return null;
}

function allowTrailingCommentsBetween({ tracker, left, right, precedingStatement, precedingProperty }) {
    const commentEntries = tracker.getEntriesBetween(left, right);
    if (commentEntries.length === 0) {
        return true;
    }

    if (!precedingStatement) {
        return false;
    }

    const expectedLine = getNodeEndLine(precedingStatement);
    if (typeof expectedLine !== "number") {
        return false;
    }

    for (const entry of commentEntries) {
        const comment = entry.comment;
        if (!comment || comment.type !== "CommentLine") {
            return false;
        }

        const commentLine = getNodeStartLine(comment);
        if (commentLine !== expectedLine) {
            return false;
        }

        if (comment.leadingChar === ";") {
            comment.leadingChar = ",";
        }

        if (precedingProperty) {
            const commentTarget = precedingProperty.value ?? precedingProperty;
            addTrailingComment(commentTarget, comment);
            precedingProperty._hasTrailingInlineComment = true;
        }
    }

    tracker.consumeEntries(commentEntries);
    return true;
}

function getPreferredLocation(primary, fallback) {
    if (isNode(primary)) {
        return primary;
    }
    if (isNode(fallback)) {
        return fallback;
    }
    return null;
}

function cloneLocation(location) {
    if (!isNode(location)) {
        return location ?? null;
    }
    return { ...location };
}

function getNodeEndLine(node) {
    if (!isNode(node)) {
        return null;
    }
    const end = node.end;
    if (isNode(end) && typeof end.line === "number") {
        return end.line;
    }
    const start = node.start;
    if (isNode(start) && typeof start.line === "number") {
        return start.line;
    }
    return null;
}

function isAttachableTrailingComment(comment, statement) {
    if (!isNode(comment) || comment.type !== "CommentLine") {
        return false;
    }

    const commentStart = comment.start;
    if (!isNode(commentStart) || typeof commentStart.line !== "number") {
        return false;
    }

    const statementEndLine = getNodeEndLine(statement);
    if (typeof statementEndLine !== "number") {
        return false;
    }

    if (commentStart.line !== statementEndLine) {
        return false;
    }

    const commentStartIndex = getNodeStartIndex(comment);
    const statementEndIndex = getNodeEndIndex(statement);
    if (
        typeof commentStartIndex === "number" &&
        typeof statementEndIndex === "number" &&
        commentStartIndex <= statementEndIndex
    ) {
        return false;
    }

    return true;
}

function stripStringQuotes(value) {
    if (typeof value !== "string" || value.length < 2) {
        return null;
    }

    const firstChar = value[0];
    const lastChar = value[value.length - 1];
    if ((firstChar === '"' || firstChar === "'") && firstChar === lastChar) {
        return value.slice(1, -1);
    }

    return null;
}

const IDENTIFIER_SAFE_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isIdentifierSafe(name) {
    return typeof name === "string" && IDENTIFIER_SAFE_PATTERN.test(name);
}

function getNodeStartLine(node) {
    if (!isNode(node)) {
        return null;
    }

    if (node.start && typeof node.start.line === "number") {
        return node.start.line;
    }

    return null;
}

function isNode(value) {
    return value != null && typeof value === "object";
}

class CommentTracker {
    constructor(comments) {
        this.entries = comments
            .map((comment) => ({ index: getNodeStartIndex(comment), comment }))
            .filter((entry) => typeof entry.index === "number")
            .sort((a, b) => a.index - b.index);
    }

    hasBetween(left, right) {
        if (!this.entries.length || left == null || right == null || left >= right) {
            return false;
        }
        let index = this.firstGreaterThan(left);
        while (index < this.entries.length) {
            const entry = this.entries[index];
            if (entry.index >= right) {
                return false;
            }
            if (!entry.consumed) {
                return true;
            }
            index++;
        }
        return false;
    }

    hasAfter(position) {
        if (!this.entries.length || position == null) {
            return false;
        }
        const index = this.firstGreaterThan(position);
        while (index < this.entries.length) {
            if (!this.entries[index].consumed) {
                return true;
            }
            index++;
        }
        return false;
    }

    takeBetween(left, right, predicate) {
        if (!this.entries.length || left == null) {
            return [];
        }

        const upperBound = right == null ? Number.POSITIVE_INFINITY : right;
        if (left >= upperBound) {
            return [];
        }

        const results = [];
        let index = this.firstGreaterThan(left);

        while (index < this.entries.length) {
            const entry = this.entries[index];
            if (entry.index >= upperBound) {
                break;
            }

            if (!predicate || predicate(entry.comment)) {
                results.push(entry.comment);
                this.entries.splice(index, 1);
                continue;
            }

            index++;
        }

        return results;
        while (index < this.entries.length) {
            if (!this.entries[index].consumed) {
                return true;
            }
            index++;
        }
        return false;
    }

    firstGreaterThan(target) {
        let low = 0;
        let high = this.entries.length - 1;
        while (low <= high) {
            const mid = (low + high) >> 1;
            if (this.entries[mid].index <= target) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        return low;
    }

    getEntriesBetween(left, right) {
        if (!this.entries.length || left == null || right == null || left >= right) {
            return [];
        }

        const startIndex = this.firstGreaterThan(left);
        const collected = [];

        for (let index = startIndex; index < this.entries.length; index++) {
            const entry = this.entries[index];
            if (entry.index >= right) {
                break;
            }
            if (!entry.consumed) {
                collected.push(entry);
            }
        }

        return collected;
    }

    consumeEntries(entries) {
        for (const entry of entries) {
            entry.consumed = true;
            if (entry.comment) {
                entry.comment._removedByConsolidation = true;
            }
        }
    }

    removeConsumedComments() {
        if (!Array.isArray(this.comments) || this.comments.length === 0) {
            return;
        }

        let writeIndex = 0;
        for (let readIndex = 0; readIndex < this.comments.length; readIndex++) {
            const comment = this.comments[readIndex];
            if (comment && comment._removedByConsolidation) {
                continue;
            }
            this.comments[writeIndex] = comment;
            writeIndex++;
        }

        this.comments.length = writeIndex;
    }
}
