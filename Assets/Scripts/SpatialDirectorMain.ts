import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {InteractableManipulation} from "SpectaclesInteractionKit.lspkg/Components/Interaction/InteractableManipulation/InteractableManipulation"
import {InteractorInputType} from "SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor"
import {SIK} from "SpectaclesInteractionKit.lspkg/SIK"

import {SpatialDirectorCameraController} from "./SpatialDirectorCameraController"
import {SpatialDirectorCameraRig} from "./SpatialDirectorCameraRig"
import {SpatialDirectorCaptureService} from "./SpatialDirectorCaptureService"
import {CharacterCue, SpatialDirectorCharacterController} from "./SpatialDirectorCharacterController"
import {SpatialDirectorCloudAdapter} from "./SpatialDirectorCloudAdapter"
import {SpatialDirectorLightRig} from "./SpatialDirectorLightRig"
import {CharacterId, SpatialDirectorUI} from "./SpatialDirectorUI"

type RigId = "A" | "B" | "C"
type TakeState = "Idle" | "Recording" | "Uploading" | "Processing" | "Ready" | "Error"

interface Shot {
  cameraId: RigId
  durationSeconds: number
  label: string
}

interface ManipulableBinding {
  object: SceneObject
  interactable: Interactable
  manipulation: InteractableManipulation
}

interface SpawnFrame {
  translation: vec3
}

interface ActiveCharacter {
  id: CharacterId
  name: string
  root: SceneObject
  visual: SceneObject
  controller: SpatialDirectorCharacterController
}

const WorldQueryModule: WorldQueryModule = require("LensStudio:WorldQueryModule")
const RIG_A_SOLID_MATERIAL = requireAsset("../RigA_Blue.mat") as Material
const RIG_B_SOLID_MATERIAL = requireAsset("../RigB_Orange.mat") as Material
const RIG_C_SOLID_MATERIAL = requireAsset("../RigC_Teal.mat") as Material
const KEY_LIGHT_SOLID_MATERIAL = requireAsset("../KeyLight_Yellow.mat") as Material
const CHARACTER_PREFABS: Record<CharacterId, ObjectPrefab> = {
  REMY: requireAsset("../Characters/Mixamo/Remy.fbx") as ObjectPrefab,
  MOUSEY: requireAsset("../Characters/Mixamo/Mousey.fbx") as ObjectPrefab,
  NINJA: requireAsset("../Characters/Mixamo/Ninja.fbx") as ObjectPrefab,
  DOOZY: requireAsset("../Characters/Mixamo/Doozy.fbx") as ObjectPrefab,
}
const CHARACTER_NAMES: Record<CharacterId, string> = {
  REMY: "Remy",
  MOUSEY: "Mousey",
  NINJA: "Ninja",
  DOOZY: "Doozy",
}
const CHARACTER_SCALES: Record<CharacterId, number> = {
  REMY: 0.1,
  MOUSEY: 0.26,
  NINJA: 0.2,
  DOOZY: 0.22,
}
const CAMERA_ORBIT_RADIUS_CM = 78
const CAMERA_ORBIT_HEIGHT_OFFSET_CM = -38
const CAMERA_ORBIT_START_DEGREES = 90
const CAMERA_ORBIT_STEP_DEGREES = 120
const EPSILON = 0.01

/**
 * Spatial Director's authored-scene entry point. It coordinates placement,
 * SIK manipulation, animation, camera cuts, the timeline, capture and upload.
 */
