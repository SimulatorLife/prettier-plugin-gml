# ANTLR Regeneration Guide

This project vendors the ANTLR toolchain to keep parser builds reproducible. The
`resources/antlr/antlr4-4.13.2-complete.jar` artifact is the canonical source
for generating JavaScript parser and lexer code from the
`GameMakerLanguageLexer.g4` and `GameMakerLanguageParser.g4` grammars.

## Prerequisites

* Java 21 (or any modern JVM capable of running the ANTLR tool JAR).
* Node.js dependencies installed via `npm ci` at the repository root.

The ANTLR runtime for JavaScript remains an npm dependency (`antlr4@4.13.2`);
it is distinct from the tool JAR that produces the generated sources.

## Regenerating Parser Artifacts

1. Ensure the working tree is clean and dependencies are installed.
2. From the repository root run:

   ```bash
   npm run build:antlr
   ```

   The root script changes into `src/parser` and invokes the workspace
   `antlr` script, which executes the vendored ANTLR JAR twice—once per
   grammar—writing fresh artifacts into `src/parser/generated/`.

3. Verify the working tree is still clean. Any manual edits to
   `src/parser/generated/**` indicate a divergence that must be resolved by
   adjusting grammar files or the non-generated extension points.

## Extension Points

Custom parser behavior now lives outside the generated directory:

* `src/parser/src/extensions/game-maker-language-parser-visitor.js` exposes the
  delegate-driven visitor wrapper. It subclasses the generated visitor to keep
  the public API intact (`VISIT_METHOD_NAMES`, delegate hook, etc.).
* `src/parser/src/extensions/game-maker-language-parser-listener.js` mirrors the
  listener delegation model. It composes optional per-rule handlers while
  preserving the generated listener contract via inheritance.
* `src/parser/src/extensions/recognition-exception-patch.js` installs a
  structural `instanceof` guard so that recognition errors created by bundled
  runtimes still satisfy `re instanceof antlr4.error.RecognitionException`.
  `src/parser/src/gml-parser.js` installs the guard during module initialization.

Consumers can import the visitor and listener helpers via
`src/parser/gml-parser.js`, which now re-exports the extension classes and their
method name enumerations.

## Error Handling

`installRecognitionExceptionLikeGuard()` augments the ANTLR runtime at startup
so that any object matching `isRecognitionExceptionLike()` is treated as a
`RecognitionException`. This ensures the generated parser’s catch blocks follow
ANTLR’s normal recovery flow even when the runtime is bundled or proxied. The
helper lives in `src/parser/src/utils/recognition-exception.js` and is invoked
by `src/parser/src/gml-parser.js` before parsing begins.

## Grammar Adjustments

The following grammar fixes accompany the extracted extensions:

* Unary plus expressions now map to a dedicated
  `UnaryPlusExpression` alternative, enabling constructs such as
  `var point = [+x, -y];` to parse without custom runtime patches.
* Constructor parent clauses (`function Foo() : Bar(...) constructor`) now
  reuse the `arguments` rule so that each parent argument is parsed as a full
  expression rather than a bare identifier token. This aligns the grammar with
  GameMaker’s syntax, where calls such as
  `: AbstractInputButton(button, eInputType.keyboard)` are valid.

When additional grammar updates are required, modify the `.g4` sources first
and rerun `npm run build:antlr` to refresh the generated JavaScript output.
