import { getNodeEndIndex, getNodeStartIndex } from "../../../shared/ast-locations.js";
import { getFeatherDiagnostics } from "../../../shared/feather/metadata.js";

const FEATHER_FIX_IMPLEMENTATIONS = buildFeatherFixImplementations();
const FEATHER_DIAGNOSTIC_FIXERS = buildFeatherDiagnosticFixers();
const TRAILING_MACRO_SEMICOLON_PATTERN = new RegExp(
    ";(?=[^\\S\\r\\n]*(?:(?:\\/\\/[^\\r\\n]*|\\/\\*[\\s\\S]*?\\*\/)[^\\S\\r\\n]*)*(?:\\r?\\n|$))"
);
const MANUAL_FIX_TRACKING_KEY = Symbol("manualFeatherFixes");

export function getFeatherDiagnosticFixers() {
    return new Map(FEATHER_DIAGNOSTIC_FIXERS);
}

export function applyFeatherFixes(ast, { sourceText } = {}) {
    if (!ast || typeof ast !== "object") {
        return ast;
    }

    const appliedFixes = [];

    for (const entry of FEATHER_DIAGNOSTIC_FIXERS.values()) {
        const fixes = entry.applyFix(ast, { sourceText });

        if (Array.isArray(fixes) && fixes.length > 0) {
            appliedFixes.push(...fixes);
        }
    }

    if (appliedFixes.length > 0) {
        attachFeatherFixMetadata(ast, appliedFixes);
    }

    return ast;
}

function buildFeatherDiagnosticFixers() {
    const diagnostics = getFeatherDiagnostics();
    const registry = new Map();

    for (const diagnostic of diagnostics) {
        const diagnosticId = diagnostic?.id;

        if (!diagnosticId || registry.has(diagnosticId)) {
            continue;
        }

        const applyFix = createFixerForDiagnostic(diagnostic);

        if (typeof applyFix !== "function") {
            continue;
        }

        registry.set(diagnosticId, {
            diagnostic,
            applyFix
        });
    }

    return registry;
}

function createFixerForDiagnostic(diagnostic) {
    const implementationFactory = FEATHER_FIX_IMPLEMENTATIONS.get(diagnostic?.id);

    if (typeof implementationFactory === "function") {
        const implementation = implementationFactory(diagnostic);

        if (typeof implementation === "function") {
            return (ast, context) => {
                const fixes = implementation({
                    ast,
                    sourceText: context?.sourceText
                });

                return Array.isArray(fixes) ? fixes : [];
            };
        }
    }

    return createNoOpFixer();
}

function createNoOpFixer() {
    return () => [];
}

function buildFeatherFixImplementations() {
    const registry = new Map();
    const diagnostics = getFeatherDiagnostics();

    for (const diagnostic of diagnostics) {
        const diagnosticId = diagnostic?.id;

        if (!diagnosticId) {
            continue;
        }

        if (diagnosticId === "GM1051") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast, sourceText }) => {
                const fixes = removeTrailingMacroSemicolons({
                    ast,
                    sourceText,
                    diagnostic
                });

                if (Array.isArray(fixes) && fixes.length > 0) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM2020") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = convertAllDotAssignmentsToWithStatements({ ast, diagnostic });

                if (Array.isArray(fixes) && fixes.length > 0) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM2031") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = ensureFileFindSearchesAreSerialized({ ast, diagnostic });

                if (Array.isArray(fixes) && fixes.length > 0) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM1063") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = harmonizeTexturePointerTernaries({ ast, diagnostic });

                if (Array.isArray(fixes) && fixes.length > 0) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM2054") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = ensureAlphaTestRefIsReset({ ast, diagnostic });

                if (Array.isArray(fixes) && fixes.length > 0) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic });
            });
            continue;
        }

        registerFeatherFixer(registry, diagnosticId, () => ({ ast }) =>
            registerManualFeatherFix({ ast, diagnostic })
        );
    }

    return registry;
}

