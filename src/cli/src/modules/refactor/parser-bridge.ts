import { readFile } from "node:fs/promises";

import { Parser } from "@gml-modules/parser";
import type { AstNode, ParserBridge } from "@gml-modules/refactor";

/**
 * Parser bridge that adapts @gml-modules/parser to the refactor engine.
 */
export class GmlParserBridge implements ParserBridge {
    /**
     * Parse a GML file and return a refactor-compatible AST.
     * @param filePath Path to the GML file
     */
    async parse(filePath: string): Promise<AstNode> {
        const sourceText = await readFile(filePath, "utf8");
        const parser = new Parser.GMLParser(sourceText, {
            getLocations: true,
            simplifyLocations: true
        });

        const ast = parser.parse();

        // Adapt the @gml-modules/parser AST to @gml-modules/refactor AST
        return this.adaptNode(ast);
    }

    /**
     * Recursively adapts parser nodes to the refactor engine's AST interface.
     */
    private adaptNode(node: any): AstNode {
        if (!node || typeof node !== "object") {
            return {
                start: 0,
                end: 0
            };
        }

        const adapted: AstNode = {
            type: node.type,
            name: node.name || (node.id && typeof node.id === "object" ? node.id.name : node.id),
            start: node.start?.index ?? 0,
            end: node.end?.index ?? 0,
            children: []
        };

        // Standard nodes often have a 'body' or 'declarations' array
        if (Array.isArray(node.body)) {
            adapted.children.push(...node.body.map((n) => this.adaptNode(n)));
        } else if (node.body && typeof node.body === "object") {
            adapted.children.push(this.adaptNode(node.body));
        }

        if (Array.isArray(node.declarations)) {
            adapted.children.push(...node.declarations.map((n) => this.adaptNode(n)));
        }

        // Handle common expression properties
        for (const prop of [
            "init",
            "left",
            "right",
            "argument",
            "test",
            "consequent",
            "alternate",
            "object",
            "property",
            "expression"
        ]) {
            if (node[prop] && typeof node[prop] === "object") {
                adapted.children.push(this.adaptNode(node[prop]));
            }
        }

        // Handle arrays of arguments or elements
        if (Array.isArray(node.arguments)) {
            adapted.children.push(...node.arguments.map((n) => this.adaptNode(n)));
        }

        if (Array.isArray(node.elements)) {
            adapted.children.push(...node.elements.map((n) => this.adaptNode(n)));
        }

        return adapted;
    }
}
