/**
 * HDR / SDR mode resolution at the sequencer boundary.
 *
 * Folds three signals — `RenderConfig.hdrMode`, the probed video color
 * spaces, and the probed image color spaces — into a single
 * `effectiveHdr` decision, then emits the matching diagnostic log lines.
 * The format gate (HDR + alpha is unsupported, so non-mp4 output forces
 * SDR) lives here too so the sequencer doesn't need to know which
 * formats can carry an HDR signal.
 */
import type { ExtractionResult, HdrTransfer, VideoColorSpace } from "@hyperframes/engine";
import type { ProducerLogger } from "../../logger.js";
import type { RenderConfig } from "../renderOrchestrator.js";
export declare function resolveEffectiveHdrMode(input: {
    hdrMode: RenderConfig["hdrMode"];
    outputFormat: NonNullable<RenderConfig["format"]>;
    extractionResult: ExtractionResult | null | undefined;
    imageColorSpaces: (VideoColorSpace | null)[];
    log: ProducerLogger;
}): {
    transfer: HdrTransfer;
} | undefined;
//# sourceMappingURL=hdrMode.d.ts.map