# Semantic Index and Codemod Streaming Plan

## 1. Problem Statement

Running the refactor codemod pipeline on a large real project can exceed 15GB memory and take a very long time.

Example workload:
- pnpm run cli -- fix --project-root /Users/henrykirk/GameMakerStudio2/InterplanetaryFootball

Root cause pattern:
- The semantic index and codemod planner retain very large project-wide in-memory aggregates for too long.
- Some containers are unbounded or effectively unbounded for large projects.
- Processing is partially concurrent, but results are still merged into monolithic structures that stay alive across phases.

This document proposes structural memory reduction, not heap-size scaling.

## 2. Goals and Non-Goals

### 2.1 Goals

1. Reduce peak RSS and heap by avoiding full-project in-memory aggregates where possible.
2. Improve throughput on large projects by using bounded-memory streaming and chunked processing.
3. Preserve codemod correctness checks that need whole-plan visibility.
4. Keep resulting codemodded GML semantically equivalent to current behavior.
5. Keep architecture deterministic at the output level, while allowing internal processing order differences.

### 2.2 Non-Goals

1. Increasing max-old-space-size as the primary solution.
2. Introducing broad user-facing configuration for internal pipeline internals.
3. Rewriting unrelated formatter/linter architecture.
4. Vector-database style retrieval for this workflow.

## 3. Confirmed Hotspots (Current Code)

### 3.1 Semantic Index Build Aggregation

Primary seams:
- src/semantic/src/project-index/builder.ts
- buildProjectIndex
- processProjectGmlFilesForIndex
- createProjectIndexResultSnapshot

Observed pattern:
- Large identifier occurrence collections grow throughout build lifecycle.
- Snapshot creation happens after large in-memory accumulation.

### 3.2 Scope Symbol Indexes and Caches

Primary seam:
- src/semantic/src/scopes/scope-tracker.ts

Observed pattern:
- Symbol to scope index and lookup caches can remain live with large cardinality.

### 3.3 Codemod Edit and Overlay Retention

Primary seams:
- src/refactor/src/refactor-engine.ts
- src/refactor/src/workspace-edit.ts
- src/refactor/src/codemods/naming-convention/naming-convention-codemod.ts

Observed pattern:
- Workspace edits and intermediate file-content overlays can accumulate across many files.
- Existing rename chunking helps, but does not fully bound all retained state.

## 4. Option Set and Trade-Offs

## 4.1 Option A: Temp-File Chunking (Default Recommendation)

Design:
- Stream heavy intermediate data to temporary chunk files.
- Keep only bounded hot windows in memory.
- Use append-only chunk records plus a compact in-memory offset index.

Pros:
1. No heavy runtime dependency required.
2. Lowest implementation risk and fastest path to impact.
3. Strong memory reduction potential by limiting live aggregates.
4. Straightforward cleanup and failure-path handling.

Cons:
1. Less expressive query capability than SQL.
2. Requires careful chunk/index format design.
3. Can add parsing overhead if format is too verbose.

Best fit:
- First implementation pass for immediate throughput and memory gains.

## 4.2 Option B: SQLite Backing Store (Optional)

Design:
- Persist index and/or edit plan structures to SQLite.
- Query through indexed tables instead of in-memory maps.

Pros:
1. Strong query flexibility and mature indexing support.
2. Better random-access patterns than plain chunk files.
3. Transactional behavior can simplify consistency guarantees.

Cons:
1. Additional dependency and schema lifecycle complexity.
2. Migration/versioning overhead.
3. Potential write amplification and tuning requirements.

Best fit:
- Follow-up if benchmarks show clear wins over temp-file backend.

## 4.3 Option C: Hybrid Bounded-Memory plus Spill (Target Architecture)

Design:
- Unified storage interface with bounded in-memory hot cache.
- Spill cold/heavy data to disk backend.
- Default backend temp files; optional SQLite backend.

Pros:
1. High practical memory reduction with good throughput.
2. Incremental migration path and low rollback risk.
3. Backend swap flexibility without changing planner logic.

Cons:
1. More engineering than single hardcoded backend.
2. Requires clear lifecycle and ownership boundaries.

Best fit:
- Long-term maintainable architecture while delivering short-term gains.

## 5. Recommended Architecture

Use Option C (Hybrid), implemented in phases:
1. Implement Option A first as the default backend.
2. Keep the storage/query contract backend-agnostic.
3. Add Option B only if benchmark thresholds are met.

Design principles:
1. Keep whole-plan conflict checks in memory when required.
2. Stream large occurrence and edit payloads.
3. Release buffers immediately after commit boundaries.
4. Bound caches with explicit size limits and eviction policy.

## 6. Phased Implementation Plan

## 6.1 Phase 0: Measurement and Guardrails

Objective:
- Make memory and throughput regressions visible before refactoring internals.

