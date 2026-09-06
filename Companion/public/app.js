const $ = (selector) => document.querySelector(selector)
const state = {
  takes: [],
  detail: null,
  selectedId: null,
  playing: false,
  startedAt: 0,
  elapsed: 0,
  raf: 0,
  filter: "all",
  query: "",
  requestId: 0,
}

const takeList = $("#takeList")
const frame = $("#sequenceFrame")
const video = $("#videoPlayer")
const viewer = $("#viewer")
const scrubber = $("#scrubber")
const playButton = $("#playButton")
const refreshButton = $("#refreshButton")

refreshButton.addEventListener("click", loadTakes)
playButton.addEventListener("click", togglePlayback)
$("#shareButton").addEventListener("click", shareTake)
$("#takeSearch").addEventListener("input", (event) => {
  state.query = event.target.value.trim().toLowerCase()
  renderTakeList()
})
document.querySelectorAll(".filter-tab").forEach((button) => {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter
    document.querySelectorAll(".filter-tab").forEach((tab) => tab.classList.toggle("active", tab === button))
    renderTakeList()
  })
})

scrubber.addEventListener("input", () => {
  if (!state.detail) return
  const elapsed = Number(scrubber.value) / 1000 * durationMs()
  if (viewer.classList.contains("video")) {
    video.currentTime = elapsed / 1000
    state.elapsed = elapsed
    renderPlaybackPosition()
    return
  }
  pausePlayback()
  state.elapsed = elapsed
  renderSequenceFrame()
  renderPlaybackPosition()
})

video.addEventListener("click", togglePlayback)
video.addEventListener("play", () => setPlaying(true))
video.addEventListener("pause", () => setPlaying(false))
video.addEventListener("ended", () => {
  state.elapsed = durationMs()
  setPlaying(false)
  renderPlaybackPosition()
})
video.addEventListener("timeupdate", () => {
  if (!viewer.classList.contains("video")) return
  state.elapsed = video.currentTime * 1000
  renderPlaybackPosition()
})
video.addEventListener("error", () => {
  if (!video.currentSrc) return
  viewer.className = "viewer loading"
  setViewerMessage("Preview unavailable", "The video could not be loaded. Download is still available.")
  toast("Video preview could not be loaded")
})

await loadTakes()

async function loadTakes() {
  refreshButton.classList.add("loading")
  refreshButton.disabled = true
  if (!state.takes.length) takeList.innerHTML = '<div class="take-empty"><strong>Loading library</strong>Fetching your latest captures…</div>'

  try {
    const payload = await getJson("/api/takes")
    state.takes = Array.isArray(payload.takes) ? payload.takes : []
    renderConnectionMode(payload.mode)
    $("#takeCount").textContent = state.takes.length
    renderTakeList()

    const requested = new URLSearchParams(location.search).get("take")
    const preferred = state.takes.some((take) => take.id === requested)
      ? requested
      : state.takes.some((take) => take.id === state.selectedId)
        ? state.selectedId
        : state.takes[0]?.id

    if (preferred) await selectTake(preferred)
    else renderEmptyWorkspace()
  } catch (error) {
    const pill = $("#modePill")
    pill.className = "connection-pill error"
    pill.innerHTML = "<b></b><span>Connection unavailable</span>"
    takeList.innerHTML = `<div class="take-empty"><strong>Could not load takes</strong>${escapeHtml(error.message)}</div>`
  } finally {
    refreshButton.classList.remove("loading")
    refreshButton.disabled = false
  }
}

function renderConnectionMode(mode) {
  const isCloud = mode === "supabase" || mode === "snap-cloud"
  const pill = $("#modePill")
  pill.className = `connection-pill ${isCloud ? "cloud" : ""}`
  pill.innerHTML = `<b></b><span>${isCloud ? "Cloud connected" : "Local preview data"}</span>`
}

function renderTakeList() {
  const visible = state.takes.filter((take) => {
    const status = statusClass(take.status)
    const matchesFilter = state.filter === "all"
      || (state.filter === "ready" && status === "ready")
      || (state.filter === "active" && (status === "processing" || status === "uploading"))
    const searchable = `${take.id} ${takeLabel(take.id)} ${take.status} ${formatDate(take.created_at)}`.toLowerCase()
    return matchesFilter && (!state.query || searchable.includes(state.query))
  })

  if (!visible.length) {
    takeList.innerHTML = '<div class="take-empty"><strong>No matching takes</strong>Try another search or status filter.</div>'
    return
  }

  takeList.innerHTML = visible.map((take) => {
    const status = statusClass(take.status)
    return `
      <button class="take-item ${take.id === state.selectedId ? "active" : ""}" data-id="${escapeHtml(take.id)}">
        <span class="take-row">
          <span class="take-name"><strong>${takeLabel(take.id)}</strong><small>${shortTakeId(take.id)}</small></span>
          <span class="status-badge ${status}">${escapeHtml(take.status)}</span>
        </span>
        <span class="take-date">${formatDate(take.created_at)}</span>
        <span class="take-stats"><span>${formatDuration(take.duration_seconds)}</span><span>${Number(take.fps) || 0} fps</span><span>${Number(take.frame_count) || 0} frames</span></span>
      </button>`
  }).join("")

  takeList.querySelectorAll(".take-item[data-id]").forEach((button) => {
    button.addEventListener("click", () => selectTake(button.dataset.id))
  })
}

