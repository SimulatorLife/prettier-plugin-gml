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

        if (diagnosticId === "GM2043") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = ensureLocalVariablesAreDeclaredBeforeUse({ ast, diagnostic });

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

function ensureLocalVariablesAreDeclaredBeforeUse({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];
    const ancestors = [];
    const visitedNodes = new WeakSet();

    const visitNode = (node, parent, property, container, index) => {
        if (!node || typeof node !== "object") {
            return;
        }

        if (visitedNodes.has(node)) {
            return;
        }

        visitedNodes.add(node);

        const context = { node, parent, property, container, index };
        ancestors.push(context);

        const action = handleLocalVariableDeclarationPatterns({
            context,
            ancestors,
            diagnostic,
            fixes
        });

        if (action?.skipChildren) {
            ancestors.pop();
            return;
        }

        for (const [key, value] of Object.entries(node)) {
            if (!value || typeof value !== "object") {
                continue;
            }

            if (Array.isArray(value)) {
                for (let childIndex = 0; childIndex < value.length; childIndex += 1) {
                    visitNode(value[childIndex], node, key, value, childIndex);
                }
                continue;
            }

            visitNode(value, node, key, null, null);
        }

        ancestors.pop();
    };

    visitNode(ast, null, null, null, null);

    return fixes;
}

function handleLocalVariableDeclarationPatterns({ context, ancestors, diagnostic, fixes }) {
    const { node, container, index } = context;

    if (!node || typeof node !== "object") {
        return null;
    }

    if (node.type !== "VariableDeclaration" || node.kind !== "var") {
        return null;
    }

    const declarator = getSingleVariableDeclarator(node);

    if (!declarator) {
        return null;
    }

    const variableName = getDeclaratorName(declarator);

    if (!variableName) {
        return null;
    }

    if (container && Array.isArray(container) && typeof index === "number") {
        const precedingNode = container[index - 1];
        const fixDetail = convertPrecedingAssignmentToVariableDeclaration({
            assignmentNode: precedingNode,
            declarationNode: node,
            container,
            assignmentIndex: index - 1,
            declarationIndex: index,
            diagnostic,
            variableName
        });

        if (fixDetail) {
            fixes.push(fixDetail);
            return { skipChildren: true };
        }
    }

    if (context.parent?.type !== "BlockStatement") {
        return null;
    }

    const blockBody = Array.isArray(container) ? container : null;

    if (!blockBody) {
        return null;
    }

    const owningStatementContext = findNearestStatementContext(ancestors.slice(0, -1));

    if (!owningStatementContext) {
        return null;
    }

    const { container: statementContainer, index: statementIndex } = owningStatementContext;

    if (!statementContainer || !Array.isArray(statementContainer) || typeof statementIndex !== "number") {
        return null;
    }

    if (hasVariableDeclarationInContainer(statementContainer, variableName, statementIndex)) {
        return null;
    }

    if (!referencesIdentifierAfterIndex(statementContainer, variableName, statementIndex + 1)) {
        return null;
    }

    const fixDetail = hoistVariableDeclarationOutOfBlock({
        declarationNode: node,
        blockBody,
        declarationIndex: index,
        statementContainer,
        statementIndex,
        diagnostic,
        variableName
    });

    if (fixDetail) {
        fixes.push(fixDetail);
        return { skipChildren: true };
    }

    return null;
}

function getSingleVariableDeclarator(node) {
    if (!node || node.type !== "VariableDeclaration") {
        return null;
    }

    const declarations = Array.isArray(node.declarations) ? node.declarations : [];

    if (declarations.length !== 1) {
        return null;
    }

    const [declarator] = declarations;

    if (!declarator || declarator.type !== "VariableDeclarator") {
        return null;
    }

    return declarator;
}

function getDeclaratorName(declarator) {
    const identifier = declarator?.id;

    if (!identifier || identifier.type !== "Identifier") {
        return null;
    }

    return identifier.name ?? null;
}

