/**
 * runtimeEnvSnapshot — capture / re-apply the env vars that drive in-page
 * render behavior.
 *
 * `fileServer.ts` reads several `PRODUCER_RUNTIME_*` and `PRODUCER_RENDER_*`
 * variables at module-load time and bakes them into the served HTML's
 * `RENDER_MODE_SCRIPT`. Distributed chunk workers are separate processes
 * that may inherit a different environment, so the plan freezes a snapshot
 * of the controller's env. The chunk worker then materializes the snapshot
 * back into `process.env` before launching its file server, which keeps the
 * served HTML byte-identical to what the controller would have served.
 *
 * Used by `freezePlan` (capture side) and the chunked render worker
 * (re-apply side). Kept here as a standalone utility because it has no
 * dependency on the plan-freeze pipeline.
 */
/**
 * Env-var name prefixes captured by {@link snapshotRuntimeEnv}. Exported so
 * the chunk-worker side can apply the same filter when materializing a
 * snapshot — asymmetric handling would leak stale controller env into
 * worker behavior.
 */
export declare const RUNTIME_ENV_PREFIXES: readonly string[];
/**
 * Snapshot `process.env` keys that match any of {@link RUNTIME_ENV_PREFIXES}
 * into a plain string→string record. Returns a NEW object each call (never a
 * live reference to `process.env`) so subsequent mutations of the process
 * env do not retroactively change a frozen plan.
 *
 * Pass an optional `env` for tests that don't want to mutate the real
 * process env. The default reads `process.env`.
 */
export declare function snapshotRuntimeEnv(env?: Record<string, string | undefined>): Record<string, string>;
/**
 * Apply a `runtimeEnv` snapshot to `process.env` (or another env-like
 * record) before the file server starts. Filters by
 * {@link RUNTIME_ENV_PREFIXES} so a planDir with extra keys can't smuggle
 * arbitrary env vars onto the worker — the controller's
 * {@link snapshotRuntimeEnv} already filtered, but apply-side filtering
 * is mandatory defense-in-depth against a hand-crafted or corrupted plan.
 *
 * Returns a `restore()` function that reverts `env` to its pre-apply
 * state for the keys this call touched. Callers that run multiple chunks
 * in a single process (Cloud Run Job, Temporal activity worker) MUST
 * invoke `restore()` in a `finally` block — without it, chunk N's
 * snapshot leaks into chunk N+1's environment.
 *
 * Existing snapshot keys are overwritten. Keys NOT in the snapshot are
 * never touched — the worker's host may set additional runtime knobs
 * (`HYPERFRAMES_EXTRACT_CACHE_DIR`, etc.).
 */
export declare function applyRuntimeEnvSnapshot(snapshot: Record<string, string>, env?: Record<string, string | undefined>): {
    restore: () => void;
};
//# sourceMappingURL=runtimeEnvSnapshot.d.ts.map