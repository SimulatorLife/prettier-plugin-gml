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
        structNode.hasTrailingComma = false;

        statements.splice(index + 1, collected.count);
    }
}

function collectPropertyAssignments({ statements, startIndex, identifierName, previousEnd, tracker }) {
    const properties = [];
    let cursor = startIndex;
    let lastEnd = previousEnd;

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

        if (tracker.hasBetween(lastEnd, start)) {
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
        cursor++;
    }

    if (properties.length === 0) {
        return null;
    }

    const nextStatement = statements[cursor];
    if (nextStatement) {
        const nextStart = getNodeStartIndex(nextStatement);
        if (tracker.hasBetween(lastEnd, nextStart)) {
            return null;
        }
    } else if (tracker.hasAfter(lastEnd)) {
        return null;
    }

    return {
        properties,
        count: properties.length
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

    const left = assignment.left;
    if (!isNode(left)) {
        return null;
    }

    if (left.type === MEMBER_DOT_EXPRESSION && isIdentifierRoot(left.object, identifierName)) {
        const propertyName = getPropertyNameFromDot(left.property);
        if (!propertyName) {
            return null;
        }

        return {
            type: "Property",
            name: propertyName,
            value: assignment.right,
            start: cloneLocation(getPreferredLocation(left.property?.start, assignment.start)),
            end: cloneLocation(getPreferredLocation(assignment.right?.end, assignment.end))
        };
    }

    if (left.type === MEMBER_INDEX_EXPRESSION && isIdentifierRoot(left.object, identifierName)) {
        if (!Array.isArray(left.property) || left.property.length !== 1) {
            return null;
        }

        const propertyName = getPropertyNameFromIndex(left.property[0]);
        if (!propertyName) {
            return null;
        }

        return {
            type: "Property",
            name: propertyName,
            value: assignment.right,
            start: cloneLocation(getPreferredLocation(left.property[0]?.start, assignment.start)),
            end: cloneLocation(getPreferredLocation(assignment.right?.end, assignment.end))
        };
    }

    return null;
}

function getPropertyNameFromDot(property) {
    if (!isNode(property)) {
        return null;
    }

    if (property.type === IDENTIFIER && typeof property.name === "string") {
        return property.name;
    }

    if (property.type === LITERAL && typeof property.value === "string") {
        return property.value;
    }

    return null;
}

function getPropertyNameFromIndex(propertyExpr) {
    if (!isNode(propertyExpr)) {
        return null;
    }

    if (propertyExpr.type === LITERAL && typeof propertyExpr.value === "string") {
        return propertyExpr.value;
    }

    return null;
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

function getNodeStartIndex(node) {
    if (!isNode(node)) {
        return null;
    }
    return extractIndex(node.start);
}

function getNodeEndIndex(node) {
    if (!isNode(node)) {
        return null;
    }
    return extractIndex(node.end);
}

function extractIndex(location) {
    if (location == null) {
        return null;
    }
    if (typeof location === "number") {
        return location;
    }
    if (typeof location.index === "number") {
        return location.index;
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
        const index = this.firstGreaterThan(left);
        return index < this.entries.length && this.entries[index].index < right;
    }

    hasAfter(position) {
        if (!this.entries.length || position == null) {
            return false;
        }
        const index = this.firstGreaterThan(position);
        return index < this.entries.length;
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
}
