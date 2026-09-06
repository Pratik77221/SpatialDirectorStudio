import "SpectaclesUIKit.lspkg/Scripts/Themes/ThemeService"
import {BackPlate} from "SpectaclesUIKit.lspkg/Scripts/BackPlate"
import {Slider} from "SpectaclesUIKit.lspkg/Scripts/Components/Slider/Slider"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"

type RigId = "A" | "B" | "C"

interface LiftPart {
  transform: Transform
  basePosition: vec3
  baseScale: vec3
}

const PANEL_WIDTH = 14.5
const PANEL_HEIGHT = 9.2
const SLIDER_WIDTH = 11.2
const REAR_OFFSET = 7
const CAMERA_BODY_CENTER_Y = 0.15
const CYAN = new vec4(0.2, 0.82, 1, 1)
const ORANGE = new vec4(1, 0.5, 0.12, 1)
const TEXT = new vec4(0.76, 0.9, 0.97, 1)
const MUTED = new vec4(0.58, 0.72, 0.82, 0.86)

/** Physical camera controls mounted parallel to the rig's rear face. */
@component
export class SpatialDirectorCameraRig extends BaseScriptComponent {
  @ui.label('<span style="color: #38BDF8;">Spatial Director Camera Rig</span>')
  @ui.separator
  @ui.group_start("Shot Settings")
  @input
  @hint("Stable shot identifier used by manual cuts and the timeline.")
  rigId: string = "A"

  @input
  @hint("Program Camera vertical field of view in degrees.")
  @widget(new SliderWidget(20, 90, 1))
  fovDegrees: number = 60

  @input
  @hint("Initial recording time for this camera in the director sequence.")
  @widget(new SliderWidget(1, 15, 1))
  durationSeconds: number = 4
  @ui.group_end

  @ui.group_start("Tripod Controls")
  @input
  @hint("Lowest center-column extension. Kept above collapse so the stand remains physical.")
  minHeightOffset: number = -3

  @input
  @hint("Highest center-column extension in centimeters.")
  maxHeightOffset: number = 20

  @ui.group_end

  private _onDurationChanged = new Event<number>()
  private heightValueText: Text | null = null
  private durationValueText: Text | null = null
  private panelRoot: SceneObject | null = null
  private tripodAxisObject: SceneObject | null = null
  private centerColumn: LiftPart | null = null
  private liftParts: LiftPart[] = []
  private baseColumnWorldHeight = 5
  private heightOffset = 0
  private controlsVisible = false
  private built = false

