import test from "node:test";

import type * as LintWorkspace from "@gml-modules/lint";

type ExpectTrue<T extends true> = T;
type IsAssignable<TValue, TExpected> = TValue extends TExpected ? true : false;

type LanguageShapeContract = {
    fileType: "text";
    lineStart: 1;
    columnStart: 0;
    nodeTypeKey: "type";
    defaultLanguageOptions: { recovery: "none" | "limited" };
    visitorKeys: Record<string, string[]>;
    parse: (
        file: { body?: string; text?: string; path?: string },
        context: { languageOptions?: unknown }
    ) =>
        | { ok: true; ast: unknown; parserServices: unknown; visitorKeys: unknown }
        | { ok: false; errors: ReadonlyArray<{ message: string; line: number; column: number }> };
    createSourceCode: (
        file: { body?: string; text?: string; bom?: boolean },
        parseResult: { ok: true; ast: unknown; parserServices: unknown; visitorKeys: unknown },
        context: { languageOptions?: unknown }
    ) => unknown;
    validateLanguageOptions: (languageOptions: unknown) => void;
    normalizeLanguageOptions: (languageOptions: unknown) => { recovery: "none" | "limited" };
};

type GMLLanguageMatchesContract = ExpectTrue<
    IsAssignable<typeof LintWorkspace.Lint.plugin.languages.gml, LanguageShapeContract>
>;
void (0 as unknown as GMLLanguageMatchesContract);

void test("compile-time language contract assertions are represented at runtime", () => {
    // compile-time contract lives in the type aliases above; this test anchors the file in node --test.
});
