# Codex workflow guide

This guide captures the bespoke automation we run through the Codex PR seeding
workflows. Each entry summarises the intent of the workflow, the hotspots it
reviews, and the architectural guardrails we expect it to reinforce.

## Policy mechanism separation

**Workflow:** `.github/workflows/codex-policy-mechanism.yml`

### Why this exists

Several formatter subsystems evolved utility modules that both compute policy
heuristics (flags, thresholds, cache sizing, or diagnostic lookups) and execute
the operational steps that mutate state or perform I/O. Bundling the policy and
mechanism together makes the code difficult to audit, limits our ability to test
policy decisions in isolation, and encourages copy-paste heuristics that drift
out of sync.

### Hotspots we monitor

- Bootstrapping flows that both choose cache or discovery policy and immediately
  perform filesystem orchestration. When the same module decides whether work is
  needed and performs it, we lose the ability to reuse the policy elsewhere.
- Coordinators that interleave concurrency or caching strategy with I/O. The
  logic that determines eviction thresholds or rebuild triggers should feed a
  worker, not drive the filesystem directly.
- Transformation pipelines where diagnostic heuristics live beside the mutation
  routines. Embedding the "should we fix this" logic inside the function that
  mutates the AST or document makes it impossible to exercise the heuristics in
  isolation.

### Expected Codex outcome

We expect Codex to identify one of these hotspots (or a newly added peer) and
extract the policy evaluation into a dedicated evaluator, strategy object, or
ruleset module. The mechanism code should delegate to the new abstraction rather
than inlining the heuristics. The resulting design ought to:

- Preserve existing behaviour while making the policy testable in isolation.
- Document the seam so future contributors avoid re-coupling policy and
  mechanism code.
- Encourage incremental clean-up that chips away at the monolithic modules
  highlighted above.
