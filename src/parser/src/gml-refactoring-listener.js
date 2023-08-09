import antlr4 from "antlr4";
import GameMakerLanguageParserListener from "./generated/GameMakerLanguageParserListener.js";

export default class GMLRefactoringListener extends GameMakerLanguageParserListener {
    constructor() {
        super();
        this.refactorings = [];
    }

    // Utility function to transform string to snake_case
    toSnakeCase(string) {
        return string
            .replace(/([A-Z])/g, ' $1')
            .trim()
            .toLowerCase()
            .replace(/[\s\W]+/g, '_');
    }

    // Utility function to transform string to PascalCase
    toPascalCase(string) {
        return string
            .replace(/(\w)(\w*)/g, (g0, g1, g2) => g1.toUpperCase() + g2.toLowerCase())
            .replace(/[\s\W]+/g, '');
    }

    // Macro should use all caps snake-case names
    exitMacroStatement(ctx) {
        let macroName = ctx.getText();
        let refactoredName = this.toSnakeCase(macroName).toUpperCase();
        if (macroName !== refactoredName) {
            this.refactorings.push({
                type: 'rename-macro',
                original: macroName,
                suggestion: refactoredName,
                start: ctx.start.start,
                stop: ctx.stop.stop
            });
        }
    }

    // Function names should use all lowercase snake-case names
    exitFunctionDeclaration(ctx) {
        let functionName = ctx.getText();
        let refactoredName = this.toSnakeCase(functionName);
        if (functionName !== refactoredName) {
            this.refactorings.push({
                type: 'rename-function',
                original: functionName,
                suggestion: refactoredName,
                start: ctx.start.start,
                stop: ctx.stop.stop
            });
        }
    }

    // Struct names should use PascalCase
    exitStructLiteral(ctx) {
        let structName = ctx.getText();
        let refactoredName = this.toPascalCase(structName);
        if (structName !== refactoredName) {
            this.refactorings.push({
                type: 'rename-struct',
                original: structName,
                suggestion: refactoredName,
                start: ctx.start.start,
                stop: ctx.stop.stop
            });
        }
    }

    // Variable names should use all lowercase snake-case names
    exitVariableExpression(ctx) {
        let variableName = ctx.getText();
        let refactoredName = this.toSnakeCase(variableName);
        if (variableName !== refactoredName) {
            this.refactorings.push({
                type: 'rename-variable',
                original: variableName,
                suggestion: refactoredName,
                start: ctx.start.start,
                stop: ctx.stop.stop
            });
        }
    }
}
