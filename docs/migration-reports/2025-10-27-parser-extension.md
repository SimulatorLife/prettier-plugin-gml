# Parser Extension Migration Report (2025-10-27)

## Summary

* Regenerated all ANTLR JavaScript artifacts using the vendored
  `antlr4-4.13.2-complete.jar` tool. Generated files now exactly match the output
  of ANTLR 4.13.2 without embedded custom logic.
* Reimplemented visitor and listener delegation features as subclasses living in
  `src/parser/src/extensions/`.
* Restored resilient error handling by patching the ANTLR
  `RecognitionException` prototype via `installRecognitionExceptionLikeGuard()`.
* Updated package scripts, tests, and documentation to reference the new
  extension points and regeneration workflow.

## Extracted Customizations

| Category              | Original Location                                       | New Location / Approach |
| --------------------- | -------------------------------------------------------- | ----------------------- |
| Visitor delegation    | `generated/GameMakerLanguageParserVisitor.js`            | `src/parser/src/extensions/game-maker-language-parser-visitor.js`
| Listener delegation   | `generated/GameMakerLanguageParserListener.js`           | `src/parser/src/extensions/game-maker-language-parser-listener.js`
| Recognition guard     | `generated/GameMakerLanguageParser.js` catch blocks      | `installRecognitionExceptionLikeGuard()` patch invoked by `src/parser/src/gml-parser.js`

## Compatibility Notes

* `src/parser/gml-parser.js` now re-exports the visitor and listener helpers so
  downstream consumers can continue importing the ergonomic wrappers without
  touching generated code.
* Structural `instanceof` checks are installed at startup. Generated parser code
  remains untouched and can be regenerated deterministically.
* Grammar tweaks ensure regenerated output matches GameMaker’s syntax: a
  `UnaryPlusExpression` alternative now handles leading `+` operators and the
  constructor parent clause reuses the shared `arguments` rule so parent calls
  accept full expressions (e.g. `eInputType.keyboard`).

## Follow-up

* Regenerate artifacts whenever the grammar changes by running `npm run build:antlr`.
* Update the migration documentation if additional extension points are added in
  the future.
