import { Core } from "@gml-modules/core";
import type { MutableGameMakerAstNode } from "@gml-modules/core";
import { FunctionalParserTransform } from "./functional-transform.js";

type AnnotateStaticFunctionOverridesTransformOptions = Record<string, never>;

type ConstructorInfo = {
    node: MutableGameMakerAstNode;
    parentName: string | null;
    staticFunctions: Map<string, MutableGameMakerAstNode>;
};

class AnnotateStaticFunctionOverridesTransform extends FunctionalParserTransform<AnnotateStaticFunctionOverridesTransformOptions> {
    constructor() {
        super("annotate-static-overrides", {});
    }

    private annotateStaticFunctionOverrides(ast: MutableGameMakerAstNode) {
        const constructors = this.collectConstructorInfos(ast);

        if (constructors.size === 0) {
            return;
        }

        for (const info of constructors.values()) {
            if (!info.parentName) {
                continue;
            }

            for (const [staticName, statement] of info.staticFunctions) {
                if (
                    this.hasAncestorStaticFunction(
                        constructors,
                        info.parentName,
                        staticName
                    )
                ) {
                    statement._overridesStaticFunction = true;
                }
            }
        }
    }

    private collectConstructorInfos(
        ast: MutableGameMakerAstNode
    ): Map<string, ConstructorInfo> {
        if (!ast || typeof ast !== "object") {
            return new Map();
        }

        const constructors = new Map<string, ConstructorInfo>();

        for (const node of Core.getBodyStatements(
            ast as Record<string, unknown>
        )) {
            if (!Core.isNode(node) || node.type !== "ConstructorDeclaration") {
                continue;
            }

            const name = Core.isIdentifierNode(node.id)
                ? Core.getNonEmptyString(node.id.name)
                : null;
            if (!name) {
                continue;
            }

            let parentName: string | null = null;
            if (
                Core.isNode(node.parent) &&
                node.parent.type === "ConstructorParentClause"
            ) {
                const parentId = (node.parent as any).id;
                parentName = Core.isIdentifierNode(parentId)
                    ? Core.getNonEmptyString(parentId.name)
                    : null;
            }

            const staticFunctions = new Map<string, MutableGameMakerAstNode>();

            const statements = Core.getBodyStatements(
                (node as Record<string, unknown>).body as Record<
                    string,
                    unknown
                >
            ) as MutableGameMakerAstNode[];

            for (const statement of statements) {
                if (!this.isStaticFunctionDeclaration(statement)) {
                    continue;
                }

                const staticName = this.extractStaticFunctionName(statement);
                if (!staticName || staticFunctions.has(staticName)) {
                    continue;
                }

                staticFunctions.set(staticName, statement);
            }

            constructors.set(name, {
                node: node as MutableGameMakerAstNode,
                parentName,
                staticFunctions
            });
        }

        return constructors;
    }

    protected execute(
        ast: MutableGameMakerAstNode,
        _options: AnnotateStaticFunctionOverridesTransformOptions
    ): MutableGameMakerAstNode {
        this.annotateStaticFunctionOverrides(ast);
        return ast;
    }

    private hasAncestorStaticFunction(
        constructors: Map<string, ConstructorInfo>,
        startName: string | null | undefined,
        targetName: string
    ) {
        const visited = new Set<string>();
        let currentName = Core.getNonEmptyString(startName);

        while (currentName) {
            if (visited.has(currentName)) {
                break;
            }

            visited.add(currentName);
            const info = constructors.get(currentName);
            if (!info) {
                break;
            }

            if (info.staticFunctions.has(targetName)) {
                return true;
            }

            currentName = Core.getNonEmptyString(info.parentName);
        }

        return false;
    }

    private isStaticFunctionDeclaration(
        statement: MutableGameMakerAstNode | null | undefined
    ) {
        const declarator = this.getStaticFunctionDeclarator(statement);
        return declarator?.init?.type === "FunctionDeclaration";
    }

    private extractStaticFunctionName(
        statement: MutableGameMakerAstNode | null | undefined
    ) {
        const declarator = this.getStaticFunctionDeclarator(statement);

        if (!declarator) {
            return null;
        }

        if (!Core.isIdentifierNode(declarator.id)) {
            return null;
        }

        return Core.getNonEmptyString(declarator.id.name);
    }

    private getStaticFunctionDeclarator(
        statement: MutableGameMakerAstNode | null | undefined
    ) {
        if (!statement || statement.type !== "VariableDeclaration") {
            return null;
        }

        if (statement.kind !== "static") {
            return null;
        }

        if (!Core.isNonEmptyArray(statement.declarations)) {
            return null;
        }

        const [declarator] = statement.declarations;

        if (!declarator) {
            return null;
        }

        const declaratorId = (declarator as { id?: unknown }).id;
        if (!Core.isIdentifierNode(declaratorId)) {
            return null;
        }

        return declarator;
    }
}

const annotateStaticFunctionOverridesTransform =
    new AnnotateStaticFunctionOverridesTransform();

export function transform(
    ast: MutableGameMakerAstNode,
    opts: AnnotateStaticFunctionOverridesTransformOptions = {}
) {
    return annotateStaticFunctionOverridesTransform.transform(ast, opts);
}
