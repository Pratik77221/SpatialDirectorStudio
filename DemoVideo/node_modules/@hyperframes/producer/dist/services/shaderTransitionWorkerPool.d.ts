/**
 * Pool of Node `worker_threads` Workers for off-main-thread shader-blend
 * execution. See `shaderTransitionWorker.ts` for the per-worker contract and
 * the hf#677 follow-up rationale (closing the JS event-loop ceiling on the
 * layered transition path).
 *
 * Pool shape:
 *
 * - Spawned once at the start of a layered render and terminated in the
 *   `finally`. Worker spawn cost is ~10–50 ms each; amortized over the
 *   full transition phase (typically 100+ frames) it's negligible.
 * - Pool size is sized to `min(layeredWorkerCount, cpuCount)`. We don't
 *   spawn more workers than DOM sessions (no benefit — at most N DOM
 *   sessions can be dispatching to us at any moment) and we don't oversubscribe
 *   beyond physical cores.
 * - Each Worker holds zero per-frame state. Pool simply dispatches one
 *   shader-blend per Worker at a time; ordering within the pool doesn't
 *   matter because each frame's output is gated by the encoder's
 *   `FrameReorderBuffer` upstream.
 *
 * API:
 *
 *   const pool = await createShaderTransitionWorkerPool({ size, log });
 *   const result = await pool.run({
 *     shader, bufferA, bufferB, output, width, height, progress,
 *   });
 *   // result.bufferA / result.bufferB / result.output are the same memory,
 *   // now re-attached to the main thread.
 *   await pool.terminate();
 *
 * Buffer transfer contract: `run` takes Node Buffers, transfers their
 * underlying ArrayBuffers to the worker, and returns NEW Buffer views over
 * the transferred-back ArrayBuffers. The caller is responsible for
 * swapping its Buffer references — the *original* Buffers passed in are
 * detached (their `.length` becomes 0 / accessing throws) after `run` resolves.
 */
interface PoolLogger {
    info?: (msg: string, meta?: Record<string, unknown>) => void;
    warn?: (msg: string, meta?: Record<string, unknown>) => void;
    error?: (msg: string, meta?: Record<string, unknown>) => void;
}
export interface ShaderTransitionPoolOptions {
    /** Number of worker threads. Clamped to [1, cpus().length]. */
    size: number;
    /** Optional logger; falls back to no-op. */
    log?: PoolLogger;
    /**
     * Absolute filesystem path to the worker entry module. When provided, the
     * pool spawns workers from this exact path and skips the fallback
     * `import.meta.url`-based resolver entirely. Required by callers that
     * bundle the worker via a separate build (e.g. the CLI's tsup bundle):
     * `import.meta.url` inside the bundled pool resolves to the bundle's own
     * location, NOT the bundled worker entry's location, so the heuristic
     * resolver below cannot find the worker. Path extension determines the
     * loader behaviour (`.ts` → tsx/esm loader is appended to execArgv).
     */
    workerEntryPath?: string;
}
export interface ShaderBlendRequest {
    shader: string;
    bufferA: Buffer;
    bufferB: Buffer;
    output: Buffer;
    width: number;
    height: number;
    progress: number;
}
export interface ShaderBlendResult {
    /** Re-attached buffer A (zero-copy view over the transferred-back ArrayBuffer). */
    bufferA: Buffer;
    /** Re-attached buffer B. */
    bufferB: Buffer;
    /** Re-attached output buffer holding the shader-blended frame. */
    output: Buffer;
}
export interface ShaderTransitionWorkerPool {
    readonly size: number;
    run(req: ShaderBlendRequest): Promise<ShaderBlendResult>;
    terminate(): Promise<void>;
}
/**
 * Spawn a worker pool ready to run shader-blends. The returned pool is
 * usable as soon as the function resolves. If any worker fails to spawn,
 * all already-spawned workers are terminated and the error is propagated.
 */
export declare function createShaderTransitionWorkerPool(opts: ShaderTransitionPoolOptions): Promise<ShaderTransitionWorkerPool>;
export {};
//# sourceMappingURL=shaderTransitionWorkerPool.d.ts.map