  get onDurationChanged(): PublicApi<number> {
    return this._onDurationChanged.publicApi()
  }

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.buildControls())
  }

  getId(): RigId {
    if (this.rigId === "B" || this.rigId === "C") return this.rigId
    return "A"
  }

  getDurationSeconds(): number {
    return this.durationSeconds
  }

  getHeightOffset(): number {
    return this.heightOffset
  }

  setHeightNormalized(normalized: number): void {
    this.setHeight(normalized)
  }

  setDurationNormalized(normalized: number): void {
    this.setDuration(normalized)
  }

  /** World-space optical position that follows the extended camera head. */
  getOpticalWorldPosition(): vec3 {
    const rootPosition = this.getSceneObject().getTransform().getWorldPosition()
    const axis = this.tripodAxisObject?.getTransform().up ?? this.getSceneObject().getTransform().up
    return rootPosition.add(axis.normalize().uniformScale(this.heightOffset))
  }

  setControlsVisible(visible: boolean): void {
    this.controlsVisible = visible
    if (this.panelRoot) this.panelRoot.enabled = visible
  }

  private buildControls(): void {
    if (this.built) return
    this.built = true
    this.cacheTripodGeometry()

    // +Z is the rear of an authored Lens camera rig because its optical axis is -Z.
    // No Billboard is used: the card stays parallel to the physical camera base.
    const panelRoot = this.obj(this.getSceneObject(), "Camera " + this.getId() + " Rear Controls", new vec3(0, CAMERA_BODY_CENTER_Y, REAR_OFFSET))
    this.panelRoot = panelRoot
    panelRoot.getTransform().setLocalRotation(quat.quatIdentity())
    panelRoot.createComponent("Component.Canvas")
    const plate = panelRoot.createComponent(BackPlate.getTypeName()) as BackPlate
    plate.style = "simple"
    plate.size = new vec2(PANEL_WIDTH, PANEL_HEIGHT)

    const content = this.obj(panelRoot, "Camera Control Content", new vec3(0, 0, 0.65))
    this.text(content, this.cameraLabel(), new vec3(-4.25, 3.55, 0), 5, 1.15, 26, CYAN, HorizontalAlignment.Left)
    this.text(content, "REAR CONTROLS", new vec3(3.8, 3.55, 0), 5.5, 1.1, 18, ORANGE, HorizontalAlignment.Right)

    this.heightValueText = this.text(content, "TRIPOD HEIGHT · 0 CM", new vec3(0, 1.95, 0), 11.5, 1.05, 21, TEXT, HorizontalAlignment.Left)
    this.createSlider(content, "Tripod Height Slider", new vec3(0, 0.65, 0.14), this.normalizedHeight(), (value) => this.setHeight(value))
    this.text(content, "SHORT", new vec3(-4.55, -0.25, 0), 2.8, 0.7, 16, MUTED, HorizontalAlignment.Left)
    this.text(content, "TALL", new vec3(4.55, -0.25, 0), 2.8, 0.7, 16, MUTED, HorizontalAlignment.Right)

    this.durationValueText = this.text(content, "SHOT DURATION · " + this.durationSeconds + " SEC", new vec3(0, -1.2, 0), 11.5, 1.05, 21, TEXT, HorizontalAlignment.Left)
    this.createSlider(content, "Shot Duration Slider", new vec3(0, -2.5, 0.14), (this.durationSeconds - 1) / 14, (value) => this.setDuration(value))
    this.text(content, "1 SEC", new vec3(-4.45, -3.4, 0), 3.2, 0.7, 16, MUTED, HorizontalAlignment.Left)
    this.text(content, "15 SEC", new vec3(4.35, -3.4, 0), 3.5, 0.7, 16, MUTED, HorizontalAlignment.Right)

    panelRoot.enabled = this.controlsVisible
    console.log("[SpatialDirectorRig] READY camera=" + this.getId() + " controls=rear-default-sliders")
  }

  private createSlider(parent: SceneObject, name: string, position: vec3, initialValue: number, callback: (value: number) => void): Slider {
    const sliderObject = this.obj(parent, name, position)
    const slider = sliderObject.createComponent(Slider.getTypeName()) as Slider
    slider.setThemeOverride("SnapOS2")
    slider.size = new vec3(SLIDER_WIDTH, 1.7, 0.8)
    slider.segmented = false
    slider.customKnobSize = true
    slider.knobSize = new vec2(1.5, 1.5)
    slider.initialize()
    slider.updateCurrentValue(this.clamp01(initialValue))
    slider.onValueChange.add(callback)
    return slider
  }

  private cacheTripodGeometry(): void {
    const prefix = this.getId() + "_"
    const centerObject = this.findDescendant(this.getSceneObject(), prefix + "CenterColumn")
    if (!centerObject || !centerObject.getParent()) {
      console.warn("[SpatialDirectorRig] Center column missing for camera " + this.getId())
      return
    }

    this.tripodAxisObject = centerObject.getParent()
    const centerTransform = centerObject.getTransform()
    this.centerColumn = {
      transform: centerTransform,
      basePosition: centerTransform.getLocalPosition(),
      baseScale: centerTransform.getLocalScale(),
    }
    const visual = centerObject.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
    if (visual) this.baseColumnWorldHeight = Math.max(1, Math.abs(visual.worldAabbMax().y - visual.worldAabbMin().y))

    const parent = centerObject.getParent()
    for (let i = 0; i < parent.getChildrenCount(); i++) {
      const child = parent.getChild(i)
      if (!this.shouldLiftPart(child.name, prefix)) continue
      const transform = child.getTransform()
      this.liftParts.push({transform, basePosition: transform.getLocalPosition(), baseScale: transform.getLocalScale()})
    }
    console.log("[SpatialDirectorRig] TRIPOD camera=" + this.getId() + " columnCm=" + this.baseColumnWorldHeight.toFixed(1) + " liftedParts=" + this.liftParts.length)
  }

  private shouldLiftPart(name: string, prefix: string): boolean {
    if (name.indexOf(prefix) !== 0) return false
    const part = name.substring(prefix.length)
    return part !== "CenterColumn" && part !== "TripodHub" && part.indexOf("Leg") !== 0 && part.indexOf("Foot") !== 0
  }

  private setHeight(normalized: number): void {
    const requested = this.minHeightOffset + (this.maxHeightOffset - this.minHeightOffset) * this.clamp01(normalized)
    const minimumPhysicalOffset = -this.baseColumnWorldHeight * 0.62
    this.heightOffset = Math.max(minimumPhysicalOffset, requested)
    this.applyTripodExtension()
    if (this.heightValueText) {
      const rounded = Math.round(this.heightOffset)
      this.heightValueText.text = "TRIPOD HEIGHT · " + (rounded > 0 ? "+" : "") + rounded + " CM"
    }
    console.log("[SpatialDirectorRig] HEIGHT camera=" + this.getId() + " extensionCm=" + Math.round(this.heightOffset))
  }

  private applyTripodExtension(): void {
    if (!this.centerColumn || !this.tripodAxisObject) return
    const parentScale = Math.max(0.001, Math.abs(this.tripodAxisObject.getTransform().getWorldScale().y))
    const extensionLocal = this.heightOffset / parentScale
    const columnScale = this.centerColumn.baseScale
    const baseScaleY = Math.abs(columnScale.y) < 0.001 ? 1 : columnScale.y
    const lengthScale = Math.max(0.38, (this.baseColumnWorldHeight + this.heightOffset) / this.baseColumnWorldHeight)
    this.centerColumn.transform.setLocalScale(new vec3(columnScale.x, baseScaleY * lengthScale, columnScale.z))
    this.centerColumn.transform.setLocalPosition(this.centerColumn.basePosition.add(new vec3(0, extensionLocal * 0.5, 0)))
    for (const part of this.liftParts) part.transform.setLocalPosition(part.basePosition.add(new vec3(0, extensionLocal, 0)))
    if (this.panelRoot) this.panelRoot.getTransform().setLocalPosition(new vec3(0, CAMERA_BODY_CENTER_Y + this.heightOffset, REAR_OFFSET))
  }

  private setDuration(normalized: number): void {
    this.durationSeconds = Math.max(1, Math.min(15, 1 + Math.round(this.clamp01(normalized) * 14)))
    if (this.durationValueText) this.durationValueText.text = "SHOT DURATION · " + this.durationSeconds + " SEC"
    this._onDurationChanged.invoke(this.durationSeconds)
    console.log("[SpatialDirectorRig] DURATION camera=" + this.getId() + " seconds=" + this.durationSeconds)
  }

  private normalizedHeight(): number {
    const range = this.maxHeightOffset - this.minHeightOffset
    return range <= 0 ? 0.5 : this.clamp01(-this.minHeightOffset / range)
  }

  private cameraLabel(): string {
    if (this.getId() === "A") return "CAMERA 1"
    if (this.getId() === "B") return "CAMERA 2"
    return "CAMERA 3"
  }

  private findDescendant(root: SceneObject, name: string): SceneObject | null {
    if (root.name === name) return root
    for (let i = 0; i < root.getChildrenCount(); i++) {
      const found = this.findDescendant(root.getChild(i), name)
      if (found) return found
    }
    return null
  }

  private text(parent: SceneObject, value: string, position: vec3, width: number, height: number, size: number, color: vec4, alignment: HorizontalAlignment): Text {
    const textObject = this.obj(parent, "Text - " + value, position)
    const text = textObject.createComponent("Component.Text") as Text
    text.text = value
    text.size = size
    text.textFill.color = color
    text.depthTest = true
    text.horizontalAlignment = alignment
    text.verticalAlignment = VerticalAlignment.Center
    text.horizontalOverflow = HorizontalOverflow.Shrink
    text.verticalOverflow = VerticalOverflow.Overflow
    text.layoutRect = Rect.create(-width / 2, width / 2, -height / 2, height / 2)
    return text
  }

  private obj(parent: SceneObject, name: string, position: vec3): SceneObject {
    const object = global.scene.createSceneObject(name)
    object.setParent(parent)
    object.layer = this.getSceneObject().layer
    object.getTransform().setLocalPosition(position)
    return object
  }

  private clamp01(value: number): number {
    return Math.max(0, Math.min(1, value))
  }
}