function registerFeatherFixer(registry, diagnosticId, factory) {
    if (!registry || typeof registry.set !== "function") {
        return;
    }

    if (!diagnosticId || typeof factory !== "function") {
        return;
    }

    if (!registry.has(diagnosticId)) {
        registry.set(diagnosticId, factory);
    }
}

function removeTrailingMacroSemicolons({ ast, sourceText, diagnostic }) {
    if (!diagnostic || typeof sourceText !== "string" || sourceText.length === 0) {
        return [];
    }

    const fixes = [];

    const visit = (node) => {
        if (!node || typeof node !== "object") {
            return;
        }

        if (Array.isArray(node)) {
            for (const item of node) {
                visit(item);
            }
            return;
        }

        if (node.type === "MacroDeclaration") {
            const fixInfo = sanitizeMacroDeclaration(node, sourceText, diagnostic);
            if (fixInfo) {
                fixes.push(fixInfo);
            }
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                visit(value);
            }
        }
    };

    visit(ast);

    return fixes;
}

function sanitizeMacroDeclaration(node, sourceText, diagnostic) {
    if (!node || typeof node !== "object") {
        return null;
    }

    const tokens = Array.isArray(node.tokens) ? node.tokens : null;
    if (!tokens || tokens.length === 0) {
        return null;
    }

    const lastToken = tokens[tokens.length - 1];
    if (lastToken !== ";") {
        return null;
    }

    const startIndex = node.start?.index;
    const endIndex = node.end?.index;

    if (typeof startIndex !== "number" || typeof endIndex !== "number") {
        return null;
    }

    const originalText = sourceText.slice(startIndex, endIndex + 1);

    // Only strip semicolons that appear at the end of the macro definition.
    const sanitizedText = originalText.replace(TRAILING_MACRO_SEMICOLON_PATTERN, "");

    if (sanitizedText === originalText) {
        return null;
    }

    node.tokens = tokens.slice(0, tokens.length - 1);
    node._featherMacroText = sanitizedText;

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: node.name?.name ?? null,
        range: {
            start: getNodeStartIndex(node),
            end: getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    attachFeatherFixMetadata(node, [fixDetail]);

    return fixDetail;
}

function convertAllDotAssignmentsToWithStatements({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "AssignmentExpression") {
            const fix = convertAllAssignment(node, parent, property, diagnostic);
            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function convertAllAssignment(node, parent, property, diagnostic) {
    if (!Array.isArray(parent) || typeof property !== "number") {
        return null;
    }

    if (!node || node.type !== "AssignmentExpression" || node.operator !== "=") {
        return null;
    }

    const member = node.left;
    if (!member || member.type !== "MemberDotExpression") {
        return null;
    }

    const object = member.object;
    if (!object || object.type !== "Identifier" || object.name !== "all") {
        return null;
    }

    const propertyIdentifier = member.property;
    if (!propertyIdentifier || propertyIdentifier.type !== "Identifier") {
        return null;
    }

    const normalizedAssignment = {
        type: "AssignmentExpression",
        operator: node.operator,
        left: cloneIdentifier(propertyIdentifier),
        right: node.right,
        start: cloneLocation(node.start),
        end: cloneLocation(node.end)
    };

    const blockStatement = {
        type: "BlockStatement",
        body: [normalizedAssignment],
        start: cloneLocation(node.start),
        end: cloneLocation(node.end)
    };

    const parenthesizedExpression = {
        type: "ParenthesizedExpression",
        expression: cloneIdentifier(object),
        start: cloneLocation(object?.start ?? node.start),
        end: cloneLocation(object?.end ?? node.end)
    };

    const withStatement = {
        type: "WithStatement",
        test: parenthesizedExpression,
        body: blockStatement,
        start: cloneLocation(node.start),
        end: cloneLocation(node.end)
    };

    copyCommentMetadata(node, withStatement);

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: propertyIdentifier?.name ?? null,
        range: {
            start: getNodeStartIndex(node),
            end: getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    parent[property] = withStatement;
    attachFeatherFixMetadata(withStatement, [fixDetail]);

    return fixDetail;
}

function ensureAlphaTestRefIsReset({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "CallExpression") {
            const fix = ensureAlphaTestRefResetAfterCall(node, parent, property, diagnostic);

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function ensureAlphaTestRefResetAfterCall(node, parent, property, diagnostic) {
    if (!Array.isArray(parent) || typeof property !== "number") {
        return null;
    }

    if (!node || node.type !== "CallExpression") {
        return null;
    }

    if (!isIdentifierWithName(node.object, "gpu_set_alphatestref")) {
        return null;
    }

    const args = Array.isArray(node.arguments) ? node.arguments : [];

    if (args.length === 0) {
        return null;
    }

    if (isLiteralZero(args[0])) {
        return null;
    }

    const siblings = parent;
    const nextNode = siblings[property + 1];

    if (isAlphaTestRefResetCall(nextNode)) {
        return null;
    }

    const resetCall = createAlphaTestRefResetCall(node);

    if (!resetCall) {
        return null;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: node.object?.name ?? null,
        range: {
            start: getNodeStartIndex(node),
            end: getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    siblings.splice(property + 1, 0, resetCall);
    attachFeatherFixMetadata(resetCall, [fixDetail]);

    return fixDetail;
}

function ensureFileFindSearchesAreSerialized({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];
    const state = createFileFindState();

    processStatementBlock(getProgramStatements(ast), state);

    return fixes;

    function processStatementBlock(statements, currentState) {
        if (!Array.isArray(statements) || statements.length === 0 || !currentState) {
            return;
        }

        let index = 0;

        while (index < statements.length) {
            const statement = statements[index];

            if (isFileFindCloseStatement(statement)) {
                currentState.openCount = Math.max(currentState.openCount - 1, 0);
                index += 1;
                continue;
            }

            const callNode = getFileFindFirstCallFromStatement(statement);

            if (callNode && currentState.openCount > 0) {
                const insertion = insertFileFindCloseBefore(statements, index, callNode);

                if (insertion?.fixDetail) {
                    fixes.push(insertion.fixDetail);
                    currentState.openCount = Math.max(currentState.openCount - 1, 0);
                    index += insertion.insertedBefore;
                    continue;
                }
            }

            if (callNode) {
                currentState.openCount += 1;
            }

            handleNestedStatements(statement, currentState);
            index += 1;
        }
    }

    function handleNestedStatements(statement, currentState) {
        if (!statement || typeof statement !== "object" || !currentState) {
            return;
        }

        switch (statement.type) {
            case "BlockStatement": {
                processStatementBlock(statement.body ?? [], currentState);
                break;
            }
            case "IfStatement": {
                processBranch(statement, "consequent", currentState);

                if (statement.alternate) {
                    processBranch(statement, "alternate", currentState);
                }

                break;
            }
            case "WhileStatement":
            case "RepeatStatement":
            case "DoWhileStatement":
            case "ForStatement": {
                processBranch(statement, "body", currentState);
                break;
            }
            case "SwitchStatement": {
                const cases = Array.isArray(statement.cases) ? statement.cases : [];

                for (const caseClause of cases) {
                    const branchState = cloneFileFindState(currentState);
                    processStatementBlock(caseClause?.consequent ?? [], branchState);
                }
                break;
            }
            case "TryStatement": {
                if (statement.block) {
                    processStatementBlock(statement.block.body ?? [], currentState);
                }

                if (statement.handler) {
                    processBranch(statement.handler, "body", currentState);
                }

                if (statement.finalizer) {
                    processStatementBlock(statement.finalizer.body ?? [], currentState);
                }
                break;
            }
            default:
                break;
        }
    }

    function processBranch(parent, key, currentState) {
        if (!parent || typeof parent !== "object" || !currentState) {
            return;
        }

        const statements = getBranchStatements(parent, key);

        if (!statements) {
            return;
        }

        const branchState = cloneFileFindState(currentState);
        processStatementBlock(statements, branchState);
    }

    function getBranchStatements(parent, key) {
        if (!parent || typeof parent !== "object" || !key) {
            return null;
        }

        let target = parent[key];

        if (!target) {
            return null;
        }

        if (target.type !== "BlockStatement") {
            target = ensureBlockStatement(parent, key, target);
        }

        if (!target || target.type !== "BlockStatement") {
            return null;
        }

        return Array.isArray(target.body) ? target.body : [];
    }

    function insertFileFindCloseBefore(statements, index, callNode) {
        if (!Array.isArray(statements) || typeof index !== "number") {
            return null;
        }

        const closeCall = createFileFindCloseCall(callNode);

        if (!closeCall) {
            return null;
        }

        const fixDetail = createFeatherFixDetail(diagnostic, {
            target: callNode?.object?.name ?? null,
            range: {
                start: getNodeStartIndex(callNode),
                end: getNodeEndIndex(callNode)
            }
        });

        if (!fixDetail) {
            return null;
        }

        attachFeatherFixMetadata(closeCall, [fixDetail]);
        statements.splice(index, 0, closeCall);

        return {
            fixDetail,
            insertedBefore: 1
        };
    }

    function getFileFindFirstCallFromStatement(statement) {
        if (!statement || typeof statement !== "object") {
            return null;
        }

        switch (statement.type) {
            case "CallExpression":
                return isIdentifierWithName(statement.object, "file_find_first") ? statement : null;
            case "AssignmentExpression":
                return getFileFindFirstCallFromExpression(statement.right);
            case "VariableDeclaration": {
                const declarations = Array.isArray(statement.declarations)
                    ? statement.declarations
                    : [];

                for (const declarator of declarations) {
                    const call = getFileFindFirstCallFromExpression(declarator?.init);
                    if (call) {
                        return call;
                    }
                }
                return null;
            }
            case "ReturnStatement":
            case "ThrowStatement":
                return getFileFindFirstCallFromExpression(statement.argument);
            case "ExpressionStatement":
                return getFileFindFirstCallFromExpression(statement.expression);
            default:
                return null;
        }
    }

    function getFileFindFirstCallFromExpression(expression) {
        if (!expression || typeof expression !== "object") {
            return null;
        }

        if (expression.type === "CallExpression") {
            return isIdentifierWithName(expression.object, "file_find_first") ? expression : null;
        }

        if (expression.type === "ParenthesizedExpression") {
            return getFileFindFirstCallFromExpression(expression.expression);
        }

        if (expression.type === "AssignmentExpression") {
            return getFileFindFirstCallFromExpression(expression.right);
        }

        if (expression.type === "SequenceExpression") {
            const expressions = Array.isArray(expression.expressions) ? expression.expressions : [];

            for (const item of expressions) {
                const call = getFileFindFirstCallFromExpression(item);
                if (call) {
                    return call;
                }
            }
        }

        if (expression.type === "BinaryExpression" || expression.type === "LogicalExpression") {
            const leftCall = getFileFindFirstCallFromExpression(expression.left);
            if (leftCall) {
                return leftCall;
            }

            return getFileFindFirstCallFromExpression(expression.right);
        }

        if (expression.type === "ConditionalExpression" || expression.type === "TernaryExpression") {
            const consequentCall = getFileFindFirstCallFromExpression(expression.consequent);
            if (consequentCall) {
                return consequentCall;
            }

            return getFileFindFirstCallFromExpression(expression.alternate);
        }

        return null;
    }

    function isFileFindCloseStatement(statement) {
        if (!statement || typeof statement !== "object") {
            return false;
        }

        if (statement.type === "CallExpression") {
            return isIdentifierWithName(statement.object, "file_find_close");
        }

        if (statement.type === "ExpressionStatement") {
            return isFileFindCloseStatement(statement.expression);
        }

        if (statement.type === "ReturnStatement" || statement.type === "ThrowStatement") {
            return isFileFindCloseStatement(statement.argument);
        }

        return false;
    }

    function getProgramStatements(node) {
        if (!node || typeof node !== "object") {
            return [];
        }

        if (Array.isArray(node.body)) {
            return node.body;
        }

        if (node.body && Array.isArray(node.body.body)) {
            return node.body.body;
        }

        return [];
    }

    function createFileFindState() {
        return {
            openCount: 0
        };
    }

    function cloneFileFindState(existing) {
        if (!existing || typeof existing !== "object") {
            return createFileFindState();
        }

        return {
            openCount: existing.openCount ?? 0
        };
    }

    function createFileFindCloseCall(template) {
        const identifier = createIdentifier("file_find_close", template?.object ?? template);

        if (!identifier) {
            return null;
        }

        const callExpression = {
            type: "CallExpression",
            object: identifier,
            arguments: []
        };

        if (Object.prototype.hasOwnProperty.call(template, "start")) {
            callExpression.start = cloneLocation(template.start);
        }

        if (Object.prototype.hasOwnProperty.call(template, "end")) {
            callExpression.end = cloneLocation(template.end);
        }

        return callExpression;
    }

    function ensureBlockStatement(parent, key, statement) {
        if (!parent || typeof parent !== "object" || !key) {
            return null;
        }

        if (!statement || typeof statement !== "object") {
            return null;
        }

        const block = {
            type: "BlockStatement",
            body: [statement]
        };

        if (Object.prototype.hasOwnProperty.call(statement, "start")) {
            block.start = cloneLocation(statement.start);
        }

        if (Object.prototype.hasOwnProperty.call(statement, "end")) {
            block.end = cloneLocation(statement.end);
        }

        parent[key] = block;

        return block;
    }
}

function harmonizeTexturePointerTernaries({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "TernaryExpression") {
            const fix = harmonizeTexturePointerTernary(node, parent, property, diagnostic);

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function harmonizeTexturePointerTernary(node, parent, property, diagnostic) {
    if (!node || node.type !== "TernaryExpression") {
        return null;
    }

    if (!parent || parent.type !== "AssignmentExpression" || property !== "right") {
        return null;
    }

    if (!isSpriteGetTextureCall(node.consequent)) {
        return null;
    }

    const alternate = node.alternate;

    if (!isNegativeOneLiteral(alternate)) {
        return null;
    }

    const pointerIdentifier = createIdentifier("pointer_null", alternate);

    if (!pointerIdentifier) {
        return null;
    }

    copyCommentMetadata(alternate, pointerIdentifier);
    node.alternate = pointerIdentifier;

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: isIdentifier(parent.left) ? parent.left.name : null,
        range: {
            start: getNodeStartIndex(node),
            end: getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    attachFeatherFixMetadata(node, [fixDetail]);

    return fixDetail;
}

function cloneIdentifier(node) {
    if (!node || node.type !== "Identifier") {
        return null;
    }

    const cloned = {
        type: "Identifier",
        name: node.name
    };

    if (Object.prototype.hasOwnProperty.call(node, "start")) {
        cloned.start = cloneLocation(node.start);
    }

    if (Object.prototype.hasOwnProperty.call(node, "end")) {
        cloned.end = cloneLocation(node.end);
    }

    return cloned;
}

function cloneLocation(location) {
    if (typeof location === "number") {
        return location;
    }

    if (location && typeof location === "object") {
        return { ...location };
    }

    return location ?? undefined;
}

function copyCommentMetadata(source, target) {
    if (!source || !target) {
        return;
    }

    ["leadingComments", "trailingComments", "innerComments", "comments"].forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
            target[key] = source[key];
        }
    });
}

function isIdentifierWithName(node, name) {
    if (!node || node.type !== "Identifier") {
        return false;
    }

    return node.name === name;
}

function isIdentifier(node) {
    return !!node && node.type === "Identifier";
}

function isLiteralZero(node) {
    if (!node || node.type !== "Literal") {
        return false;
    }

    return node.value === "0" || node.value === 0;
}

function isAlphaTestRefResetCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    if (!isIdentifierWithName(node.object, "gpu_set_alphatestref")) {
        return false;
    }

    const args = Array.isArray(node.arguments) ? node.arguments : [];

    if (args.length === 0) {
        return false;
    }

    return isLiteralZero(args[0]);
}

function createAlphaTestRefResetCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = cloneIdentifier(template.object);

    if (!identifier || identifier.name !== "gpu_set_alphatestref") {
        return null;
    }

    const literalZero = createLiteral("0", template.arguments?.[0]);

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: [literalZero]
    };

    if (Object.prototype.hasOwnProperty.call(template, "start")) {
        callExpression.start = cloneLocation(template.start);
    }

    if (Object.prototype.hasOwnProperty.call(template, "end")) {
        callExpression.end = cloneLocation(template.end);
    }

    return callExpression;
}

function createLiteral(value, template) {
    const literalValue = typeof value === "number" ? String(value) : value;

    const literal = {
        type: "Literal",
        value: literalValue
    };

    if (template && typeof template === "object") {
        if (Object.prototype.hasOwnProperty.call(template, "start")) {
            literal.start = cloneLocation(template.start);
        }

        if (Object.prototype.hasOwnProperty.call(template, "end")) {
            literal.end = cloneLocation(template.end);
        }
    }

    return literal;
}

function createIdentifier(name, template) {
    if (!name) {
        return null;
    }

    const identifier = {
        type: "Identifier",
        name
    };

    if (template && typeof template === "object") {
        if (Object.prototype.hasOwnProperty.call(template, "start")) {
            identifier.start = cloneLocation(template.start);
        }

        if (Object.prototype.hasOwnProperty.call(template, "end")) {
            identifier.end = cloneLocation(template.end);
        }
    }

    return identifier;
}

function isSpriteGetTextureCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    return isIdentifierWithName(node.object, "sprite_get_texture");
}

function isNegativeOneLiteral(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    if (node.type === "Literal") {
        return node.value === "-1" || node.value === -1;
    }

    if (node.type === "UnaryExpression" && node.operator === "-" && node.prefix) {
        const argument = node.argument;

        if (!argument || argument.type !== "Literal") {
            return false;
        }

        return argument.value === "1" || argument.value === 1;
    }

    return false;
}

function registerManualFeatherFix({ ast, diagnostic }) {
    if (!ast || typeof ast !== "object" || !diagnostic?.id) {
        return [];
    }

    const manualFixIds = getManualFeatherFixRegistry(ast);

    if (manualFixIds.has(diagnostic.id)) {
        return [];
    }

    manualFixIds.add(diagnostic.id);

    const fixDetail = createFeatherFixDetail(diagnostic, {
        automatic: false,
        range: null,
        target: null
    });

    return [fixDetail];
}

function getManualFeatherFixRegistry(ast) {
    let registry = ast[MANUAL_FIX_TRACKING_KEY];

    if (registry instanceof Set) {
        return registry;
    }

    registry = new Set();

    Object.defineProperty(ast, MANUAL_FIX_TRACKING_KEY, {
        configurable: true,
        enumerable: false,
        writable: false,
        value: registry
    });

    return registry;
}

function createFeatherFixDetail(diagnostic, { target = null, range = null, automatic = true } = {}) {
    if (!diagnostic) {
        return null;
    }

    return {
        id: diagnostic.id ?? null,
        title: diagnostic.title ?? null,
        description: diagnostic.description ?? null,
        correction: diagnostic.correction ?? null,
        target,
        range,
        automatic
    };
}

function attachFeatherFixMetadata(target, fixes) {
    if (!target || typeof target !== "object" || !Array.isArray(fixes) || fixes.length === 0) {
        return;
    }

    const key = "_appliedFeatherDiagnostics";

    if (!Array.isArray(target[key])) {
        Object.defineProperty(target, key, {
            configurable: true,
            enumerable: false,
            writable: true,
            value: []
        });
    }

    target[key].push(...fixes);
}