async function selectTake(id) {
  if (!id) return
  const requestId = ++state.requestId
  pausePlayback()
  state.selectedId = id
  state.detail = null
  state.elapsed = 0
  renderTakeList()
  resetViewer()

  try {
    const detail = await getJson(`/api/takes/${encodeURIComponent(id)}`)
    if (requestId !== state.requestId) return
    state.detail = detail

    const {take, manifest = {}, frames = [], videoUrl, manifestUrl} = detail
    const shots = Array.isArray(manifest.shots) ? manifest.shots : []
    const frameItems = Array.isArray(frames) ? frames : []

    $("#takeTitle").textContent = takeLabel(id)
    $("#takeTimestamp").textContent = `Captured ${formatLongDate(take.created_at)} · ${id}`
    $("#detailStatus").textContent = take.status
    $("#detailHint").textContent = statusHint(take.status)
    $("#detailDuration").textContent = formatDuration(take.duration_seconds)
    $("#detailResolution").textContent = `${take.width} × ${take.height}`
    $("#detailFps").textContent = `${take.fps} FPS`
    $("#detailFrameCount").textContent = Number(take.frame_count).toLocaleString()
    $("#detailOutput").textContent = videoUrl ? "H.264 MP4" : "JPEG sequence"
    $("#detailCreated").textContent = formatCompactDate(take.created_at)
    $("#frameCounter").textContent = `${Number(take.frame_count).toLocaleString()} frames`
    $("#outputBadge").textContent = `${take.width} × ${take.height} · ${take.fps} FPS`
    $("#totalTime").textContent = timecode(take.duration_seconds * 1000)
    $("#currentTime").textContent = timecode(0)
    scrubber.value = "0"
    scrubber.style.setProperty("--progress", "0%")

    updateStatus(take.status)
    renderShots(shots)

    const download = $("#downloadButton")
    const downloadable = videoUrl || manifestUrl
    download.classList.toggle("disabled", !downloadable)
    download.href = downloadable || "#"
    download.download = videoUrl ? `${id}.mp4` : `${id}-manifest.json`
    $("#downloadLabel").textContent = videoUrl ? "Download MP4" : "Download manifest"

    if (videoUrl) {
      video.poster = frameItems[0]?.url || ""
      video.src = videoUrl
      video.load()
      viewer.className = "viewer video"
    } else if (frameItems.length) {
      frame.src = frameItems[0].url
      viewer.className = "viewer sequence"
    } else {
      viewer.className = "viewer loading"
      setViewerMessage("Output not ready", `${take.status} · Preview will appear when frames are available.`)
    }

    history.replaceState(null, "", `?take=${encodeURIComponent(id)}`)
    renderPlaybackPosition()
  } catch (error) {
    if (requestId !== state.requestId) return
    viewer.className = "viewer loading"
    setViewerMessage("Could not open take", error.message)
  }
}

function resetViewer() {
  viewer.className = "viewer loading"
  setViewerMessage("Preparing preview", "Loading program output")
  video.pause()
  video.removeAttribute("src")
  video.removeAttribute("poster")
  video.load()
  frame.removeAttribute("src")
  $("#downloadButton").classList.add("disabled")
  $("#downloadButton").href = "#"
  $("#downloadLabel").textContent = "Download output"
  $("#shotStrip").innerHTML = ""
}

function renderEmptyWorkspace() {
  state.selectedId = null
  state.detail = null
  renderTakeList()
  resetViewer()
  setViewerMessage("No captures yet", "New takes will appear here after they upload.")
}

function setViewerMessage(title, message) {
  const empty = $("#viewerEmpty")
  empty.querySelector("strong").textContent = title
  empty.querySelector("p").textContent = message
}

function togglePlayback() {
  if (!state.detail) return

  if (viewer.classList.contains("video")) {
    if (video.paused) {
      video.play().catch(() => toast("Playback could not start"))
    } else {
      video.pause()
    }
    return
  }

  if (!viewer.classList.contains("sequence")) return
  if (state.playing) {
    pausePlayback()
    return
  }
  if (state.elapsed >= durationMs()) state.elapsed = 0
  state.startedAt = performance.now() - state.elapsed
  setPlaying(true)
  state.raf = requestAnimationFrame(tick)
}

