# Defensive Input Hardening Playbook

The `Codex – Defensive Input Hardening` workflow searches for functions that
accept `any`/loosely typed parameters or deserialize external data without
performing checks. When the workflow files a pull request, contributors should
lean on the following defensive programming patterns:

## 1. Validate external inputs early
- Parse untyped payloads through runtime schema validators (e.g. Zod, Yup) or
  lightweight shape checks before data reaches business logic.
- Reject malformed objects with explicit errors so call-sites fail loudly.
- Normalize optional fields during validation to eliminate `undefined` drift
  later in the pipeline.

## 2. Prefer safe type boundaries
- Replace `any` parameters with narrower TypeScript unions or branded aliases
  that capture the intended shape.
- Introduce dedicated parsing helpers that accept `unknown` and return typed
  results via user-defined type guards.
- Add exhaustive switch/case coverage when discriminated unions model incoming
  variants.

## 3. Layer default and fallback handling
- Supply defaults for omitted optional fields using object spread patterns or
  utility helpers such as `withDefaults`.
- Clamp numeric ranges, truncate strings, and sanitize enums before persisting
  values.
- When bridging legacy callers, wrap existing APIs with adapter functions that
  perform normalization while preserving the outward contract.

## 4. Strengthen test coverage around validation
- Add regression tests covering both the failure mode prior to validation and
  the hardened path after the change.
- Exercise boundary cases (empty strings, nullish values, extreme numbers) to
  ensure guard rails stay intact.
- Document the expected error messages or defaults in test assertions so future
  regressions are easy to spot.

Following these guardrails keeps external data ingestion predictable and makes
it easier to reason about error handling across the formatter and parser
surfaces.
