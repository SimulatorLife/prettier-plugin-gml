# Codex automation reference

This catalog describes the Codex automation that regularly opens follow-up pull
requests. Each entry summarises the workflow's intent so contributors know what
to expect when Codex files a patch and how to review it effectively.

## Document intent sweeps (`codex-document-intent.yml`)

Codex inspects inline comments for phrases like "no-op" or imperative "do X"
notes that skip the underlying rationale. When it finds fragile or
context-dependent sections annotated with throwaway comments, Codex proposes
clarifying the note so future contributors understand the behaviour being
protected. Expect updates that:

- expand short comments with the reasoning behind guard clauses or unusual
  control flow;
- call out risks if the surrounding implementation changes; and
- link to design documents or reference guides whenever the context lives
  outside the file.

Reviewers should ensure the suggested explanations accurately reflect the code
path and that any new links point at durable documentation.

----

## POLA behaviour audit workflow

The "Codex: POLA Behaviour Audit" automation focuses on the Principle of Least
Astonishment. The workflow triages spots where comments, option descriptions, or
user-facing docs promise one outcome but the code implements another. Keeping
expectations and reality aligned prevents configuration foot-guns and helps
contributors trust the formatter.

### Review checklist

When Codex opens a pull request for this workflow:

1. **Confirm the contradiction.** Reproduce the cited behaviour gap by reading
   the implementation and, when possible, running the relevant tests or script.
   The example should demonstrate how a player or contributor would be
   surprised.
2. **Decide between code or docs.** Evaluate whether correcting the behaviour or
   clarifying the documentation best honours the published contract. Prefer
   fixing code if existing users rely on the documented promise; otherwise, make
   the docs explicit about the actual runtime behaviour.
3. **Check for ripple effects.** If code changes are proposed, ensure new tests
   cover the clarified behaviour and that neighbouring options or helper
   routines stay consistent. For documentation updates, verify that all
   references to the option (README, CLI help, inline comments) reflect the new
   wording.
4. **Document the resolution.** Expect the PR body to explain the original
   mismatch and the reasoning behind the chosen fix. Request revisions if the
   trade-offs or migration notes are unclear.

Following this checklist keeps the formatter predictable and reduces "surprise"
bugs stemming from mismatched intent and implementation.

----


## Abstraction Layer Stewardship (codex-sla)

- **Workflow**: `.github/workflows/codex-sla.yml`
- **Cadence**: Scheduled every four hours with an option for manual dispatch when urgent review is required.
- **Objective**: Locate orchestrator-style functions that mix high-level sequencing with inline primitive work such as array/index manipulation, and restructure them so low-level mechanics live in named helpers.
- **SLA Expectation**: Each Codex run that opens this workflow's PR should land a refinement keeping the orchestrator at a single abstraction layer—delegating detailed bookkeeping to helpers, documenting new contracts, and preserving behaviour with existing or new tests as needed.

----


## Single Responsibility Guardrail

The **Codex SRP – Single Responsibility Guardrail** workflow (`codex-srp.yml`)
scans for functions that balloon past a configurable line limit and combine
multiple verb stems in their names (for example `initComputeRender`). Those cues
usually indicate that a single unit is juggling distinct duties. When triggered,
Codex proposes extracting helper functions so each piece of logic owns exactly
one change-triggering responsibility. The follow-up review should focus on
whether the extracted helpers keep behaviour intact, have meaningful names, and
leave the remaining code easier to extend without cascading edits.

Tweak the workflow dispatch inputs to adjust the acceptable line threshold or
to monitor a different list of verb cues. If a scheduled run finds no matches,
Codex reports the audit instead of forcing a refactor.

----


## Codex 80 – Low Coupling Guardrail

The low-coupling workflow scans for modules that import siblings or cousins via
fragile deep paths—specifically:

- Relative imports that climb multiple directory levels (for example `../..`).
- Paths that reach into `internal` directories that should be treated as
  implementation details.

When Codex opens a pull request from this workflow, it should recommend
structural boundaries that keep consumers aligned with stable contracts. The
expected remediation patterns include:

- **Interfaces and abstract types** that define the collaborator’s public
  surface, keeping callers unaware of underlying implementations.
- **Adapters or facades** that translate between domains or expose curated entry
  points so downstream modules stop depending on private utilities.
- **Factories** that construct the right concrete implementation while returning
  interface-shaped handles to consumers.
- **Dependency injection** (constructor parameters, factory arguments, or
  provider functions) so modules receive collaborators from the outside instead
  of importing deep internal files.

Codex should note when deeper redesign is required, but its default move is to
introduce the smallest abstraction that removes the deep import while preserving
behaviour and test coverage.

----

## Defensive Input Hardening

The `Codex – Defensive Input Hardening` workflow searches for functions that
accept `any`/loosely typed parameters or deserialize external data without
performing checks. When the workflow files a pull request, contributors should
lean on the following defensive programming patterns:

### 1. Validate external inputs early
- Parse untyped payloads through runtime schema validators (e.g. Zod, Yup) or
  lightweight shape checks before data reaches business logic.
- Reject malformed objects with explicit errors so call-sites fail loudly.
- Normalize optional fields during validation to eliminate `undefined` drift
  later in the pipeline.

### 2. Prefer safe type boundaries
- Replace `any` parameters with narrower TypeScript unions or branded aliases
  that capture the intended shape.
- Introduce dedicated parsing helpers that accept `unknown` and return typed
  results via user-defined type guards.
- Add exhaustive switch/case coverage when discriminated unions model incoming
  variants.

### 3. Layer default and fallback handling
- Supply defaults for omitted optional fields using object spread patterns or
  utility helpers such as `withDefaults`.
- Clamp numeric ranges, truncate strings, and sanitize enums before persisting
  values.
- When bridging legacy callers, wrap existing APIs with adapter functions that
  perform normalization while preserving the outward contract.

### 4. Strengthen test coverage around validation
- Add regression tests covering both the failure mode prior to validation and
  the hardened path after the change.
- Exercise boundary cases (empty strings, nullish values, extreme numbers) to
  ensure guard rails stay intact.
- Document the expected error messages or defaults in test assertions so future
  regressions are easy to spot.

Following these guardrails keeps external data ingestion predictable and makes
it easier to reason about error handling across the formatter and parser
surfaces.