function convertPrecedingAssignmentToVariableDeclaration({
    assignmentNode,
    declarationNode,
    container,
    assignmentIndex,
    declarationIndex,
    diagnostic,
    variableName
}) {
    if (!assignmentNode || assignmentNode.type !== "AssignmentExpression" || assignmentNode.operator !== "=") {
        return null;
    }

    if (!container || !Array.isArray(container)) {
        return null;
    }

    if (typeof assignmentIndex !== "number" || typeof declarationIndex !== "number") {
        return null;
    }

    if (!assignmentNode.left || assignmentNode.left.type !== "Identifier" || assignmentNode.left.name !== variableName) {
        return null;
    }

    const declarator = getSingleVariableDeclarator(declarationNode);

    if (!declarator || !declarator.init) {
        return null;
    }

    const variableDeclaration = createVariableDeclarationFromAssignment(assignmentNode, declarator);

    if (!variableDeclaration) {
        return null;
    }

    const assignmentExpression = createAssignmentFromDeclarator(declarator, declarationNode);

    if (!assignmentExpression) {
        return null;
    }

    const rangeStart = getNodeStartIndex(assignmentNode);
    const rangeEnd = getNodeEndIndex(declarationNode);

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: variableName,
        range: {
            start: rangeStart,
            end: rangeEnd
        }
    });

    if (!fixDetail) {
        return null;
    }

    container[assignmentIndex] = variableDeclaration;
    container[declarationIndex] = assignmentExpression;

    copyCommentMetadata(assignmentNode, variableDeclaration);
    copyCommentMetadata(declarationNode, assignmentExpression);

    attachFeatherFixMetadata(variableDeclaration, [fixDetail]);
    attachFeatherFixMetadata(assignmentExpression, [fixDetail]);

    return fixDetail;
}

function createVariableDeclarationFromAssignment(assignmentNode, declaratorTemplate) {
    if (!assignmentNode || assignmentNode.type !== "AssignmentExpression") {
        return null;
    }

    const identifier = cloneIdentifier(assignmentNode.left);

    if (!identifier) {
        return null;
    }

    const declarator = {
        type: "VariableDeclarator",
        id: identifier,
        init: assignmentNode.right
    };

    if (declaratorTemplate && typeof declaratorTemplate === "object") {
        if (Object.prototype.hasOwnProperty.call(declaratorTemplate, "start")) {
            declarator.start = cloneLocation(declaratorTemplate.start);
        }

        if (Object.prototype.hasOwnProperty.call(declaratorTemplate, "end")) {
            declarator.end = cloneLocation(declaratorTemplate.end);
        }
    }

    const declaration = {
        type: "VariableDeclaration",
        kind: "var",
        declarations: [declarator]
    };

    if (Object.prototype.hasOwnProperty.call(assignmentNode, "start")) {
        declaration.start = cloneLocation(assignmentNode.start);
    }

    if (Object.prototype.hasOwnProperty.call(assignmentNode, "end")) {
        declaration.end = cloneLocation(assignmentNode.end);
    }

    return declaration;
}

function createAssignmentFromDeclarator(declarator, templateNode) {
    if (!declarator || declarator.type !== "VariableDeclarator") {
        return null;
    }

    if (!declarator.init) {
        return null;
    }

    const identifier = cloneIdentifier(declarator.id);

    if (!identifier) {
        return null;
    }

    const assignment = {
        type: "AssignmentExpression",
        operator: "=",
        left: identifier,
        right: declarator.init
    };

    if (templateNode && typeof templateNode === "object") {
        if (Object.prototype.hasOwnProperty.call(templateNode, "start")) {
            assignment.start = cloneLocation(templateNode.start);
        }

        if (Object.prototype.hasOwnProperty.call(templateNode, "end")) {
            assignment.end = cloneLocation(templateNode.end);
        }
    }

    return assignment;
}

function findNearestStatementContext(ancestors) {
    if (!Array.isArray(ancestors)) {
        return null;
    }

    for (let index = ancestors.length - 1; index >= 0; index -= 1) {
        const entry = ancestors[index];

        if (!entry || !Array.isArray(entry.container)) {
            continue;
        }

        if (typeof entry.index !== "number") {
            continue;
        }

        if (entry.node && entry.node.type === "VariableDeclaration" && entry.node.kind === "var") {
            continue;
        }

        return entry;
    }

    return null;
}

function hasVariableDeclarationInContainer(container, variableName, uptoIndex) {
    if (!Array.isArray(container) || !variableName) {
        return false;
    }

    const limit = typeof uptoIndex === "number" ? uptoIndex : container.length;

    for (let index = 0; index < limit; index += 1) {
        const node = container[index];

        if (!node || node.type !== "VariableDeclaration" || node.kind !== "var") {
            continue;
        }

        const declarations = Array.isArray(node.declarations) ? node.declarations : [];

        for (const declarator of declarations) {
            if (!declarator || declarator.type !== "VariableDeclarator") {
                continue;
            }

            if (declarator.id?.type === "Identifier" && declarator.id.name === variableName) {
                return true;
            }
        }
    }

    return false;
}

