# Codex Automation Guide

Codex automation keeps this repository honest by surfacing recurring refactors
that improve maintainability. Each workflow seeds a PR with a focused prompt so
Codex can explore and implement small, reviewable changes. Use this guide to
understand the intent behind those prompts and the architectural patterns they
reinforce.

## Favor composition over inheritance

The [`Codex – Favor Composition Over Inheritance`](../.github/workflows/codex-composition.yml)
workflow tracks classes that extend a parent and override several methods. Once a
class needs three or more overrides to bend the base implementation to its will,
subclassing is usually hiding multiple responsibilities inside one type. Codex is
asked to redirect those behaviours through composition-friendly patterns instead
of piling more conditionals into the subclass.

### Patterns Codex should reach for

- **Injected collaborators** — Extract the overridden behaviour into discrete
  helpers that are constructed or passed in with the class. Collaborators can own
  cross-cutting concerns (validation, persistence, formatting) so the original
  class orchestrates rather than implements everything itself.
- **Strategy objects** — When behaviour varies by configuration or runtime
  conditions, define an interface the parent class can call and supply concrete
  strategies via dependency injection. Each strategy isolates one variation and
  can be tested independently.
- **Mixin utilities** — If multiple classes share the same overridden snippets,
  promote those blocks into mixins or modules that can be composed together
  without forcing a shared base class.
- **Event emitters or hooks** — Instead of overriding lifecycle methods, surface
  well-named hooks that forward to delegates. Consumers register listeners or
  provide callbacks, keeping the inheritance tree shallow.

### Review checklist

- Did Codex replace the subclass overrides with delegates or mixins that make
  responsibilities clearer?
- Are any remaining overrides justified and limited to coordinating composed
  pieces rather than re-implementing parent logic wholesale?
- Were docs and tests touched by the refactor updated to match the new structure?

If a refactor would destabilise critical behaviour, Codex is instructed to stop
short of speculative changes and document the limitation in the PR summary. That
note helps maintainers decide how to approach the follow-up manually.