Tasks:
1. Add fix-command stage telemetry in src/cli/src/commands/fix.ts.
2. Add semantic index phase telemetry in src/semantic/src/project-index/builder.ts.
3. Add codemod queue and overlay telemetry in src/refactor/src/refactor-engine.ts.
4. Add WorkspaceEdit size counters in src/refactor/src/workspace-edit.ts.
5. Include high-water memory snapshots, not only deltas.

Deliverables:
1. Stage-level and phase-level memory and runtime metrics for fix workflow.
2. Baseline report for InterplanetaryFootball run.

## 6.2 Phase 1: Semantic Identifier Streaming

Objective:
- Eliminate monolithic in-memory identifier accumulation.

Tasks:
1. Introduce IdentifierSink interface in semantic project-index domain.
2. Replace direct global map aggregation with sink writes.
3. Implement temp-file chunk sink with bounded flush thresholds.
4. Build compact chunk metadata index for efficient lookup.
5. Add LRU read-through page cache with explicit cap.
6. Bound or replace unbounded lookup cache patterns in scope tracking where safe.

Correctness constraints:
1. Snapshot output semantics must remain unchanged.
2. Query responses must remain semantically equivalent.

## 6.3 Phase 2: Codemod Plan and Edit Streaming

Objective:
- Prevent unbounded edit and content overlay growth during codemods.

Tasks:
1. Refactor WorkspaceEdit into segment-based or spillable edit storage.
2. Update applyWorkspaceEdit to process file-batched transactions.
3. Release per-file buffers immediately after apply.
4. Keep global preflight validation for rename conflicts and circular renames.
5. Execute heavy edit materialization in bounded chunks.
6. Limit dry-run overlay retention by using temp snapshots.

Correctness constraints:
1. Preflight validation must still see complete rename plan.
2. Final transformed GML content must remain semantically equivalent.

## 6.4 Phase 3: Optional SQLite Backend and Benchmark Gate

Objective:
- Evaluate whether SQLite materially improves throughput and memory.

Tasks:
1. Add StorageBackend contract with TempFileBackend and SQLiteBackend.
2. Run A/B benchmarks on InterplanetaryFootball and fixture profile suites.
3. Keep temp-file backend as default unless thresholds are met.

Adoption thresholds:
1. At least 20 percent wall-clock improvement, or
2. At least 25 percent max-RSS reduction,
3. With no correctness regressions.

## 7. Correctness and Determinism Strategy

Some checks require full-plan visibility and should remain whole-plan:
1. Circular rename detection.
2. Duplicate target-name collision detection.
3. Cross-file consistency preflight checks.

Streaming-safe components:
1. Heavy occurrence payload storage.
2. Batched edit application.
3. Temporary transformed content storage.

Allowed variation:
1. Internal processing order may differ.
2. Final codemodded output must remain semantically equivalent.

## 8. Verification Plan

## 8.1 Functional and Regression Tests

1. pnpm run test:semantic
2. pnpm run test:refactor
3. Add targeted tests for spill and chunk behavior in semantic and refactor test suites.
4. Add failure-path tests to verify temp artifact cleanup.

## 8.2 Performance and Memory Validation

1. pnpm run test:fixtures:profile
2. pnpm run test:fixtures:profile:deep-cpu
3. pnpm run cli -- fix --project-root /Users/henrykirk/GameMakerStudio2/InterplanetaryFootball

Track:
1. Max RSS high-water mark.
2. Heap high-water mark.
3. Stage-by-stage duration.
4. Total wall-clock runtime.

Acceptance criteria:
1. Significant memory reduction vs baseline on InterplanetaryFootball.
2. Throughput improvement or at minimum no throughput regression.
3. No semantic regressions in codemodded output.

## 9. Risk Register and Mitigations

1. Risk: Chunking introduces hidden ordering bugs.
Mitigation: Keep whole-plan preflight checks and add chunk-order invariance tests.

2. Risk: Spill format parsing overhead hurts throughput.
Mitigation: Start with JSONL for speed of implementation, move to compact records only if profiling requires.

3. Risk: Temp artifacts leak on interruption.
Mitigation: Use scoped temp directories and finally-block cleanup with tests.

4. Risk: Cache bounds cause query thrash.
Mitigation: Use telemetry-driven tuning and LRU policy with explicit caps.

5. Risk: Backend abstraction adds complexity.
Mitigation: Keep interface narrow and avoid speculative features.

## 10. Concrete Initial Work Slice (High-Impact, Low-Risk)

Implement first:
1. Phase 0 instrumentation.
2. Phase 1 IdentifierSink with temp-file chunk backend.
3. Bounded LRU around chunk reads.
4. Minimal Phase 2 change to make WorkspaceEdit spillable in large runs.

Defer until measured:
1. SQLite backend.
2. Any advanced compact binary serialization.

## 11. Summary Decision

Recommended path:
1. Build a hybrid architecture with temp-file chunking as default.
2. Keep whole-plan validations in memory.
3. Stream heavy payloads and apply edits in bounded batches.
4. Add SQLite only if benchmark gate is met.

This path directly targets memory and runtime bottlenecks for large project codemod runs while preserving correctness and maintainability.

