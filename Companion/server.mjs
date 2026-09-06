import {createServer} from "node:http"
import {readFile} from "node:fs/promises"
import {extname, join, normalize} from "node:path"
import {fileURLToPath} from "node:url"

const root = fileURLToPath(new URL(".", import.meta.url))
const publicRoot = join(root, "public")
const port = Number(process.env.PORT ?? 4173)
const bucket = process.env.STORAGE_BUCKET ?? "director-takes"
const cloudEnabled = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
let supabase = null

if (cloudEnabled) {
  const {createClient} = await import("@supabase/supabase-js")
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {persistSession: false, autoRefreshToken: false},
  })
}

const demoRows = [
  {id: "take_1788600000000", status: "Ready", width: 512, height: 288, fps: 12, duration_seconds: 9, frame_count: 87, created_at: new Date(Date.now() - 180000).toISOString(), video_path: null},
  {id: "take_1788599700000", status: "Processing", width: 512, height: 288, fps: 12, duration_seconds: 12, frame_count: 118, created_at: new Date(Date.now() - 480000).toISOString(), video_path: null},
  {id: "take_1788599200000", status: "Uploading", width: 512, height: 288, fps: 12, duration_seconds: 15, frame_count: 64, created_at: new Date(Date.now() - 960000).toISOString(), video_path: null},
]

createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`)
    if (url.pathname === "/api/health") return json(response, 200, {ok: true, mode: cloudEnabled ? "supabase" : "demo"})
    if (url.pathname === "/api/takes") return json(response, 200, await listTakes())
    if (url.pathname.startsWith("/api/takes/")) {
      const id = decodeURIComponent(url.pathname.slice("/api/takes/".length))
      return json(response, 200, await takeDetail(id))
    }
    if (url.pathname.startsWith("/demo/")) return serveDemoImage(url.pathname, response)
    return serveStatic(url.pathname, response)
  } catch (error) {
    console.error(error)
    return json(response, 500, {error: error instanceof Error ? error.message : String(error)})
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Spatial Director dashboard: http://127.0.0.1:${port} (${cloudEnabled ? "Supabase" : "demo"})`)
})

async function listTakes() {
  if (!supabase) return {mode: "demo", takes: demoRows}
  const result = await supabase.from("director_takes").select("*").order("created_at", {ascending: false}).limit(50)
  if (result.error) throw result.error
  return {mode: "supabase", takes: result.data}
}

async function takeDetail(id) {
  if (!supabase) return demoDetail(id)
  const rowResult = await supabase.from("director_takes").select("*").eq("id", id).single()
  if (rowResult.error || !rowResult.data) throw rowResult.error ?? new Error("Take not found")
  const row = rowResult.data
  const manifestDownload = await supabase.storage.from(bucket).download(row.manifest_path)
  if (manifestDownload.error || !manifestDownload.data) throw manifestDownload.error ?? new Error("Manifest missing")
  const manifest = JSON.parse(await manifestDownload.data.text())
  const base = row.manifest_path.slice(0, row.manifest_path.lastIndexOf("/"))
  const signed = await Promise.all(manifest.frames.map(async (frame) => {
    const result = await supabase.storage.from(bucket).createSignedUrl(`${base}/frames/${frame.fileName}`, 3600)
    if (result.error) throw result.error
    return {...frame, url: result.data.signedUrl}
  }))
  let videoUrl = null
  if (row.video_path) {
    const result = await supabase.storage.from(bucket).createSignedUrl(row.video_path, 3600)
    if (!result.error) videoUrl = result.data.signedUrl
  }
  const manifestUrlResult = await supabase.storage.from(bucket).createSignedUrl(row.manifest_path, 3600)
  return {mode: "supabase", take: row, manifest, frames: signed, videoUrl, manifestUrl: manifestUrlResult.data?.signedUrl ?? null}
}

function demoDetail(id) {
  const take = demoRows.find((row) => row.id === id) ?? demoRows[0]
  const frames = [
    {index: 0, timestampMs: 0, fileName: "frame_0000.jpg", url: "/demo/frame-a.jpg"},
    {index: 1, timestampMs: Math.round(take.duration_seconds * 500), fileName: "frame_0001.jpg", url: "/demo/frame-b.jpg"},
    {index: 2, timestampMs: Math.round(take.duration_seconds * 900), fileName: "frame_0002.jpg", url: "/demo/frame-c.jpg"},
  ]
  const manifest = {
    schemaVersion: 1,
    takeId: take.id,
    createdAtMs: Date.parse(take.created_at),
    width: take.width,
    height: take.height,
    fps: take.fps,
    durationSeconds: take.duration_seconds,
    frameCount: take.frame_count,
    frames: frames.map(({url, ...frame}) => frame),
    shots: [
      {cameraId: "A", durationSeconds: 3, animation: "IDLE", label: "Wide intro"},
      {cameraId: "B", durationSeconds: 3, animation: "ACTION", label: "Action close-up"},
      {cameraId: "C", durationSeconds: Math.max(1, take.duration_seconds - 6), animation: "WALK", label: "Low walk proof"},
    ],
  }
  return {mode: "demo", take, manifest, frames, videoUrl: null, manifestUrl: `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(manifest, null, 2))}`}
}

async function serveDemoImage(pathname, response) {
  const fileName = pathname.endsWith("frame-a.jpg") ? "Take_Ready.jpg" : pathname.endsWith("frame-b.jpg") ? "Take_Shot_B_Close.jpg" : "Take_Shot_C_Low.jpg"
  const bytes = await readFile(join(root, "..", "Assets", "Validation", fileName))
  response.writeHead(200, {"content-type": "image/jpeg", "cache-control": "no-store"})
  response.end(bytes)
}

async function serveStatic(pathname, response) {
  const requested = pathname === "/" ? "index.html" : pathname.slice(1)
  const safe = normalize(requested).replace(/^(\.\.[/\\])+/, "")
  const filePath = join(publicRoot, safe)
  if (!filePath.startsWith(publicRoot)) return json(response, 403, {error: "Forbidden"})
  try {
    const bytes = await readFile(filePath)
    const types = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml"}
    response.writeHead(200, {"content-type": types[extname(filePath)] ?? "application/octet-stream", "cache-control": "no-store"})
    response.end(bytes)
  } catch {
    json(response, 404, {error: "Not found"})
  }
}

function json(response, status, value) {
  response.writeHead(status, {"content-type": "application/json; charset=utf-8", "cache-control": "no-store"})
  response.end(JSON.stringify(value))
}
