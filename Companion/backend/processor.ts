import {createServer} from "node:http"
import {execFile} from "node:child_process"
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {promisify} from "node:util"
import {createClient} from "@supabase/supabase-js"
import ffmpegPathImport from "ffmpeg-static"

const execFileAsync = promisify(execFile)
const ffmpegPath = ffmpegPathImport as unknown as string
const url = mustEnv("SUPABASE_URL")
const serviceKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY")
const processorSecret = mustEnv("PROCESSOR_SHARED_SECRET")
const bucket = process.env.STORAGE_BUCKET ?? "director-takes"
const port = Number(process.env.PROCESSOR_PORT ?? 8787)
const supabase = createClient(url, serviceKey, {auth: {persistSession: false}})
let pollBusy = false

interface Manifest {
  schemaVersion: 1
  takeId: string
  fps: number
  width: number
  height: number
  durationSeconds: number
  frameCount: number
  frames: Array<{index: number; timestampMs: number; fileName: string}>
}

createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/process") return respond(response, 404, {error: "Not found"})
  if (request.headers.authorization !== `Bearer ${processorSecret}`) return respond(response, 401, {error: "Unauthorized"})
  try {
    const body = JSON.parse(await readBody(request)) as {takeId?: string}
    if (!body.takeId) throw new Error("takeId is required")
    await processTake(body.takeId)
    respond(response, 200, {takeId: body.takeId, status: "Ready"})
  } catch (error) {
    respond(response, 500, {error: error instanceof Error ? error.message : String(error)})
  }
}).listen(port, "0.0.0.0", () => {
  console.log(`Spatial Director processor listening on ${port}`)
  if (process.env.PROCESSOR_POLL === "true") {
    void pollForReadyTake()
    setInterval(() => void pollForReadyTake(), 5000)
  }
})

async function pollForReadyTake(): Promise<void> {
  if (pollBusy) return
  pollBusy = true
  try {
    const result = await supabase
      .from("director_takes")
      .select("id")
      .eq("status", "Ready")
      .is("video_path", null)
      .order("created_at", {ascending: true})
      .limit(1)
    if (result.error) throw result.error
    if (result.data?.[0]?.id) await processTake(result.data[0].id)
  } catch (error) {
    console.error("Processor poll failed", error)
  } finally {
    pollBusy = false
  }
}

async function processTake(takeId: string): Promise<void> {
  const takeResult = await supabase.from("director_takes").select("id,user_id,manifest_path").eq("id", takeId).single()
  if (takeResult.error || !takeResult.data) throw takeResult.error ?? new Error("Take not found")
  const take = takeResult.data
  const workDir = await mkdtemp(join(tmpdir(), "spatial-director-"))
  try {
    await updateTake(takeId, {status: "Processing", error_message: null})
    const manifest = JSON.parse(new TextDecoder().decode(await downloadBytes(take.manifest_path))) as Manifest
    validateManifest(manifest, takeId)
    const sourceFrames: Array<{timestampMs: number; bytes: Uint8Array}> = []
    for (const frame of manifest.frames) {
      sourceFrames.push({timestampMs: frame.timestampMs, bytes: await downloadBytes(`users/${take.user_id}/takes/${takeId}/frames/${frame.fileName}`)})
    }
    const outputFrameCount = Math.max(1, Math.round(manifest.durationSeconds * manifest.fps))
    let sourceIndex = 0
    for (let outputIndex = 0; outputIndex < outputFrameCount; outputIndex++) {
      const targetMs = outputIndex * 1000 / manifest.fps
      while (sourceIndex + 1 < sourceFrames.length && sourceFrames[sourceIndex + 1].timestampMs <= targetMs) sourceIndex++
      await writeFile(join(workDir, `frame_${String(outputIndex).padStart(4, "0")}.jpg`), sourceFrames[sourceIndex].bytes)
    }
    if (!ffmpegPath) throw new Error("ffmpeg-static did not resolve an executable")
    const outputPath = join(workDir, "output.mp4")
    await execFileAsync(ffmpegPath, ["-y", "-framerate", String(manifest.fps), "-i", join(workDir, "frame_%04d.jpg"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", outputPath])
    const videoPath = `users/${take.user_id}/takes/${takeId}/output.mp4`
    const upload = await supabase.storage.from(bucket).upload(videoPath, await readFile(outputPath), {contentType: "video/mp4", upsert: true})
    if (upload.error) throw upload.error
    await updateTake(takeId, {status: "Ready", video_path: videoPath, error_message: null})
  } catch (error) {
    await updateTake(takeId, {status: "Error", error_message: String(error).slice(0, 1000)})
    throw error
  } finally {
    await rm(workDir, {recursive: true, force: true})
  }
}

async function downloadBytes(path: string): Promise<Uint8Array> {
  const result = await supabase.storage.from(bucket).download(path)
  if (result.error || !result.data) throw result.error ?? new Error(`Missing object ${path}`)
  return new Uint8Array(await result.data.arrayBuffer())
}
async function updateTake(id: string, patch: Record<string, unknown>) { const result=await supabase.from("director_takes").update({...patch,updated_at:new Date().toISOString()}).eq("id",id); if(result.error) throw result.error }
function validateManifest(manifest: Manifest, id: string) { if(manifest.schemaVersion!==1||manifest.takeId!==id) throw new Error("Manifest identity mismatch"); if(manifest.fps<1||manifest.fps>30) throw new Error("Invalid fps"); if(manifest.frames.length<1||manifest.frames.length>540||manifest.frameCount!==manifest.frames.length) throw new Error("Invalid frame count"); if(manifest.durationSeconds<=0||manifest.durationSeconds>45) throw new Error("Invalid duration") }
function mustEnv(name: string) { const value=process.env[name]; if(!value) throw new Error(`${name} is required`); return value }
async function readBody(request: import("node:http").IncomingMessage) { let body=""; for await (const chunk of request) body+=chunk; return body }
function respond(response: import("node:http").ServerResponse, status: number, value: unknown) { response.writeHead(status,{"content-type":"application/json"}); response.end(JSON.stringify(value)) }