## 12. Implementation Status (Current)

Implemented in this repository:
1. Semantic index now supports an optional hybrid spill path through `identifierSink` in `buildProjectIndex`.
2. The default spill implementation is temp-file JSONL chunking with bounded in-memory tails.
3. Snapshot materialization reads identifier declaration/reference payloads through the sink when enabled, preserving output shape.
4. Sink telemetry now reports appended/spilled record counters and read-cache hit/miss metrics.
5. Semantic index build now captures high-water memory snapshots (`maxRss`, `maxHeapUsed`) in metrics metadata.
6. Scope-tracker caches now use bounded eviction for lookup and identifier-resolution caches.
7. `fix` command now emits per-stage duration plus RSS/heap high-water telemetry.
8. Refactor codemod execution now emits queue/overlay telemetry and supports a telemetry callback hook.
9. `WorkspaceEdit` now tracks size/counter telemetry (`text bytes`, high-water bytes, touched file count).
10. Refactor dry-run overlay now supports temp-file spill via a storage backend when in-memory overlay bytes exceed a configured threshold.
11. Spill backends now use collision-safe, digest-suffixed filenames to prevent key aliasing when sanitized path segments collide.
12. Codemod overlay spill-limit enforcement now uses iterative draining (instead of recursion) to keep large-run behavior stack-safe.
13. Refactor spill backend now handles lifecycle/failure paths explicitly: writes after dispose are rejected, reads after dispose return null, and externally removed spill files are treated as cache misses.
14. Semantic identifier sink now handles lifecycle/failure paths explicitly: appends become no-ops after dispose, reads after dispose return empty results, and corrupted/missing spill files are treated as safe cache misses while retaining in-memory tails.
15. Overlay spill accounting now caches per-file byte sizes to avoid repeated `Buffer.byteLength(...)` recomputation during threshold enforcement, and semantic sink spill-path cleanup now uses direct path-to-record-key mappings to avoid O(n) scans.
16. Refactor codemod dry-run overlay spilling is now backend-agnostic via `StorageBackend`, allowing callers to inject a backend while keeping temp-file spill as the default.
17. Codemod overlay telemetry now reports total overlay entry count across both in-memory and spilled entries so high-water summaries remain accurate under heavy spill.

Current codemod overlay spill controls:

```ts
await engine.executeConfiguredCodemods({
	// ...existing request fields,
	dryRun: true,
	dryRunOverlaySpillThresholdBytes: 4 * 1024 * 1024,
	dryRunOverlayReadCacheMaxEntries: 32
});
```

Current configuration entry point:

```ts
await buildProjectIndex(projectRoot, undefined, {
	identifierSink: {
		enabled: true,
		flushThreshold: 256,
		retainedEntriesPerKey: 32,
		readCacheMaxEntries: 32
	}
});
```

Notes:
1. Temp-file spill remains the default backend for the hybrid path.
2. SQLite remains optional and deferred behind benchmark gates.

## 13. Benchmark Runbook (Current)

Use this runbook for Option C acceptance checks and regression tracking.

Pre-flight:
1. Ensure workspace is type-clean and lint-clean:
	1. `pnpm run build:ts`
	2. `pnpm run lint:quiet`
2. Ensure semantic/refactor correctness is green:
	1. `pnpm run test:semantic`
	2. `pnpm run test:refactor`

Profiling suites:
1. Standard fixture profile:
	1. `pnpm run test:fixtures:profile`
2. Deep CPU fixture profile:
	1. `pnpm run test:fixtures:profile:deep-cpu`

Real-project workload:
1. Run fix workflow against target project:
	1. `pnpm run cli -- fix --project-root /Users/henrykirk/GameMakerStudio2/InterplanetaryFootball`
2. Capture telemetry emitted by:
	1. `src/cli/src/commands/fix.ts` stage telemetry (duration + RSS/heap high-water)
	2. semantic project-index metrics metadata (`maxRss`, `maxHeapUsed`)
	3. refactor codemod overlay telemetry (queue/overlay/spill/cache counters)

Pass gate:
1. No semantic/output regressions in fixtures and integration suites.
2. Memory reduction and/or throughput improvements satisfy thresholds:
	1. >= 20% wall-clock improvement, or
	2. >= 25% max-RSS reduction.

Current blocker status (as of 2026-03-15):
1. `pnpm run test:semantic` passes.
2. `pnpm run test:refactor` passes.
3. `pnpm run test:fixtures:profile` currently fails due fixture correctness regressions (not budget failures), including:
	1. `[format] test-operators` parse error (`unexpected symbol 'myCount'`).
	2. `[integration] test-int-comments-ops` output mismatch.
	3. `[integration] test-int-logic-flow` output mismatch.
4. `pnpm run test:fixtures:profile:deep-cpu` fails for the same fixture correctness regressions.

Interpretation:
1. Option C memory/streaming plumbing is benchmark-ready.
2. Final benchmark sign-off remains blocked until existing fixture correctness regressions are resolved.
