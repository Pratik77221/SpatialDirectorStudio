export type CharacterCue = "IDLE" | "RUN" | "KICK" | "FALL"

/** Drives one Mixamo character with the shared cinematic animation library. */
export class SpatialDirectorCharacterController {
  private currentCue: CharacterCue = "IDLE"

  constructor(private player: AnimationPlayer, idle: AnimationAsset, run: AnimationAsset, kick: AnimationAsset, fall: AnimationAsset) {
    this.addClip("IDLE", idle, PlaybackMode.Loop)
    this.addClip("RUN", run, PlaybackMode.Loop)
    this.addClip("KICK", kick, PlaybackMode.Single)
    this.addClip("FALL", fall, PlaybackMode.Single)
  }

  play(cue: CharacterCue): void {
    const clip = this.player.getClip(cue)
    if (!clip) {
      console.error("[SpatialDirector] Character clip is missing: " + cue)
      return
    }

    this.currentCue = cue
    this.player.stopAll()
    for (const candidate of this.player.clips) {
      const selected = candidate.name === cue
      candidate.disabled = !selected
      candidate.weight = selected ? 1 : 0
      this.player.setClipEnabled(candidate.name, selected)
    }
    this.player.playClipAt(cue, 0)
    console.log("[SpatialDirector] Animation=" + cue)
  }

  getCue(): CharacterCue {
    return this.currentCue
  }

  private addClip(name: CharacterCue, animation: AnimationAsset, playbackMode: PlaybackMode): void {
    const clip = AnimationClip.createFromAnimation(name, animation)
    clip.playbackMode = playbackMode
    clip.playbackSpeed = 1
    clip.weight = name === "IDLE" ? 1 : 0
    clip.disabled = name !== "IDLE"
    this.player.addClip(clip)
  }
}
