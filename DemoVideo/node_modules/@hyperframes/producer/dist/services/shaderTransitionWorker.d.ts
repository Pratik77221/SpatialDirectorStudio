/**
 * Worker entry point for off-main-thread shader-blend execution.
 *
 * The hf#677 follow-up moved the layered transition pipeline (dual-scene
 * seek/mask/screenshot) onto per-worker DOM sessions, but the per-pixel JS
 * shader-blend at the tail of `processLayeredTransitionFrame` still ran on
 * the orchestrator's main event loop. Complex shaders (`domain-warp`,
 * `swirl-vortex`, `glitch`) iterate every pixel of the rgb48le buffer with
 * multiple noise/sample calls per pixel — hundreds of milliseconds per call
 * — so N concurrent DOM workers all firing shader-blends saturated the
 * single Node thread. The empirical worker-count sweep on the #677 fixture
 * (w=1=218s, w=2=183s, w=6=184s, w=12=188s) flattens after w=2, which is the
 * single-threaded-downstream signature.
 *
 * This worker runs `TRANSITIONS[shader](from, to, output, w, h, p)` on a
 * dedicated Node `worker_threads` Worker. The pool dispatches one frame at
 * a time per worker. The rgb48le scratch Buffers are moved in and out via
 * `transferList` — zero-copy at the ArrayBuffer level — so the only
 * per-frame cost is the postMessage round-trip (~sub-millisecond on the
 * 2.4 MB 854×480 buffers) plus the shader-blend itself.
 *
 * Lifecycle:
 *
 * 1. Pool constructor spawns N of these workers up front.
 * 2. Main thread posts `{ shader, bufferA, bufferB, output, width, height,
 *    progress }` with `transferList: [bufferA, bufferB, output]`. The three
 *    ArrayBuffers are detached on the sender; the caller must NOT touch
 *    them until the worker replies.
 * 3. Worker wraps each ArrayBuffer as a Node Buffer view (zero-copy),
 *    invokes `TRANSITIONS[shader] ?? crossfade`, and posts `{ ok: true,
 *    output }` back with `transferList: [output]`. (The two input ArrayBuffers
 *    are also returned so the main thread can re-attach them to the worker's
 *    `LayeredTransitionBuffers` slot for reuse on the next frame.)
 * 4. On unknown shader / runtime exception, worker posts `{ ok: false, error,
 *    bufferA, bufferB, output }` — all three are still transferred back so
 *    the caller can release them.
 *
 * The worker holds no per-frame state. It is shared across DOM-session
 * workers and across the entire render — only spawned once at render start
 * and terminated at render end.
 */
interface ShaderJobOk {
    ok: true;
    bufferA: ArrayBuffer;
    bufferB: ArrayBuffer;
    output: ArrayBuffer;
}
interface ShaderJobErr {
    ok: false;
    error: string;
    bufferA: ArrayBuffer;
    bufferB: ArrayBuffer;
    output: ArrayBuffer;
}
export type ShaderJobResult = ShaderJobOk | ShaderJobErr;
export {};
//# sourceMappingURL=shaderTransitionWorker.d.ts.map