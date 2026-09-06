import {createClient, SupabaseClient} from "SupabaseClient.lspkg/supabase-snapcloud"

type TakeState = "Idle" | "Recording" | "Uploading" | "Processing" | "Ready" | "Error"

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
  shots: Array<{cameraId: "A" | "B" | "C"; durationSeconds: number; label: string}>
}

type StateListener = (state: TakeState, detail: string) => void

/** Supabase adapter with a deterministic Preview mock when no project asset is configured. */
export class SpatialDirectorCloudAdapter {
  private client: SupabaseClient | null = null

  constructor(
    private project: SupabaseProject | null,
    private bucket: string,
    private processorFunction: string,
    private onState: StateListener,
  ) {}

  async connect(): Promise<void> {
    if (!this.project) {
      this.onState("Idle", "Preview mock")
      return
    }

    try {
      const client = this.getClient()
      await this.ensureUser(client)
      const probe = await client.from("director_takes").select("id").limit(1)
      this.throwIfError(probe.error, "verify director_takes access")
      this.onState("Idle", "Supabase connected")
      console.log("[SpatialDirectorCloud] CONNECTED provider=Supabase bucket=" + this.bucket)
    } catch (error) {
      const detail = this.errorMessage(error)
      console.error("[SpatialDirectorCloud] CONNECTION FAILED " + detail)
      this.onState("Error", detail)
    }
  }

  async submit(manifest: TakeManifest, frames: CapturedFrame[]): Promise<void> {
    if (!this.project) {
      this.onState("Processing", "Preview mock")
      console.log("[SpatialDirectorCloud] MOCK frames=" + frames.length + " manifest=" + JSON.stringify(manifest))
      this.onState("Ready", manifest.takeId + " (mock)")
      return
    }

    try {
      const client = this.getClient()
      const userId = await this.ensureUser(client)
      const takeRoot = "users/" + userId + "/takes/" + manifest.takeId
      const manifestPath = takeRoot + "/manifest.json"

      this.onState("Uploading", "0/" + frames.length + " frames")
      const inserted = await client.from("director_takes").insert({
        id: manifest.takeId,
        user_id: userId,
        status: "Uploading",
        width: manifest.width,
        height: manifest.height,
        fps: manifest.fps,
        duration_seconds: manifest.durationSeconds,
        frame_count: manifest.frameCount,
        manifest_path: manifestPath,
      })
      this.throwIfError(inserted.error, "create take row")

      const batchSize = 3
      for (let start = 0; start < frames.length; start += batchSize) {
        const batch = frames.slice(start, start + batchSize)
        await Promise.all(batch.map((frame) => this.uploadFrame(client, takeRoot, frame)))
        this.onState("Uploading", Math.min(start + batch.length, frames.length) + "/" + frames.length + " frames")
      }

      const manifestUpload = await client.storage.from(this.bucket).upload(
        manifestPath,
        JSON.stringify(manifest),
        {contentType: "application/json", upsert: true},
      )
      this.throwIfError(manifestUpload.error, "upload manifest")

      if (this.processorFunction.trim().length > 0) {
        this.onState("Processing", "video worker")
        const processing = await client.from("director_takes").update({status: "Processing", updated_at: new Date().toISOString()}).eq("id", manifest.takeId)
        this.throwIfError(processing.error, "mark processing")
        const invoked = await client.functions.invoke(this.processorFunction, {body: {takeId: manifest.takeId}})
        this.throwIfError(invoked.error, "invoke video processor")
        this.onState("Processing", manifest.takeId)
      } else {
        const ready = await client.from("director_takes").update({status: "Ready", updated_at: new Date().toISOString()}).eq("id", manifest.takeId)
        this.throwIfError(ready.error, "mark frame sequence ready")
        this.onState("Ready", manifest.takeId + " · frames ready")
      }
      console.log("[SpatialDirectorCloud] UPLOADED take=" + manifest.takeId + " frames=" + frames.length + " bucket=" + this.bucket)
    } catch (error) {
      const detail = this.errorMessage(error)
      console.error("[SpatialDirectorCloud] " + detail)
      this.onState("Error", detail)
      if (this.client) {
        await this.client.from("director_takes").update({status: "Error", error_message: detail, updated_at: new Date().toISOString()}).eq("id", manifest.takeId)
      }
    }
  }

  dispose(): void {
    if (this.client) this.client.removeAllChannels()
    this.client = null
  }

  private getClient(): SupabaseClient {
    if (this.client) return this.client
    if (!this.project) throw new Error("Supabase project asset is not assigned")
    this.client = createClient(this.project.url, this.project.publicToken, {
      realtime: {heartbeatIntervalMs: 2500},
    })
    return this.client
  }

  private async ensureUser(client: SupabaseClient): Promise<string> {
    const session = await client.auth.getSession()
    if (session.data.session?.user?.id) return session.data.session.user.id

    const result = await client.auth.signInAnonymously()
    this.throwIfError(result.error, "authenticate anonymous Supabase user")
    if (!result.data.user?.id) throw new Error("Supabase authentication returned no user")
    return result.data.user.id
  }

  private async uploadFrame(client: SupabaseClient, takeRoot: string, frame: CapturedFrame): Promise<void> {
    const path = takeRoot + "/frames/" + frame.fileName
    const bytes = this.decodeBase64(frame.jpegBase64)
    const result = await client.storage.from(this.bucket).upload(path, bytes, {
      contentType: "image/jpeg",
      cacheControl: "31536000",
      upsert: true,
    })
    this.throwIfError(result.error, "upload " + frame.fileName)
  }

  /** Pure TypeScript decoder so binary uploads work in both Preview and Specs. */
  private decodeBase64(value: string): Uint8Array {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    const clean = value.replace(/^data:[^,]+,/, "").replace(/[^A-Za-z0-9+/=]/g, "")
    let outputLength = Math.floor(clean.length * 3 / 4)
    if (clean.endsWith("==")) outputLength -= 2
    else if (clean.endsWith("=")) outputLength -= 1
    const output = new Uint8Array(outputLength)
    let writeIndex = 0
    for (let index = 0; index < clean.length; index += 4) {
      const a = alphabet.indexOf(clean.charAt(index))
      const b = alphabet.indexOf(clean.charAt(index + 1))
      const c = clean.charAt(index + 2) === "=" ? 0 : alphabet.indexOf(clean.charAt(index + 2))
      const d = clean.charAt(index + 3) === "=" ? 0 : alphabet.indexOf(clean.charAt(index + 3))
      const bits = (a << 18) | (b << 12) | (c << 6) | d
      if (writeIndex < outputLength) output[writeIndex++] = (bits >> 16) & 255
      if (writeIndex < outputLength) output[writeIndex++] = (bits >> 8) & 255
      if (writeIndex < outputLength) output[writeIndex++] = bits & 255
    }
    return output
  }

  private throwIfError(error: any, action: string): void {
    if (error) throw new Error(action + ": " + this.errorMessage(error))
  }

  private errorMessage(error: any): string {
    if (!error) return "Unknown Supabase error"
    if (typeof error === "string") return error
    return error.message || error.error_description || JSON.stringify(error)
  }
}
