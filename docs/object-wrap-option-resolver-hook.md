# Object wrap option resolver hook

## Pre-change analysis
- `resolveObjectWrapOption` inside `printer/print.js` evaluates the Prettier
  option bag directly and forces the default behaviour to `preserve` whenever the
  user does not explicitly request `collapse`.
- Advanced integrations (editor previews, CLI experiments) sometimes need to
  stage alternate wrapping heuristics without exposing new public configuration.
  Today they must fork the printer or patch `print.js` to experiment with
  different wrapping policies.
- Because `resolveObjectWrapOption` is hard-coded, downstream helpers cannot plug
  in custom logic or stage gradual roll-outs that change the wrapping rule based
  on project context.

## Extension seam
- Extract the object-wrap resolution logic into
  `options/object-wrap-option.js` and introduce a small resolver registry.
- Export `setObjectWrapOptionResolver` so advanced tooling can provide a custom
  resolver while keeping the default behaviour intact.
- Provide a paired `resetObjectWrapOptionResolver` helper so experiments can
  restore the default resolver after executing, mirroring the pattern used by the
  reserved identifier metadata hook.

## Default behaviour and evolution
- Without an override the formatter still resolves to `preserve`, only switching
  to `collapse` when the Prettier option explicitly asks for it.
- The hook is intended for integrators embedding the formatter (editor previews,
  CLI migrations) who need to experiment with alternate wrapping rules without
  widening the public option surface.
- The resolver always normalizes invalid outputs back to `preserve`, keeping the
  plugin opinionated and predictable. Future iterations can layer additional
  hooks (for example, per-node object wrap strategies) on top of this registry if
  the need arises.