function tick(now) {
  state.elapsed = now - state.startedAt
  if (state.elapsed >= durationMs()) {
    state.elapsed = durationMs()
    renderSequenceFrame()
    renderPlaybackPosition()
    pausePlayback()
    return
  }
  renderSequenceFrame()
  renderPlaybackPosition()
  state.raf = requestAnimationFrame(tick)
}

function pausePlayback() {
  cancelAnimationFrame(state.raf)
  if (!video.paused) video.pause()
  setPlaying(false)
}

function setPlaying(playing) {
  state.playing = playing
  playButton.classList.toggle("is-playing", playing)
  playButton.setAttribute("aria-label", playing ? "Pause take" : "Play take")
}

function renderSequenceFrame() {
  if (!state.detail) return
  const frames = Array.isArray(state.detail.frames) ? state.detail.frames : []
  let selected = frames[0]
  for (const candidate of frames) {
    if (candidate.timestampMs <= state.elapsed) selected = candidate
  }
  if (selected && frame.src !== new URL(selected.url, location.href).href) frame.src = selected.url
}

function renderPlaybackPosition() {
  if (!state.detail) return
  const ratio = Math.min(1, Math.max(0, state.elapsed / Math.max(1, durationMs())))
  scrubber.value = String(Math.round(ratio * 1000))
  scrubber.style.setProperty("--progress", `${ratio * 100}%`)
  $("#currentTime").textContent = timecode(state.elapsed)

  const shots = Array.isArray(state.detail.manifest?.shots) ? state.detail.manifest.shots : []
  let running = 0
  let activeIndex = 0
  shots.forEach((shot, index) => {
    running += Number(shot.durationSeconds) * 1000
    if (state.elapsed >= running) activeIndex = Math.min(index + 1, shots.length - 1)
  })

  document.querySelectorAll(".shot-chip").forEach((chip, index) => chip.classList.toggle("active", index === activeIndex))
  const active = shots[activeIndex]
  if (active) $("#cameraBadge").textContent = `CAM ${active.cameraId} · ${String(active.label || active.animation || "SHOT").toUpperCase()}`
}

function renderShots(shots) {
  if (!shots.length) {
    $("#shotStrip").innerHTML = '<div class="shot-empty">No camera cuts recorded for this take.</div>'
    return
  }
  const total = shots.reduce((sum, shot) => sum + Number(shot.durationSeconds || 0), 0) || 1
  $("#shotStrip").innerHTML = shots.map((shot, index) => `
    <div class="shot-chip ${index === 0 ? "active" : ""}" style="flex:${Number(shot.durationSeconds || 0) / total}">
      <span>CAM ${escapeHtml(shot.cameraId)} · ${escapeHtml(shot.animation || shot.label || "Shot")}</span>
      <b>${Number(shot.durationSeconds || 0).toFixed(1).replace(".0", "")}s</b>
    </div>`).join("")
}

function updateStatus(statusValue) {
  const status = statusClass(statusValue)
  const indicator = $("#statusIndicator")
  indicator.className = `status-indicator ${status}`
  indicator.innerHTML = `<i></i>${escapeHtml(statusValue)}`
}

async function shareTake() {
  if (!state.selectedId) {
    toast("Select a take first")
    return
  }
  const url = location.href
  try {
    await navigator.clipboard.writeText(url)
    toast("Take link copied")
  } catch {
    const dialog = prompt("Copy this take link", url)
    void dialog
  }
}

function takeLabel(id) {
  const index = state.takes.findIndex((take) => take.id === id)
  return index < 0 ? "Take" : `Take ${String(state.takes.length - index).padStart(2, "0")}`
}

function shortTakeId(id) {
  const value = String(id).replace(/^take_/, "")
  return `#${value.slice(-5)}`
}

function durationMs() {
  return (Number(state.detail?.take?.duration_seconds) || 0) * 1000
}

function statusClass(status) {
  return String(status || "unknown").toLowerCase()
}

function statusHint(statusValue) {
  const status = statusClass(statusValue)
  if (status === "ready") return "The final video is ready to review, download, or share."
  if (status === "processing") return "The video worker is assembling the camera sequence."
  if (status === "uploading") return "Captured frames are syncing to cloud storage."
  return "This take needs attention. Review the capture and processor logs."
}

function formatDuration(seconds) {
  return `${Number(seconds || 0).toFixed(1)} sec`
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(new Date(value))
}

function formatLongDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function formatCompactDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function timecode(ms) {
  const seconds = Math.max(0, ms / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}.${Math.floor((seconds % 1) * 10)}`
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character])
}

async function getJson(url) {
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`)
  return data
}

function toast(message) {
  const element = $("#toast")
  element.textContent = message
  element.classList.add("show")
  clearTimeout(toast.timer)
  toast.timer = setTimeout(() => element.classList.remove("show"), 1900)
}
