type RigId = "A" | "B" | "C"

interface Shot {
  cameraId: RigId
  durationSeconds: number
  label: string
}

interface CapturedFrame {
  index: number
  timestampMs: number
  fileName: string
  jpegBase64: string
}

interface TakeManifest {
  schemaVersion: 1
  takeId: string
  createdAtMs: number
  width: number
  height: number
  fps: number
  durationSeconds: number
  frameCount: number
  frames: Array<{index: number; timestampMs: number; fileName: string}>
  shots: Shot[]
}

/** Captures the Program render target as an ordered, memory-bounded JPEG sequence. */
export class SpatialDirectorCaptureService {
  private readonly fps = 12
  private width = 512
  private height = 288
  private frameLimit = 108
  private readonly absoluteMaxFrames = 540
  private readonly maxConcurrentEncodes = 3
  private recording = false
  private stopRequested = false
  private startedAtMs = 0
  private lastCaptureMs = 0
  private nextIndex = 0
  private activeEncodes = 0
  private skippedFrames = 0
  private frames: CapturedFrame[] = []
  private shots: Shot[] = []
  private onReady: ((manifest: TakeManifest, frames: CapturedFrame[]) => void) | null = null

  start(shots: Shot[]): void {
    this.recording = true
    this.stopRequested = false
    this.startedAtMs = Date.now()
    this.lastCaptureMs = 0
    this.nextIndex = 0
    this.activeEncodes = 0
    this.skippedFrames = 0
    this.frames = []
    this.shots = shots.map((shot) => ({
      cameraId: shot.cameraId,
      durationSeconds: shot.durationSeconds,
      label: shot.label,
    }))
    let plannedSeconds = 0
    for (const shot of this.shots) plannedSeconds += shot.durationSeconds
    this.frameLimit = Math.min(this.absoluteMaxFrames, Math.max(1, Math.ceil(plannedSeconds * this.fps)))
    console.log("[SpatialDirectorCapture] RECORDING target=" + plannedSeconds + "s @" + this.fps + "fps max=" + this.frameLimit)
  }

  update(texture: Texture): void {
    if (!this.recording || this.stopRequested || this.nextIndex >= this.frameLimit) return
    const now = Date.now()
    if (this.lastCaptureMs > 0 && now - this.lastCaptureMs < 1000 / this.fps) return
    this.lastCaptureMs = now

    const textureWidth = texture.getWidth()
    const textureHeight = texture.getHeight()
    if (this.activeEncodes >= this.maxConcurrentEncodes || textureWidth === 0 || textureHeight === 0) {
      this.skippedFrames++
      return
    }
    this.width = textureWidth
    this.height = textureHeight

    const index = this.nextIndex++
    const timestampMs = now - this.startedAtMs
    this.activeEncodes++
    Base64.encodeTextureAsync(
      texture,
      (jpegBase64: string) => {
        this.frames.push({
          index,
          timestampMs,
          fileName: "frame_" + this.pad(index, 4) + ".jpg",
          jpegBase64,
        })
        this.activeEncodes--
        this.tryFinalize()
      },
      () => {
        console.error("[SpatialDirectorCapture] JPEG encode failed for frame " + index)
        this.activeEncodes--
        this.tryFinalize()
      },
      CompressionQuality.IntermediateQuality,
      EncodingType.Jpg,
    )
  }

  stop(callback: (manifest: TakeManifest, frames: CapturedFrame[]) => void): void {
    if (!this.recording) return
    this.stopRequested = true
    this.onReady = callback
    this.tryFinalize()
  }

  reset(): void {
    this.recording = false
    this.stopRequested = false
    this.frames = []
    this.onReady = null
    this.activeEncodes = 0
  }

  getCapturedFrameCount(): number {
    return this.frames.length
  }

  getFrameLimit(): number {
    return this.frameLimit
  }

  private tryFinalize(): void {
    if (!this.stopRequested || this.activeEncodes !== 0 || !this.onReady) return
    this.recording = false
    this.frames.sort((a, b) => a.index - b.index)
    const durationSeconds = (Date.now() - this.startedAtMs) / 1000
    const manifest: TakeManifest = {
      schemaVersion: 1,
      takeId: "take_" + this.startedAtMs,
      createdAtMs: this.startedAtMs,
      width: this.width,
      height: this.height,
      fps: this.fps,
      durationSeconds,
      frameCount: this.frames.length,
      frames: this.frames.map((frame) => ({index: frame.index, timestampMs: frame.timestampMs, fileName: frame.fileName})),
      shots: this.shots,
    }
    console.log("[SpatialDirectorCapture] COMPLETE frames=" + this.frames.length + " skipped=" + this.skippedFrames)
    const callback = this.onReady
    this.onReady = null
    callback(manifest, this.frames)
  }

  private pad(value: number, width: number): string {
    let result = value.toString()
    while (result.length < width) result = "0" + result
    return result
  }
}