function referencesIdentifierAfterIndex(container, variableName, startIndex) {
    if (!Array.isArray(container) || !variableName) {
        return false;
    }

    const initialIndex = typeof startIndex === "number" ? startIndex : 0;

    for (let index = initialIndex; index < container.length; index += 1) {
        if (referencesIdentifier(container[index], variableName)) {
            return true;
        }
    }

    return false;
}

function referencesIdentifier(node, variableName) {
    if (!node || typeof node !== "object") {
        return false;
    }

    const stack = [{ value: node, parent: null, key: null }];

    while (stack.length > 0) {
        const { value, parent, key } = stack.pop();

        if (!value || typeof value !== "object") {
            continue;
        }

        if (Array.isArray(value)) {
            for (const item of value) {
                stack.push({ value: item, parent, key });
            }
            continue;
        }

        if (value.type === "Identifier" && value.name === variableName) {
            const isDeclaratorId = parent?.type === "VariableDeclarator" && key === "id";

            if (!isDeclaratorId) {
                return true;
            }
        }

        for (const [childKey, childValue] of Object.entries(value)) {
            if (childValue && typeof childValue === "object") {
                stack.push({ value: childValue, parent: value, key: childKey });
            }
        }
    }

    return false;
}

function hoistVariableDeclarationOutOfBlock({
    declarationNode,
    blockBody,
    declarationIndex,
    statementContainer,
    statementIndex,
    diagnostic,
    variableName
}) {
    if (!declarationNode || declarationNode.type !== "VariableDeclaration") {
        return null;
    }

    if (!Array.isArray(blockBody) || typeof declarationIndex !== "number") {
        return null;
    }

    if (!Array.isArray(statementContainer) || typeof statementIndex !== "number") {
        return null;
    }

    const declarator = getSingleVariableDeclarator(declarationNode);

    if (!declarator || !declarator.init) {
        return null;
    }

    const hoistedDeclaration = createHoistedVariableDeclaration(declarator);

    if (!hoistedDeclaration) {
        return null;
    }

    const assignment = createAssignmentFromDeclarator(declarator, declarationNode);

    if (!assignment) {
        return null;
    }

    const rangeStart = getNodeStartIndex(declarationNode);
    const owningStatement = statementContainer[statementIndex];
    const rangeEnd = getNodeEndIndex(owningStatement ?? declarationNode);

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: variableName,
        range: {
            start: rangeStart,
            end: rangeEnd
        }
    });

    if (!fixDetail) {
        return null;
    }

    statementContainer.splice(statementIndex, 0, hoistedDeclaration);
    blockBody[declarationIndex] = assignment;

    copyCommentMetadata(declarationNode, assignment);

    attachFeatherFixMetadata(hoistedDeclaration, [fixDetail]);
    attachFeatherFixMetadata(assignment, [fixDetail]);

    return fixDetail;
}

function createHoistedVariableDeclaration(declaratorTemplate) {
    if (!declaratorTemplate || declaratorTemplate.type !== "VariableDeclarator") {
        return null;
    }

    const identifier = cloneIdentifier(declaratorTemplate.id);

    if (!identifier) {
        return null;
    }

    const declarator = {
        type: "VariableDeclarator",
        id: identifier,
        init: null
    };

    if (Object.prototype.hasOwnProperty.call(declaratorTemplate, "start")) {
        declarator.start = cloneLocation(declaratorTemplate.start);
    }

    if (Object.prototype.hasOwnProperty.call(declaratorTemplate, "end")) {
        declarator.end = cloneLocation(declaratorTemplate.end);
    }

    const declaration = {
        type: "VariableDeclaration",
        kind: "var",
        declarations: [declarator]
    };

    if (Object.prototype.hasOwnProperty.call(declaratorTemplate, "start")) {
        declaration.start = cloneLocation(declaratorTemplate.start);
    }

    if (Object.prototype.hasOwnProperty.call(declaratorTemplate, "end")) {
        declaration.end = cloneLocation(declaratorTemplate.end);
    }

    return declaration;
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