@component
export class SpatialDirectorMain extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">Spatial Director Studio MVP</span>')
  @ui.separator
  @ui.group_start("Authored Scene")
  @input
  @hint("UIKit panel component that emits director actions and displays state.")
  ui!: SpatialDirectorUI

  @input
  @hint("Authored stage anchor under which the selected Mixamo characters are instantiated.")
  characterRoot!: SceneObject

  @input
  @hint("Shared Mixamo idle animation for every roster character.")
  idleAnimation!: AnimationAsset

  @input
  @hint("Shared in-place Mixamo run animation for the opening movie beat.")
  runAnimation!: AnimationAsset

  @input
  @hint("Shared Mixamo kick animation for the fight beat.")
  kickAnimation!: AnimationAsset

  @input
  @hint("Shared Mixamo fall animation for the reaction beat.")
  fallAnimation!: AnimationAsset

  @input
  @hint("Independent camera that renders the clean Program output.")
  programCameraObject!: SceneObject

  @input
  @hint("Editable proxy for Camera 1.")
  rigA!: SceneObject

  @input
  @hint("Editable proxy for Camera 2.")
  rigB!: SceneObject

  @input
  @hint("Editable proxy for Camera 3.")
  rigC!: SceneObject

  @input
  @hint("Movable key Spotlight; its -Z axis is aimed at the character.")
  keyLight!: SceneObject

  @input
  @hint("Authoring-only cursor that previews a World Query surface hit.")
  placementCursor!: SceneObject
  @ui.group_end

  @ui.separator
  @ui.group_start("Capture and Cloud")
  @input
  @hint("Supabase project asset used for authentication, database rows, and take uploads. Leave empty for the deterministic Preview mock.")
  @allowUndefined
  supabaseProject: SupabaseProject | null = null

  @input
  @hint("Storage bucket expected by the cloud adapter.")
  storageBucket: string = "director-takes"

  @input
  @hint("Optional deployed Supabase Edge Function that starts MP4 processing. Leave empty for frame-sequence playback.")
  processorFunction: string = ""
  @ui.group_end

  @ui.separator
  @ui.group_start("Diagnostics")
  @input
  @hint("Draw collider wireframes for character, cameras and key light.")
  debugColliders: boolean = false
  @ui.group_end

  private readonly shotTemplates: Shot[] = [
    {cameraId: "A", durationSeconds: 4, label: "Camera 1"},
    {cameraId: "B", durationSeconds: 4, label: "Camera 2"},
    {cameraId: "C", durationSeconds: 4, label: "Camera 3"},
  ]
  private readonly cameraOrder: RigId[] = ["A", "B", "C"]
  private shots: Shot[] = []
  private activeCameraIds: RigId[] = []
  private lightSpawned = false
  private camera: SpatialDirectorCameraController | null = null
  private activeCharacters: ActiveCharacter[] = []
  private selectedCharacterIndex = -1
  private performanceBeat = -1
  private placementFallbackPosition = vec3.zero()
  private capture = new SpatialDirectorCaptureService()
  private cloud: SpatialDirectorCloudAdapter | null = null
  private programCamera: Camera | null = null
  private hitTestSession: HitTestSession | null = null
  private primaryInteractor: any = null
  private lastHitResult: any = null
  private hitPending = false
  private placementMode = false
  private placementTimeout: DelayedCallbackEvent | null = null
  private isPlaying = false
  private shotIndex = 0
  private shotElapsed = 0
  private progressUiElapsed = 0
  private fallbackPosition = new vec3(0, -20, -120)
  private rigSettings: Partial<Record<RigId, SpatialDirectorCameraRig>> = {}
  private lightSettings: SpatialDirectorLightRig | null = null
  private manipulableBindings: ManipulableBinding[] = []
  private spawnFrame: SpawnFrame | null = null

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.onStart())
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
    this.createEvent("LateUpdateEvent").bind(() => {
      this.aimKeyLight()
      if (this.activeCameraIds.length > 0) this.camera?.syncActivePose()
    })
    this.createEvent("OnDestroyEvent").bind(() => this.cloud?.dispose())
    this.placementTimeout = this.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent
    this.placementTimeout.bind(() => this.commitFallbackPlacement())
    this.prepareManipulables()
  }

  private onStart(): void {
    if (!this.ui || !this.characterRoot || !this.idleAnimation || !this.runAnimation || !this.kickAnimation || !this.fallAnimation || !this.programCameraObject || !this.rigA || !this.rigB || !this.rigC || !this.keyLight || !this.placementCursor) {
      console.error("[SpatialDirector] Required authored references are not wired")
      return
    }

    this.programCamera = this.programCameraObject.getComponent("Component.Camera") as Camera
    if (!this.programCamera) {
      console.error("[SpatialDirector] Program Camera is missing")
      return
    }

    this.camera = new SpatialDirectorCameraController(this.programCameraObject, [this.rigA, this.rigB, this.rigC])
    this.cloud = new SpatialDirectorCloudAdapter(this.supabaseProject, this.storageBucket, this.processorFunction, (state, detail) => {
      this.updateCloudState(state, detail)
    })

    this.fallbackPosition = this.characterRoot.getTransform().getWorldPosition()
    this.applySolidPropMaterial(this.rigA, RIG_A_SOLID_MATERIAL)
    this.applySolidPropMaterial(this.rigB, RIG_B_SOLID_MATERIAL)
    this.applySolidPropMaterial(this.rigC, RIG_C_SOLID_MATERIAL)
    this.applySolidPropMaterial(this.keyLight, KEY_LIGHT_SOLID_MATERIAL)
    const rigABinding = this.manipulableBinding(this.rigA)
    const rigBBinding = this.manipulableBinding(this.rigB)
    const rigCBinding = this.manipulableBinding(this.rigC)
    const lightBinding = this.manipulableBinding(this.keyLight)
    if (!rigABinding || !rigBBinding || !rigCBinding || !lightBinding) {
      console.error("[SpatialDirector] Manipulable controls were not prepared during onAwake")
      return
    }
    this.bindCameraRig(this.rigA, rigABinding)
    this.bindCameraRig(this.rigB, rigBBinding)
    this.bindCameraRig(this.rigC, rigCBinding)
    this.bindLightRig(this.keyLight, lightBinding)
    this.setupWorldQuery()
    this.bindUI()
    this.placementCursor.enabled = false

    // Authored objects are reusable slots, not default scene content. Hiding
    // their render/interaction surfaces keeps their setup scripts alive while
    // the welcome flow starts with a genuinely empty studio.
    this.setPropActive(this.rigA, false)
    this.setPropActive(this.rigB, false)
    this.setPropActive(this.rigC, false)
    this.setPropActive(this.keyLight, false)
    this.setActiveRigControls(null)
    this.ui.setStudioInventory(0, [], false)
    this.ui.setSelectedCamera(null)
    this.ui.setStatus("Studio ready · add your first prop")
    this.ui.setTakeState("Idle", this.supabaseProject ? "Cloud configured" : "Preview mock")
    this.refreshShotPlan()
    this.ui.setGuide("Start with a character, camera, or light")
    this.cloud.connect()
    console.log("[SpatialDirector] READY emptyStudio=true cameras=0 cast=0 light=false cloud=" + (this.supabaseProject ? "Supabase" : "mock"))
  }

  private bindUI(): void {
    this.ui.onEnterStudio.add(() => {
      this.ui.setStatus("Studio ready · add only what this shot needs")
      this.ui.setGuide("Add one to three cameras, then arrange the scene")
    })
    this.ui.onCharacterSelected.add((id) => this.addCharacter(id))
    this.ui.onAddCamera.add(() => this.addCamera())
    this.ui.onAddLight.add(() => this.addLight())
    this.ui.onCamera.add((id) => this.cutTo(id))
    this.ui.onPlay.add(() => this.playSequence())
    this.ui.onReset.add(() => this.resetSequence())
    this.ui.onAction.add(() => {
      if (this.activeCharacters.length === 0) {
        this.ui.setStatus("Add a character before previewing performance")
        this.ui.setGuide("Use + CHARACTER, then PLACE or pinch to move it")
        return
      }
      this.previewPerformance()
      this.ui.setStatus("Performance preview · movie fight beat")
      this.ui.setGuide("Press PLAY + CAPTURE when the blocking is ready")
    })
    this.ui.onPlace.add(() => this.beginPlacement())
  }

  private addCharacter(id: CharacterId): void {
    if (this.activeCharacters.length >= 3) {
      this.ui.setStatus("Cast capacity reached · 3/3")
      this.ui.setGuide("Move or perform with the current cast")
      return
    }

    if (this.activeCharacters.length === 0) this.placeCharacterStageAtSpawn()
    const name = CHARACTER_NAMES[id]
    const root = global.scene.createSceneObject("Character " + (this.activeCharacters.length + 1) + " - " + name)
    root.setParent(this.characterRoot)
    root.layer = this.characterRoot.layer

    const visual = CHARACTER_PREFABS[id].instantiate(root)
    visual.name = name + " Mixamo Model"
    visual.getTransform().setLocalPosition(new vec3(0, -18, 0))
    const characterScale = CHARACTER_SCALES[id]
    visual.getTransform().setLocalScale(new vec3(characterScale, characterScale, characterScale))
    this.setLayerRecursive(visual, root.layer)
    this.normalizeMixamoJointNames(visual)

    let player = visual.getComponent("Component.AnimationPlayer") as AnimationPlayer
    if (!player) player = visual.createComponent("Component.AnimationPlayer") as AnimationPlayer
    player.enabled = true
    const controller = new SpatialDirectorCharacterController(
      player,
      this.idleAnimation,
      this.runAnimation,
      this.kickAnimation,
      this.fallAnimation,
    )
    const character: ActiveCharacter = {id, name, root, visual, controller}
    this.activeCharacters.push(character)
    this.selectedCharacterIndex = this.activeCharacters.length - 1

    const binding = this.configureManipulable(root, new vec3(24, 40, 20), true)
    binding.interactable.onTriggerStart.add(() => this.selectCharacter(character))
    this.layoutCharacters()
    controller.play("IDLE")
    this.ui.setStudioInventory(this.activeCharacters.length, this.activeCameraIds, this.lightSpawned)
    this.ui.setStatus(name + " added · cast " + this.activeCharacters.length + "/3")
    this.ui.setGuide("Add another character, or pinch this one to block the scene")
    console.log("[SpatialDirector] SPAWN character=" + id + " cast=" + this.activeCharacters.length)
  }

  private addCamera(): void {
    if (this.activeCameraIds.length >= this.cameraOrder.length) {
      this.ui.setStatus("Camera capacity reached · 3/3")
      this.ui.setGuide("Select a camera to frame the shot or adjust its rear controls")
      return
    }

    const id = this.cameraOrder[this.activeCameraIds.length]
    const object = this.rigObject(id)
    const template = this.shotTemplates[this.activeCameraIds.length]
    const settings = this.rigSettings[id]
    if (!object || !template) return

    this.activeCameraIds.push(id)
    this.shots.push({
      cameraId: id,
      durationSeconds: settings?.getDurationSeconds() ?? template.durationSeconds,
      label: template.label,
    })
    this.placeCameraAtSpawn(object, id)
    this.setPropActive(object, true)
    this.ui.setStudioInventory(this.activeCharacters.length, this.activeCameraIds, this.lightSpawned)
    this.refreshShotPlan()
    this.cutTo(id)
    this.ui.setGuide(this.cameraName(id) + " added · pinch it to move; use the rear sliders for height and duration")
    console.log("[SpatialDirector] SPAWN camera=" + id + " count=" + this.activeCameraIds.length)
  }

  private addLight(): void {
    if (this.lightSpawned) {
      this.showLightControls()
      return
    }
    this.lightSpawned = true
    this.placeLightAtSpawn()
    this.setPropActive(this.keyLight, true)
    this.ui.setStudioInventory(this.activeCharacters.length, this.activeCameraIds, true)
    this.showLightControls()
    console.log("[SpatialDirector] SPAWN light=true")
  }

  /**
   * Captures one stable stage frame from the floating panel. Every prop added
   * during this session uses the same frame, so moving the user's head between
   * button presses cannot scatter the studio around the world.
   */
  private getSpawnFrame(): SpawnFrame {
    if (this.spawnFrame) return this.spawnFrame

    const panelTransform = this.ui.getSceneObject().getTransform()
    const panelPosition = panelTransform.getWorldPosition()
    const panelForward = panelTransform.getWorldRotation().multiplyVec3(new vec3(0, 0, -1))
    let forward = new vec3(panelForward.x, 0, panelForward.z)
    if (forward.length <= EPSILON) forward = new vec3(0, 0, -1)
    else forward = forward.normalize()

    const desiredCharacterPoint = panelPosition.add(forward.uniformScale(110))
    const desiredCharacterPosition = new vec3(desiredCharacterPoint.x, this.fallbackPosition.y, desiredCharacterPoint.z)
    const translation = desiredCharacterPosition.sub(this.fallbackPosition)
    this.spawnFrame = {translation}
    console.log("[SpatialDirector] SPAWN FRAME translation=" + this.positionText(translation))
    return this.spawnFrame
  }

  private placeCharacterStageAtSpawn(): void {
    const frame = this.getSpawnFrame()
    const transform = this.characterRoot.getTransform()
    const position = transform.getWorldPosition().add(frame.translation)
    transform.setWorldPosition(position)
    this.fallbackPosition = position
    console.log("[SpatialDirector] SPAWN POSITION characterStage=" + this.positionText(position))
  }

  private placeCameraAtSpawn(object: SceneObject, id: RigId): void {
    const transform = object.getTransform()
    const stageCenter = this.activeCharacters.length > 0
      ? this.characterAimPoint()
      : this.fallbackPosition.add(this.getSpawnFrame().translation)
    const cameraIndex = this.cameraOrder.indexOf(id)
    const orbitAngleRadians = (
      CAMERA_ORBIT_START_DEGREES - cameraIndex * CAMERA_ORBIT_STEP_DEGREES
    ) * Math.PI / 180
    const position = stageCenter.add(new vec3(
      Math.cos(orbitAngleRadians) * CAMERA_ORBIT_RADIUS_CM,
      CAMERA_ORBIT_HEIGHT_OFFSET_CM,
      Math.sin(orbitAngleRadians) * CAMERA_ORBIT_RADIUS_CM,
    ))
    const bodyAimPoint = stageCenter.add(new vec3(0, -10, 0))
    const direction = bodyAimPoint.sub(position)
    if (direction.length > EPSILON) {
      // The physical rig and Program Camera look down local -Z, while
      // quat.lookAt aligns +Z. Negate to keep the lens aimed at the cast.
      transform.setWorldRotation(quat.lookAt(direction.normalize().uniformScale(-1), vec3.up()))
    }
    transform.setWorldPosition(position)
    console.log(
      "[SpatialDirector] SPAWN POSITION camera=" + id +
      " orbitDegrees=" + (CAMERA_ORBIT_START_DEGREES - cameraIndex * CAMERA_ORBIT_STEP_DEGREES) +
      " position=" + this.positionText(position)
    )
  }

  private placeLightAtSpawn(): void {
    const frame = this.getSpawnFrame()
    const transform = this.keyLight.getTransform()
    const position = transform.getWorldPosition().add(frame.translation)
    transform.setWorldPosition(position)
    console.log("[SpatialDirector] SPAWN POSITION light=" + this.positionText(position))
  }

  private positionText(position: vec3): string {
    return "(" + position.x.toFixed(1) + "," + position.y.toFixed(1) + "," + position.z.toFixed(1) + ")"
  }

  private updateCloudState(state: TakeState, detail: string): void {
    this.ui.setTakeState(state, detail)
    const isPreviewMock = !this.supabaseProject || detail.toLowerCase().indexOf("mock") >= 0

    if (state === "Uploading") {
      this.ui.setStatus("Uploading take")
      this.ui.setGuide("Sending ordered JPEG frames and manifest to Supabase")
    } else if (state === "Processing") {
      this.ui.setStatus(isPreviewMock ? "Finalizing Preview take" : "Processing cloud take")
      this.ui.setGuide(isPreviewMock ? "Validating ordered JPEG frames and manifest locally" : "Waiting for backend video processing")
    } else if (state === "Ready") {
      this.ui.setStatus(isPreviewMock ? "Take ready - Preview mock" : "Take ready - Cloud upload complete")
      this.ui.setGuide(isPreviewMock ? "Ordered JPEG take is ready · Supabase is not configured" : "Take files are ready for the connected dashboard")
    } else if (state === "Error") {
      this.ui.setStatus("Take failed")
      this.ui.setGuide("Capture is preserved · check cloud configuration and retry")
    }
  }

  private onUpdate(): void {
    if (this.placementMode) this.updatePlacement()
    if (!this.isPlaying || !this.programCamera || !this.programCamera.renderTarget) return

    this.capture.update(this.programCamera.renderTarget)
    const deltaTime = getDeltaTime()
    this.shotElapsed += deltaTime
    this.updateMoviePerformance(this.elapsedBeforeShot() + this.shotElapsed)
    this.progressUiElapsed += deltaTime
    if (this.progressUiElapsed >= 0.12) {
      this.progressUiElapsed = 0
      this.ui.setSequenceProgress(this.elapsedBeforeShot() + this.shotElapsed, this.sequenceDuration(), this.shotIndex + 1, this.shots.length)
      this.ui.setTakeState("Recording", this.capture.getCapturedFrameCount() + "/" + this.capture.getFrameLimit() + " JPEG")
    }
    const shot = this.shots[this.shotIndex]
    if (this.shotElapsed < shot.durationSeconds) return

    this.shotIndex++
    this.shotElapsed = 0
    if (this.shotIndex >= this.shots.length) {
      this.isPlaying = false
      this.playAllCharacters("IDLE")
      this.ui.setStatus("Sequence complete - preparing take")
      this.ui.setGuide("Take captured · processing the ordered frame manifest")
      this.ui.setSequenceProgress(this.sequenceDuration(), this.sequenceDuration(), this.shots.length, this.shots.length)
      this.ui.setTakeState("Processing", "JPEG queue")
      this.capture.stop((manifest, frames) => {
        this.cloud?.submit(manifest, frames)
      })
      console.log("[SpatialDirector] SEQUENCE COMPLETE")
      return
    }
    this.applyShot(this.shotIndex)
  }

  private playSequence(): void {
    if (!this.camera || !this.programCamera?.renderTarget || this.isPlaying) return
    if (this.shots.length === 0) {
      this.ui.setStatus("Add at least one camera before capture")
      this.ui.setGuide("Use + CAMERA; one camera is enough for a complete take")
      return
    }
    this.syncShotDurations()
    this.shotIndex = 0
    this.shotElapsed = 0
    this.progressUiElapsed = 0
    this.performanceBeat = -1
    this.isPlaying = true
    this.capture.start(this.shots)
    this.ui.setTakeState("Recording", "0/" + this.capture.getFrameLimit())
    this.ui.setSequenceProgress(0, this.sequenceDuration(), 1, this.shots.length)
    this.ui.setGuide("Recording Program output · automatic cuts are live")
    this.applyShot(0)
    console.log("[SpatialDirector] PLAY")
  }

  private resetSequence(): void {
    this.isPlaying = false
    this.capture.reset()
    this.shotIndex = 0
    this.shotElapsed = 0
    this.progressUiElapsed = 0
    this.performanceBeat = -1
    this.resetCharacterLayout()
    this.playAllCharacters("IDLE")
    if (this.activeCameraIds.length > 0) this.cutTo(this.activeCameraIds[0])
    else this.setActiveRigControls(null)
    this.ui.setStatus(this.activeCameraIds.length > 0 ? "Sequence reset · ready to direct" : "Studio reset · add a camera")
    this.refreshShotPlan()
    this.ui.setGuide("Pinch objects to move · two hands to rotate / scale")
    this.ui.setTakeState("Idle", this.supabaseProject ? "Cloud configured" : "Preview mock")
    console.log("[SpatialDirector] RESET")
  }

  private applyShot(index: number): void {
    const shot = this.shots[index]
    if (!shot) return
    this.camera?.cutTo(shot.cameraId)
    this.setActiveRigControls(shot.cameraId)
    this.ui.setSelectedCamera(shot.cameraId)
    this.ui.setStatus("Shot 0" + (index + 1) + " - " + shot.label)
    this.ui.setTimeline("NOW · SHOT 0" + (index + 1) + "/0" + this.shots.length + " · " + this.cameraName(shot.cameraId) + " · " + shot.durationSeconds + "s")
    console.log("[SpatialDirector] SHOT index=" + index + " camera=" + this.cameraName(shot.cameraId))
  }

  private cutTo(id: RigId): void {
    if (this.activeCameraIds.indexOf(id) < 0) return
    if (this.camera?.cutTo(id)) {
      this.setActiveRigControls(id)
      this.ui.setSelectedCamera(id)
      this.ui.setStatus("Manual cut - " + this.cameraName(id))
      this.ui.setTimeline("MANUAL SHOT · " + this.cameraName(id))
    }
  }

  private setupWorldQuery(): void {
    const options = HitTestSessionOptions.create()
    options.filter = false
    this.hitTestSession = WorldQueryModule.createHitTestSessionWithOptions(options)
    const interactors = SIK.InteractionManager.getInteractorsByType(InteractorInputType.All)
    for (const interactor of interactors) {
      interactor.onTriggerEnd.add(() => {
        if (this.placementMode && this.lastHitResult && this.primaryInteractor === interactor) {
          this.commitHitPlacement()
        }
      })
    }
  }

  private beginPlacement(): void {
    if (this.activeCharacters.length === 0) {
      this.ui.setStatus("Add a character before placement")
      this.ui.setGuide("Use + CHARACTER, then return to PLACE")
      return
    }
    if (this.selectedCharacterIndex < 0) this.selectedCharacterIndex = 0
    this.placementFallbackPosition = this.activeCharacters[this.selectedCharacterIndex].root.getTransform().getWorldPosition()
    this.placementMode = true
    this.lastHitResult = null
    this.placementCursor.enabled = false
    this.ui.setStatus("PLACE: aim at a surface, then pinch")
    this.ui.setGuide("Aim at a real surface · pinch to place the character")
    this.placementTimeout?.reset(2)
    console.log("[SpatialDirector] PLACEMENT armed; 2s deterministic fallback")
  }

  private updatePlacement(): void {
    if (!this.hitTestSession || this.hitPending) return
    this.primaryInteractor = SIK.InteractionManager.getTargetingInteractors().shift()
    if (!this.primaryInteractor || !this.primaryInteractor.isActive() || !this.primaryInteractor.isTargeting()) {
      this.placementCursor.enabled = false
      return
    }
    const start = new vec3(this.primaryInteractor.startPoint.x, this.primaryInteractor.startPoint.y, this.primaryInteractor.startPoint.z + 30)
    const end = this.primaryInteractor.endPoint
    this.hitPending = true
    this.hitTestSession.hitTest(start, end, (result) => {
      this.hitPending = false
      this.lastHitResult = result
      if (!result) {
        this.placementCursor.enabled = false
        return
      }
      this.placementCursor.enabled = true
      this.placementCursor.getTransform().setWorldPosition(result.position)
      this.placementCursor.getTransform().setWorldRotation(this.surfaceRotation(result.normal))
    })
  }

  private commitHitPlacement(): void {
    if (!this.lastHitResult) return
    this.placementTimeout && (this.placementTimeout.enabled = false)
    const selected = this.selectedCharacter()
    if (!selected) return
    const transform = selected.root.getTransform()
    transform.setWorldPosition(this.lastHitResult.position)
    transform.setWorldRotation(this.surfaceRotation(this.lastHitResult.normal))
    this.finishPlacement("Placed on detected surface")
  }

  private commitFallbackPlacement(): void {
    if (!this.placementMode) return
    const selected = this.selectedCharacter()
    if (!selected) return
    selected.root.getTransform().setWorldPosition(this.placementFallbackPosition)
    this.finishPlacement("Placed at deterministic fallback")
  }

  private finishPlacement(message: string): void {
    this.placementMode = false
    this.lastHitResult = null
    this.placementCursor.enabled = false
    this.ui.setStatus(message)
    this.ui.setGuide("Pinch objects to move · two hands to rotate / scale")
    console.log("[SpatialDirector] " + message)
  }

  private surfaceRotation(normal: vec3): quat {
    const up = normal.normalize()
    const look = 1 - Math.abs(up.dot(vec3.up())) < EPSILON ? vec3.forward() : up.cross(vec3.up())
    return quat.lookAt(look, up)
  }

  private aimKeyLight(): void {
    if (!this.lightSpawned || this.activeCharacters.length === 0 || !this.keyLight) return
    const lightTransform = this.keyLight.getTransform()
    const direction = this.characterAimPoint().sub(lightTransform.getWorldPosition())
    // The authored lamp's physical front is -Z, while quat.lookAt aligns +Z.
    // Negating the target direction keeps the lamp face and spotlight aimed at
    // the character instead of turning the housing 180 degrees away from it.
    if (direction.length > EPSILON) lightTransform.setWorldRotation(quat.lookAt(direction.normalize().uniformScale(-1), vec3.up()))
  }

  private applySolidPropMaterial(object: SceneObject, material: Material): void {
    const objectName = object.name.toLowerCase()
    if (objectName.indexOf("control") >= 0) return
    const visual = object.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
    if (visual && objectName.indexOf("glass") < 0) {
      visual.clearMaterials()
      visual.addMaterial(material)
    }

    for (let index = 0; index < object.getChildrenCount(); index++) {
      this.applySolidPropMaterial(object.getChild(index), material)
    }
  }

  private setPropActive(object: SceneObject, active: boolean): void {
    this.setRenderVisibility(object, active)
    const light = object.getComponent("Component.LightSource") as LightSource
    if (light) light.enabled = active
    const collider = object.getComponent("Physics.ColliderComponent") as ColliderComponent
    if (collider) collider.enabled = active
    const binding = this.manipulableBindings.find((candidate) => candidate.object === object)
    if (binding) {
      binding.interactable.enabled = active
      binding.manipulation.enabled = active
    }
  }

  private setRenderVisibility(object: SceneObject, visible: boolean): void {
    const visual = object.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
    if (visual) visual.enabled = visible
    for (let index = 0; index < object.getChildrenCount(); index++) {
      const child = object.getChild(index)
      if (child.name.toLowerCase().indexOf("control") >= 0) continue
      this.setRenderVisibility(child, visible)
    }
  }

  private prepareManipulables(): void {
    if (!this.characterRoot || !this.rigA || !this.rigB || !this.rigC || !this.keyLight) return
    this.manipulableBindings = []
    this.configureManipulable(this.rigA, new vec3(8, 6, 12), false)
    this.configureManipulable(this.rigB, new vec3(8, 6, 12), false)
    this.configureManipulable(this.rigC, new vec3(8, 6, 12), false)
    this.configureManipulable(this.keyLight, new vec3(12, 14, 12), false)
  }

  private manipulableBinding(object: SceneObject): ManipulableBinding | null {
    return this.manipulableBindings.find((candidate) => candidate.object === object) ?? null
  }

  private configureManipulable(object: SceneObject, colliderSize: vec3, allowScale: boolean): ManipulableBinding {
    let collider = object.getComponent("Physics.ColliderComponent") as ColliderComponent
    if (!collider) collider = object.createComponent("Physics.ColliderComponent") as ColliderComponent
    const shape = Shape.createBoxShape()
    shape.size = colliderSize
    collider.shape = shape
    collider.debugDrawEnabled = this.debugColliders

    let interactable = object.getComponent(Interactable.getTypeName()) as Interactable
    if (!interactable) interactable = object.createComponent(Interactable.getTypeName()) as Interactable
    let manipulation = object.getComponent(InteractableManipulation.getTypeName()) as InteractableManipulation
    if (!manipulation) manipulation = object.createComponent(InteractableManipulation.getTypeName()) as InteractableManipulation
    manipulation.minimumScaleFactor = allowScale ? 0.5 : 1
    manipulation.maximumScaleFactor = allowScale ? 2 : 1
    const binding = {object, interactable, manipulation}
    this.manipulableBindings.push(binding)
    return binding
  }

  private bindCameraRig(object: SceneObject, binding: ManipulableBinding): void {
    const settings = object.getComponent(SpatialDirectorCameraRig.getTypeName()) as SpatialDirectorCameraRig
    if (!settings) {
      console.error("[SpatialDirector] Missing camera rig settings on " + object.name)
      return
    }
    const id = settings.getId()
    this.rigSettings[id] = settings
    binding.interactable.onTriggerStart.add(() => this.cutTo(id))
    settings.onDurationChanged.add((seconds) => {
      const shot = this.shots.find((candidate) => candidate.cameraId === id)
      if (!shot) return
      shot.durationSeconds = seconds
      if (!this.isPlaying) this.refreshShotPlan()
      console.log("[SpatialDirector] SHOT DURATION camera=" + id + " seconds=" + seconds + " total=" + this.sequenceDuration())
    })
  }

  private bindLightRig(object: SceneObject, binding: ManipulableBinding): void {
    this.lightSettings = object.getComponent(SpatialDirectorLightRig.getTypeName()) as SpatialDirectorLightRig
    if (!this.lightSettings) {
      console.error("[SpatialDirector] Missing light rig controls on " + object.name)
      return
    }
    binding.interactable.onTriggerStart.add(() => this.showLightControls())
    binding.manipulation.onManipulationStart.add(() => this.showLightControls())
    this.lightSettings.setControlsVisible(false)
  }

  private showLightControls(): void {
    if (!this.lightSpawned) return
    this.setActiveRigControls(null)
    this.lightSettings?.setControlsVisible(true)
    this.ui.setStatus("Key light selected")
    this.ui.setTimeline("LIGHT · COLOR + INTENSITY")
    this.ui.setGuide("Choose a color on the wheel or drag the intensity slider")
  }

  private syncShotDurations(): void {
    for (const shot of this.shots) {
      const settings = this.rigSettings[shot.cameraId]
      if (settings) shot.durationSeconds = settings.getDurationSeconds()
    }
  }

  private setActiveRigControls(activeId: RigId | null): void {
    this.lightSettings?.setControlsVisible(false)
    for (const id of ["A", "B", "C"] as RigId[]) {
      this.rigSettings[id]?.setControlsVisible(id === activeId && this.activeCameraIds.indexOf(id) >= 0)
    }
  }

  private refreshShotPlan(): void {
    this.syncShotDurations()
    if (this.shots.length === 0) {
      this.ui.setTimeline("SHOT PLAN · ADD 1-3 CAMERAS")
      this.ui.setSequenceProgress(0, 0, 0, 0)
      return
    }
    const labels: string[] = []
    for (const shot of this.shots) labels.push(this.cameraName(shot.cameraId) + " " + shot.durationSeconds + "S")
    this.ui.setTimeline("SHOT PLAN · " + labels.join(" · "))
    this.ui.setSequenceProgress(0, this.sequenceDuration(), 1, this.shots.length)
  }

  private selectCharacter(character: ActiveCharacter): void {
    const index = this.activeCharacters.indexOf(character)
    if (index < 0) return
    this.selectedCharacterIndex = index
    this.setActiveRigControls(null)
    this.ui.setStatus(character.name + " selected")
    this.ui.setTimeline("CAST · " + character.name.toUpperCase())
    this.ui.setGuide("Pinch to move · two hands to rotate or scale · PLACE for surfaces")
  }

  private selectedCharacter(): ActiveCharacter | null {
    if (this.selectedCharacterIndex < 0 || this.selectedCharacterIndex >= this.activeCharacters.length) return null
    return this.activeCharacters[this.selectedCharacterIndex]
  }

  private layoutCharacters(): void {
    const count = this.activeCharacters.length
    const xPositions = count === 1 ? [0] : count === 2 ? [-18, 18] : [-28, 0, 28]
    for (let index = 0; index < count; index++) {
      const transform = this.activeCharacters[index].root.getTransform()
      transform.setLocalPosition(new vec3(xPositions[index], 18, 0))
      if (count === 2) {
        const inwardYaw = index === 0 ? Math.PI / 2 : -Math.PI / 2
        transform.setLocalRotation(quat.fromEulerAngles(0, inwardYaw, 0))
      } else {
        transform.setLocalRotation(quat.quatIdentity())
      }
      transform.setLocalScale(vec3.one())
    }
  }

  private resetCharacterLayout(): void {
    if (this.activeCharacters.length === 0) return
    this.characterRoot.getTransform().setWorldPosition(this.fallbackPosition)
    this.characterRoot.getTransform().setWorldRotation(quat.quatIdentity())
    this.layoutCharacters()
  }

  private previewPerformance(): void {
    this.performanceBeat = -1
    this.applyPerformanceBeat(1)
  }

  private updateMoviePerformance(elapsedSeconds: number): void {
    const beatLength = Math.max(0.1, this.sequenceDuration() / 4)
    const beat = Math.min(3, Math.floor(elapsedSeconds / beatLength))
    if (beat === this.performanceBeat) return
    this.applyPerformanceBeat(beat)
  }

  private applyPerformanceBeat(beat: number): void {
    if (this.activeCharacters.length === 0) return
    this.performanceBeat = beat
    this.playAllCharacters("IDLE")

    if (beat === 0) {
      this.activeCharacters[0].controller.play("RUN")
    } else if (beat === 1) {
      if (this.activeCharacters.length === 1) this.activeCharacters[0].controller.play("KICK")
      else {
        this.activeCharacters[1].controller.play("KICK")
        if (this.activeCharacters.length >= 3) this.activeCharacters[2].controller.play("FALL")
      }
    } else if (beat === 2) {
      this.activeCharacters[0].controller.play("KICK")
      if (this.activeCharacters.length >= 2) this.activeCharacters[1].controller.play("FALL")
      if (this.activeCharacters.length >= 3) this.activeCharacters[2].controller.play("RUN")
    }
    console.log("[SpatialDirector] MOVIE BEAT=" + beat + " cast=" + this.activeCharacters.length)
  }

  private playAllCharacters(cue: CharacterCue): void {
    for (const character of this.activeCharacters) character.controller.play(cue)
  }

  private characterAimPoint(): vec3 {
    let total = vec3.zero()
    for (const character of this.activeCharacters) total = total.add(character.root.getTransform().getWorldPosition())
    return total.uniformScale(1 / Math.max(1, this.activeCharacters.length))
  }

  private setLayerRecursive(object: SceneObject, layer: LayerSet): void {
    object.layer = layer
    for (let index = 0; index < object.getChildrenCount(); index++) this.setLayerRecursive(object.getChild(index), layer)
  }

  private normalizeMixamoJointNames(object: SceneObject): void {
    const prefix = "mixamorig:"
    if (object.name.indexOf(prefix) === 0) object.name = "mixamorig1:" + object.name.substring(prefix.length)
    for (let index = 0; index < object.getChildrenCount(); index++) this.normalizeMixamoJointNames(object.getChild(index))
  }

  private sequenceDuration(): number {
    let total = 0
    for (const shot of this.shots) total += shot.durationSeconds
    return total
  }

  private elapsedBeforeShot(): number {
    let elapsed = 0
    for (let i = 0; i < this.shotIndex; i++) elapsed += this.shots[i].durationSeconds
    return elapsed
  }

  private rigObject(id: RigId): SceneObject {
    if (id === "A") return this.rigA
    if (id === "B") return this.rigB
    return this.rigC
  }

  private cameraName(id: RigId): string {
    if (id === "A") return "CAMERA 1"
    if (id === "B") return "CAMERA 2"
    return "CAMERA 3"
  }
}
