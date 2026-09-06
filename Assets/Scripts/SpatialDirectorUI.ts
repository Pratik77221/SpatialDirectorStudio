import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import {BackPlate} from "SpectaclesUIKit.lspkg/Scripts/BackPlate"
import {Frame} from "SpectaclesUIKit.lspkg/Scripts/Components/Frame/Frame"
import {FlexLayout} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexLayout"
import {FlexItem} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexItem"
import {FlexAlign, FlexAlignSelf, FlexDirection, FlexJustify} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes"
import {GridLayout} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Grid/GridLayout"
import {GridItem} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Grid/GridItem"
import {GridAlign} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Grid/GridTypes"
import {GradientParameters} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"

const PROGRAM_RENDER = requireAsset("../Render/ProgramRender.renderTarget") as Texture
const PROGRAM_MONITOR_MATERIAL = requireAsset("../ProgramMonitor.mat") as Material

type RigId = "A" | "B" | "C"
export type CharacterId = "REMY" | "MOUSEY" | "NINJA" | "DOOZY"
type TakeState = "Idle" | "Recording" | "Uploading" | "Processing" | "Ready" | "Error"
type TextRole = "Title" | "Hero" | "Status" | "Section" | "Button" | "Body" | "Caption"
type ButtonStyle = "PrimaryNeutral" | "Primary" | "Secondary"

interface ButtonConfig {
  label: string
  id?: RigId
  style: ButtonStyle
  action: () => void
  onBuilt?: (object: SceneObject, label: Text) => void
}

interface CharacterOption {
  id: CharacterId
  name: string
  role: string
  prefab: ObjectPrefab
  previewScale: number
  previewX: number
  previewY: number
}

const REMY_PREFAB = requireAsset("../Characters/Mixamo/Remy.fbx") as ObjectPrefab
const MOUSEY_PREFAB = requireAsset("../Characters/Mixamo/Mousey.fbx") as ObjectPrefab
const NINJA_PREFAB = requireAsset("../Characters/Mixamo/Ninja.fbx") as ObjectPrefab
const DOOZY_PREFAB = requireAsset("../Characters/Mixamo/Doozy.fbx") as ObjectPrefab

const CHARACTER_OPTIONS: CharacterOption[] = [
  {id: "REMY", name: "REMY", role: "HERO", prefab: REMY_PREFAB, previewScale: 0.023, previewX: -0.8, previewY: -1.25},
  {id: "MOUSEY", name: "MOUSEY", role: "SIDEKICK", prefab: MOUSEY_PREFAB, previewScale: 0.052, previewX: -1.15, previewY: -1.4},
  {id: "NINJA", name: "NINJA", role: "FIGHTER", prefab: NINJA_PREFAB, previewScale: 0.048, previewX: 0, previewY: -1.4},
  {id: "DOOZY", name: "DOOZY", role: "RIVAL", prefab: DOOZY_PREFAB, previewScale: 0.053, previewX: -0.25, previewY: -1.35},
]

const TYPE_SCALE: Record<TextRole, {size: number; weight: number}> = {
  Title: {size: 92, weight: 700},
  Hero: {size: 66, weight: 700},
  Status: {size: 50, weight: 700},
  Section: {size: 42, weight: 700},
  Button: {size: 38, weight: 600},
  Body: {size: 36, weight: 500},
  Caption: {size: 30, weight: 500},
}

const CAMERA_IDS: RigId[] = ["A", "B", "C"]
const CAMERA_LABELS: Record<RigId, string> = {
  A: "CAMERA 1",
  B: "CAMERA 2",
  C: "CAMERA 3",
}

const ICE = new vec4(0.86, 0.94, 0.98, 1)
const MUTED_BLUE = new vec4(0.58, 0.73, 0.83, 1)
const PANEL_BACKGROUND: GradientParameters = {
  enabled: true,
  type: "Linear",
  start: new vec2(-0.8, 0.9),
  end: new vec2(0.8, -0.9),
  stop0: {enabled: true, color: new vec4(0.035, 0.055, 0.085, 1), percent: 0},
  stop1: {enabled: true, color: new vec4(0.065, 0.105, 0.15, 1), percent: 1},
}

function applyTextRole(text: Text, role: TextRole): void {
  text.size = TYPE_SCALE[role].size
  ;(text as Text & {weight?: number}).weight = TYPE_SCALE[role].weight
}

/** Welcome flow and focused UIKit director console. */
@component
export class SpatialDirectorUI extends BaseScriptComponent {
  @ui.label('<span style="color: #7DD3FC;">Spatial Director Console</span>')
  @ui.separator
  @ui.group_start("Layout")
  @input
  @hint("Panel width in centimeters at the 110 cm focal plane.")
  @widget(new SliderWidget(44, 54, 1))
  panelWidth: number = 48

  @input
  @hint("Panel height in centimeters at the 110 cm focal plane.")
  @widget(new SliderWidget(48, 58, 1))
  panelHeight: number = 52

  @input
  @hint("Physical scale of the floating console. The default keeps controls readable without covering the scene.")
  @widget(new SliderWidget(0.6, 0.85, 0.05))
  panelScale: number = 0.68
  @ui.group_end

  @ui.group_start("Status Colors")
  @input
  @hint("Selected camera and active information color.")
  @widget(new ColorWidget())
  accentColor: vec4 = new vec4(0.38, 0.82, 1, 1)

  @input
  @hint("Ready and successful capture color.")
  @widget(new ColorWidget())
  readyColor: vec4 = new vec4(0.45, 0.95, 0.67, 1)

  @input
  @hint("Recording and processing color.")
  @widget(new ColorWidget())
  activeColor: vec4 = new vec4(1, 0.66, 0.22, 1)

  @input
  @hint("Capture error color.")
  @widget(new ColorWidget())
  errorColor: vec4 = new vec4(1, 0.42, 0.45, 1)
  @ui.group_end

  private _onEnterStudio = new Event<void>()
  private _onCharacterSelected = new Event<CharacterId>()
  private _onAddCamera = new Event<void>()
  private _onAddLight = new Event<void>()
  private _onCamera = new Event<RigId>()
  private _onPlay = new Event<void>()
  private _onReset = new Event<void>()
  private _onAction = new Event<void>()
  private _onPlace = new Event<void>()

  private welcomeRoot: SceneObject | null = null
  private studioRoot: SceneObject | null = null
  private characterPickerRoot: SceneObject | null = null
  private welcomeButtonLabel: Text | null = null
  private statusText: Text | null = null
  private guideText: Text | null = null
  private takeText: Text | null = null
  private timelineText: Text | null = null
  private progressText: Text | null = null
  private inventoryText: Text | null = null
  private addCharacterLabel: Text | null = null
  private addCameraLabel: Text | null = null
  private addLightLabel: Text | null = null
  private cameraLabels: Partial<Record<RigId, Text>> = {}
  private cameraButtonObjects: Partial<Record<RigId, SceneObject>> = {}
  private pickerOpenEvent: DelayedCallbackEvent | null = null
  private pickerCloseEvent: DelayedCallbackEvent | null = null

  private hasEnteredStudio = false
  private characterCount = 0
  private lightAdded = false
  private activeCameraIds: RigId[] = []
  private selectedCamera: RigId | null = null
  private currentStatus = "STUDIO READY · ADD YOUR FIRST PROP"
  private currentGuide = "START WITH A CHARACTER, CAMERA, OR LIGHT"
  private currentTimeline = "SHOT PLAN · ADD 1-3 CAMERAS"
  private currentProgress = "NO SHOTS YET · ADD A CAMERA TO BEGIN"
  private currentTakeState: TakeState = "Idle"
  private currentTakeDetail = "PREVIEW MOCK"
  private activeView: "welcome" | "studio" | "picker" = "welcome"
  private viewSettleFrames = 0

  get onEnterStudio(): PublicApi<void> { return this._onEnterStudio.publicApi() }
  get onCharacterSelected(): PublicApi<CharacterId> { return this._onCharacterSelected.publicApi() }
  get onAddCamera(): PublicApi<void> { return this._onAddCamera.publicApi() }
  get onAddLight(): PublicApi<void> { return this._onAddLight.publicApi() }
  get onCamera(): PublicApi<RigId> { return this._onCamera.publicApi() }
  get onPlay(): PublicApi<void> { return this._onPlay.publicApi() }
  get onReset(): PublicApi<void> { return this._onReset.publicApi() }
  get onAction(): PublicApi<void> { return this._onAction.publicApi() }
  get onPlace(): PublicApi<void> { return this._onPlace.publicApi() }

  onAwake(): void {
    this.pickerOpenEvent = this.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent
    this.pickerOpenEvent.bind(() => this.showCharacterPicker())
    this.pickerCloseEvent = this.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent
    this.pickerCloseEvent.bind(() => this.returnToStudio())
    this.createEvent("UpdateEvent").bind(() => {
      if (this.viewSettleFrames <= 0) return
      this.applyViewState()
      this.viewSettleFrames--
    })
    this.sceneObject.createComponent("Component.Canvas")
    const frame = this.sceneObject.createComponent(Frame.getTypeName()) as Frame
    frame.autoShowHide = false
    frame.autoScaleContent = false
    frame.allowScaling = false

    frame.onInitialized.add(() => {
      frame.innerSize = new vec2(this.panelWidth * this.panelScale, this.panelHeight * this.panelScale)
      frame.padding = new vec2(0, 0)
      if (frame.roundedRectangle) {
        frame.roundedRectangle.opacity = 1
        frame.roundedRectangle.setBackgroundGradient(PANEL_BACKGROUND)
        frame.roundedRectangle.borderColor = new vec4(0.18, 0.34, 0.46, 1)
      }
      frame.showCloseButton = false
      frame.showFollowButton = true
      frame.setFollowing(false)
      this.placeFrameInFrontOfHead(110)
      frame.useTiltMode = true
      frame.tiltUpThreshold = 0
      frame.tiltDownThreshold = 0
      frame.setUseFollow(true)
      this.bindViewFlatRotation(frame)
      frame.setBillboardBufferDegrees(4, 4)
      frame.setFollowing(true)

      const host = frame.contentTransform.getSceneObject()
      this.buildWelcomeContent(host)
      this.buildStudioContent(host)
      this.buildCharacterPicker(host)
      this.showWelcome()
      this.applyInventoryState()
      this.applyCachedText()
      console.log("[SpatialDirectorUI] READY flow=welcome-to-empty-studio programPreview=embedded following=true verticalFollow=true distanceCm=110")
    })
  }

  setStudioInventory(characterCount: number, activeCameraIds: RigId[], lightAdded: boolean): void {
    this.characterCount = characterCount
    this.activeCameraIds = activeCameraIds.slice()
    this.lightAdded = lightAdded
    if (this.selectedCamera && this.activeCameraIds.indexOf(this.selectedCamera) < 0) this.selectedCamera = null
    this.applyInventoryState()
  }

  setStatus(message: string): void {
    this.currentStatus = message.toUpperCase()
    if (this.statusText) this.statusText.text = this.currentStatus
  }

  setGuide(message: string): void {
    this.currentGuide = message.toUpperCase()
    if (this.guideText) this.guideText.text = this.currentGuide
  }

  setTimeline(message: string): void {
    this.currentTimeline = message.toUpperCase()
    if (this.timelineText) this.timelineText.text = this.currentTimeline
  }

  setSelectedCamera(id: RigId | null): void {
    this.selectedCamera = id
    for (const cameraId of CAMERA_IDS) {
      const label = this.cameraLabels[cameraId]
      if (!label) continue
      const selected = cameraId === id
      label.text = (selected ? "● " : "○ ") + CAMERA_LABELS[cameraId]
      label.textFill.color = selected ? this.accentColor : ICE
    }
  }

  setSequenceProgress(currentSeconds: number, totalSeconds: number, shotNumber: number, shotCount: number): void {
    if (shotCount <= 0 || totalSeconds <= 0) {
      this.currentProgress = "NO SHOTS YET · ADD A CAMERA TO BEGIN"
    } else {
      const ratio = Math.max(0, Math.min(1, currentSeconds / Math.max(totalSeconds, 0.001)))
      const filled = Math.round(ratio * 10)
      let bar = ""
      for (let i = 0; i < 10; i++) bar += i < filled ? "=" : "."
      this.currentProgress = "[" + bar + "]  " + this.time(currentSeconds) + " / " + this.time(totalSeconds) + "  ·  SHOT " + shotNumber + "/" + shotCount
    }
    if (this.progressText) this.progressText.text = this.currentProgress
  }

  setTakeState(state: TakeState, detail: string = ""): void {
    this.currentTakeState = state
    this.currentTakeDetail = detail
    this.applyTakeState()
  }

  private buildWelcomeContent(host: SceneObject): void {
    const content = this.createContentRoot(host, "Welcome Flow")
    this.welcomeRoot = content
    const column = this.createColumn(content)
    column.justifyContent = FlexJustify.Center

    this.addTextRow(content, column, "DIRECTOR STUDIO", "Caption", 2.2, HorizontalAlignment.Center, this.activeColor)
    this.addTextRow(content, column, "SPATIAL DIRECTOR", "Title", 6, HorizontalAlignment.Center, this.accentColor)
    this.addTextRow(content, column, "BUILD A SHOT IN YOUR SPACE", "Hero", 4.5, HorizontalAlignment.Center, ICE)
    this.addTextRow(content, column, "START WITH AN EMPTY STAGE. ADD ONLY WHAT YOUR TAKE NEEDS.", "Body", 3.8, HorizontalAlignment.Center, MUTED_BLUE)
    this.addTextRow(content, column, "QUICK START", "Section", 2.8, HorizontalAlignment.Left, this.activeColor)
    this.addTextRow(content, column, "01   ADD AND PLACE A CHARACTER", "Body", 3, HorizontalAlignment.Left, ICE)
    this.addTextRow(content, column, "02   ADD 1–3 CAMERAS AND FRAME YOUR SHOTS", "Body", 3, HorizontalAlignment.Left, ICE)
    this.addTextRow(content, column, "03   ADD A LIGHT AND TUNE ITS LOOK", "Body", 3, HorizontalAlignment.Left, ICE)
    this.addTextRow(content, column, "04   PLAY THE SEQUENCE AND CAPTURE", "Body", 3, HorizontalAlignment.Left, ICE)
    this.addTextRow(content, column, "PINCH TO MOVE · TWO HANDS TO ROTATE OR SCALE", "Caption", 2.5, HorizontalAlignment.Center, this.readyColor)
    this.addButtonRow(content, column, 6.7, [{
      label: "START BUILDING",
      style: "Primary",
      action: () => this.enterStudio(),
      onBuilt: (_object, label) => this.welcomeButtonLabel = label,
    }])
    this.addTextRow(content, column, "REOPEN THIS GUIDE ANY TIME FROM THE STUDIO", "Caption", 2.2, HorizontalAlignment.Center, MUTED_BLUE)
  }

  private buildStudioContent(host: SceneObject): void {
    const content = this.createContentRoot(host, "Studio Console")
    this.studioRoot = content
    const column = this.createColumn(content)

    this.addStudioHeader(content, column)

    this.addButtonRow(content, column, 5.2, [
      {label: "+ CHARACTER 0/3", style: "Secondary", action: () => this.scheduleCharacterPicker(), onBuilt: (_object, label) => this.addCharacterLabel = label},
      {label: "+ CAMERA 0/3", style: "Primary", action: () => this._onAddCamera.invoke(), onBuilt: (_object, label) => this.addCameraLabel = label},
      {label: "+ LIGHT", style: "Secondary", action: () => this._onAddLight.invoke(), onBuilt: (_object, label) => this.addLightLabel = label},
    ])

    this.addTextRow(content, column, "PROGRAM CAMERAS", "Section", 1.9, HorizontalAlignment.Left, this.activeColor)
    this.addButtonRow(content, column, 5, [
      {label: CAMERA_LABELS.A, id: "A", style: "PrimaryNeutral", action: () => this.selectAndEmit("A")},
      {label: CAMERA_LABELS.B, id: "B", style: "PrimaryNeutral", action: () => this.selectAndEmit("B")},
      {label: CAMERA_LABELS.C, id: "C", style: "PrimaryNeutral", action: () => this.selectAndEmit("C")},
    ])

    this.addButtonRow(content, column, 5.5, [{label: "PLAY + CAPTURE", style: "Primary", action: () => this._onPlay.invoke()}])
    this.addTextRow(content, column, "DIRECTOR TOOLS", "Section", 1.9, HorizontalAlignment.Left, this.activeColor)
    this.addButtonRow(content, column, 4.8, [
      {label: "RESET", style: "Secondary", action: () => this._onReset.invoke()},
      {label: "PERFORM", style: "Secondary", action: () => this._onAction.invoke()},
      {label: "PLACE", style: "Secondary", action: () => this._onPlace.invoke()},
      {label: "GUIDE", style: "Secondary", action: () => this.showWelcome()},
    ])

    this.guideText = this.addTextRow(content, column, this.currentGuide, "Body", 2.3, HorizontalAlignment.Center, ICE)
    this.timelineText = this.addTextRow(content, column, this.currentTimeline, "Caption", 2, HorizontalAlignment.Center, ICE)
    this.progressText = this.addTextRow(content, column, this.currentProgress, "Caption", 2, HorizontalAlignment.Center, this.accentColor)
    this.takeText = this.addTextRow(content, column, "CAPTURE · IDLE · PREVIEW MOCK", "Section", 2.2, HorizontalAlignment.Center, MUTED_BLUE)
  }

  private buildCharacterPicker(host: SceneObject): void {
    const content = this.createContentRoot(host, "Character Picker")
    this.characterPickerRoot = content
    const column = this.createColumn(content)
    column.rowGap = 0.5

    this.addTextRow(content, column, "CAST YOUR SCENE", "Title", 4.8, HorizontalAlignment.Center, this.accentColor)
    this.addTextRow(content, column, "CHOOSE UP TO THREE CHARACTERS · TAP A CARD TO ADD", "Body", 2.8, HorizontalAlignment.Center, ICE)
    this.addTextRow(content, column, "LIVE 3D CHARACTER PREVIEWS", "Caption", 2.1, HorizontalAlignment.Center, this.activeColor)

    const gridHost = this.obj(content, "Character Grid")
    const gridHostItem = gridHost.createComponent(FlexItem.getTypeName()) as FlexItem
    gridHostItem.overrideHeight = 33.2
    gridHostItem.flexShrink = 0
    gridHostItem.alignSelf = FlexAlignSelf.Stretch
    column.addItems([gridHostItem])

    const grid = gridHost.createComponent(GridLayout.getTypeName()) as GridLayout
    grid.width = this.panelWidth - 4
    grid.height = 33.2
    grid.templateColumns = "1fr 1fr"
    grid.templateRows = "1fr 1fr"
    grid.columnGap = 0.9
    grid.rowGap = 0.9
    grid.justifyItems = GridAlign.Stretch
    grid.alignItems = GridAlign.Stretch

    for (const option of CHARACTER_OPTIONS) this.addCharacterCard(gridHost, grid, option)
    this.addButtonRow(content, column, 4.8, [{label: "BACK TO STUDIO", style: "PrimaryNeutral", action: () => this.scheduleStudioReturn()}])
    content.enabled = false
  }

  private addCharacterCard(parent: SceneObject, grid: GridLayout, option: CharacterOption): void {
    const width = (this.panelWidth - 4.9) / 2
    const height = 16.15
    const card = this.obj(parent, "Character Card - " + option.name)
    const item = card.createComponent(GridItem.getTypeName()) as GridItem
    item.overrideWidth = width
    item.overrideHeight = height
    grid.addItems([item])

    const button = card.createComponent(Button.getTypeName()) as Button
    button.setVariant({theme: "SnapOS2", shape: "Rectangle", style: "Secondary"})
    button.onInitialized.add(() => button.size = new vec3(width, height, 1))
    button.onTriggerUp.add(() => this.selectCharacter(option.id))

    // Keep the complete silhouette inside the card's visual preview area. The
    // larger Z lift also prevents deep Mixamo meshes from intersecting the
    // UIKit button face when the panel is viewed at an angle.
    const previewAnchor = this.obj(card, option.name + " Preview", new vec3(option.previewX, option.previewY, 5.2))
    const preview = option.prefab.instantiate(previewAnchor)
    preview.name = option.name + " Preview Model"
    preview.getTransform().setLocalScale(new vec3(option.previewScale, option.previewScale, option.previewScale))
    this.setLayerRecursive(preview, this.sceneObject.layer)
    this.disableAnimationPlayers(preview)

    const nameObject = this.obj(card, option.name + " Name", new vec3(0, -5.1, 0.9))
    const nameText = nameObject.createComponent("Component.Text") as Text
    nameText.text = option.name
    nameText.textFill.color = ICE
    nameText.depthTest = true
    applyTextRole(nameText, "Section")
    nameText.horizontalAlignment = HorizontalAlignment.Center
    nameText.verticalAlignment = VerticalAlignment.Center
    nameText.horizontalOverflow = HorizontalOverflow.Shrink
    nameText.verticalOverflow = VerticalOverflow.Overflow
    nameText.layoutRect = Rect.create(-width / 2 + 0.8, width / 2 - 0.8, -1.3, 1.3)

    const roleObject = this.obj(card, option.name + " Role", new vec3(0, -6.8, 0.9))
    const roleText = roleObject.createComponent("Component.Text") as Text
    roleText.text = option.role + " · TAP TO ADD"
    roleText.textFill.color = this.accentColor
    roleText.depthTest = true
    applyTextRole(roleText, "Caption")
    roleText.horizontalAlignment = HorizontalAlignment.Center
    roleText.verticalAlignment = VerticalAlignment.Center
    roleText.horizontalOverflow = HorizontalOverflow.Shrink
    roleText.verticalOverflow = VerticalOverflow.Overflow
    roleText.layoutRect = Rect.create(-width / 2 + 0.8, width / 2 - 0.8, -1, 1)
  }

  private addStudioHeader(parent: SceneObject, parentLayout: FlexLayout): void {
    const headerHeight = 12
    const header = this.obj(parent, "Studio Header")
    const headerItem = header.createComponent(FlexItem.getTypeName()) as FlexItem
    headerItem.overrideHeight = headerHeight
    headerItem.flexShrink = 0
    headerItem.alignSelf = FlexAlignSelf.Stretch
    parentLayout.addItems([headerItem])

    const headerLayout = header.createComponent(FlexLayout.getTypeName()) as FlexLayout
    headerLayout.autoDiscoverItemsOnStart = false
    headerLayout.width = this.panelWidth - 4
    headerLayout.height = headerHeight
    headerLayout.direction = FlexDirection.Row
    headerLayout.alignItems = FlexAlign.Center
    headerLayout.justifyContent = FlexJustify.Center
    headerLayout.columnGap = 0.8

    const copyWidth = 21.8
    const copy = this.obj(header, "Studio Identity")
    const copyItem = copy.createComponent(FlexItem.getTypeName()) as FlexItem
    copyItem.overrideWidth = copyWidth
    copyItem.overrideHeight = headerHeight
    copyItem.flexShrink = 0
    headerLayout.addItems([copyItem])
    const copyLayout = copy.createComponent(FlexLayout.getTypeName()) as FlexLayout
    copyLayout.autoDiscoverItemsOnStart = false
    copyLayout.width = copyWidth
    copyLayout.height = headerHeight
    copyLayout.direction = FlexDirection.Column
    copyLayout.alignItems = FlexAlign.Stretch
    copyLayout.justifyContent = FlexJustify.Center
    copyLayout.rowGap = 0.25
    this.addSizedTextRow(copy, copyLayout, "SPATIAL DIRECTOR", "Title", 4.2, copyWidth, HorizontalAlignment.Center, this.accentColor)
    this.statusText = this.addSizedTextRow(copy, copyLayout, this.currentStatus, "Status", 2.8, copyWidth, HorizontalAlignment.Center, this.readyColor)
    this.inventoryText = this.addSizedTextRow(copy, copyLayout, "SCENE · CHARACTER 0/1 · CAMERAS 0/3 · LIGHT 0/1", "Caption", 2.2, copyWidth, HorizontalAlignment.Center, MUTED_BLUE)

    const previewWidth = 21.4
    const preview = this.obj(header, "Program Preview Group")
    const previewItem = preview.createComponent(FlexItem.getTypeName()) as FlexItem
    previewItem.overrideWidth = previewWidth
    previewItem.overrideHeight = headerHeight
    previewItem.flexShrink = 0
    headerLayout.addItems([previewItem])
    const previewLayout = preview.createComponent(FlexLayout.getTypeName()) as FlexLayout
    previewLayout.autoDiscoverItemsOnStart = false
    previewLayout.width = previewWidth
    previewLayout.height = headerHeight
    previewLayout.direction = FlexDirection.Column
    previewLayout.alignItems = FlexAlign.Center
    previewLayout.justifyContent = FlexJustify.Center
    previewLayout.rowGap = 0.2
    this.addSizedTextRow(preview, previewLayout, "PROGRAM PREVIEW · LIVE", "Caption", 1.1, previewWidth, HorizontalAlignment.Center, this.activeColor)
    this.addProgramPreview(preview, previewLayout, 19, 10.7)
  }

  private addProgramPreview(parent: SceneObject, parentLayout: FlexLayout, monitorWidth: number, monitorHeight: number): void {
    const feedWidth = monitorWidth - 0.8
    const feedHeight = feedWidth * 9 / 16
    const monitor = this.obj(parent, "Embedded Program Preview")
    const item = monitor.createComponent(FlexItem.getTypeName()) as FlexItem
    item.overrideWidth = monitorWidth
    item.overrideHeight = monitorHeight
    item.flexShrink = 0
    item.alignSelf = FlexAlignSelf.Center
    parentLayout.addItems([item])

    const backPlate = monitor.createComponent(BackPlate.getTypeName()) as BackPlate
    backPlate.size = new vec2(monitorWidth, monitorHeight)
    backPlate.style = "dark"

    const feed = this.obj(monitor, "Program Feed", new vec3(0, 0, 0.62))
    feed.getTransform().setLocalScale(new vec3(feedWidth, feedHeight, 1))
    const image = feed.createComponent("Component.Image") as Image
    const material = PROGRAM_MONITOR_MATERIAL.clone()
    material.mainPass.baseTex = PROGRAM_RENDER
    material.mainPass.depthTest = true
    material.mainPass.depthWrite = false
    image.clearMaterials()
    image.addMaterial(material)
  }

  private createContentRoot(host: SceneObject, name: string): SceneObject {
    const content = this.obj(host, name, new vec3(0, 0, 0.6))
    content.getTransform().setLocalScale(new vec3(this.panelScale, this.panelScale, this.panelScale))
    return content
  }

  private createColumn(content: SceneObject): FlexLayout {
    const column = content.createComponent(FlexLayout.getTypeName()) as FlexLayout
    column.autoDiscoverItemsOnStart = false
    column.width = this.panelWidth
    column.height = this.panelHeight
    column.direction = FlexDirection.Column
    column.alignItems = FlexAlign.Stretch
    column.justifyContent = FlexJustify.Start
    column.rowGap = 0.3
    column.paddingTop = 0.8
    column.paddingBottom = 0.8
    column.paddingLeft = 2
    column.paddingRight = 2
    return column
  }

  private enterStudio(): void {
    this.hasEnteredStudio = true
    this.setActiveView("studio")
    if (this.welcomeButtonLabel) this.welcomeButtonLabel.text = "BACK TO STUDIO"
    this._onEnterStudio.invoke()
  }

  private showWelcome(): void {
    this.setActiveView("welcome")
    if (this.welcomeButtonLabel) this.welcomeButtonLabel.text = this.hasEnteredStudio ? "BACK TO STUDIO" : "START BUILDING"
  }

  private showCharacterPicker(): void {
    if (this.characterCount >= 3) {
      this.setStatus("Cast full · three characters are already active")
      this.setGuide("Move or perform with the current cast")
      return
    }
    this.setActiveView("picker")
  }

  private scheduleCharacterPicker(): void {
    // Reveal after the opening pinch has fully released so the same gesture
    // cannot fall through onto the top-left character card.
    this.pickerOpenEvent?.reset(0.35)
  }

  private returnToStudio(): void {
    this.setActiveView("studio")
    console.log("[SpatialDirectorUI] VIEW=studio picker=false")
  }

  private setActiveView(view: "welcome" | "studio" | "picker"): void {
    this.activeView = view
    this.viewSettleFrames = 4
    this.applyViewState()
  }

  private applyViewState(): void {
    if (this.welcomeRoot) this.welcomeRoot.enabled = this.activeView === "welcome"
    if (this.studioRoot) this.studioRoot.enabled = this.activeView === "studio"
    if (this.characterPickerRoot) this.characterPickerRoot.enabled = this.activeView === "picker"
  }

  private selectCharacter(id: CharacterId): void {
    this.scheduleStudioReturn()
    this._onCharacterSelected.invoke(id)
    console.log("[SpatialDirectorUI] CHARACTER PICKED id=" + id)
  }

  private scheduleStudioReturn(): void {
    console.log("[SpatialDirectorUI] VIEW studio scheduled")
    // Let the releasing pinch clear before revealing the button underneath;
    // otherwise the same release can immediately reopen the picker.
    this.pickerCloseEvent?.reset(0.35)
  }

  private applyInventoryState(): void {
    const cameraCount = this.activeCameraIds.length
    if (this.inventoryText) {
      this.inventoryText.text = "SCENE · CAST " + this.characterCount + "/3 · CAMERAS " + cameraCount + "/3 · LIGHT " + (this.lightAdded ? "1/1" : "0/1")
      this.inventoryText.textFill.color = cameraCount > 0 ? this.readyColor : this.activeColor
    }
    if (this.addCharacterLabel) {
      this.addCharacterLabel.text = this.characterCount >= 3 ? "CAST 3/3" : "+ CHARACTER " + this.characterCount + "/3"
      this.addCharacterLabel.textFill.color = this.characterCount > 0 ? this.readyColor : ICE
    }
    if (this.addCameraLabel) {
      this.addCameraLabel.text = cameraCount >= 3 ? "CAMERAS 3/3" : "+ CAMERA " + cameraCount + "/3"
      this.addCameraLabel.textFill.color = cameraCount >= 3 ? this.readyColor : this.accentColor
    }
    if (this.addLightLabel) {
      this.addLightLabel.text = this.lightAdded ? "LIGHT READY" : "+ LIGHT"
      this.addLightLabel.textFill.color = this.lightAdded ? this.readyColor : this.activeColor
    }
    for (const id of CAMERA_IDS) {
      const object = this.cameraButtonObjects[id]
      if (object) object.enabled = this.activeCameraIds.indexOf(id) >= 0
    }
    this.setSelectedCamera(this.selectedCamera)
  }

  private applyCachedText(): void {
    if (this.statusText) this.statusText.text = this.currentStatus
    if (this.guideText) this.guideText.text = this.currentGuide
    if (this.timelineText) this.timelineText.text = this.currentTimeline
    if (this.progressText) this.progressText.text = this.currentProgress
    this.applyTakeState()
  }

  private applyTakeState(): void {
    if (!this.takeText) return
    const state = this.currentTakeState
    const label = state === "Recording" ? "● RECORDING" : state.toUpperCase()
    this.takeText.text = "CAPTURE · " + label + (this.currentTakeDetail ? " · " + this.currentTakeDetail.toUpperCase() : "")
    if (state === "Ready") this.takeText.textFill.color = this.readyColor
    else if (state === "Error") this.takeText.textFill.color = this.errorColor
    else if (state === "Recording" || state === "Uploading" || state === "Processing") this.takeText.textFill.color = this.activeColor
    else this.takeText.textFill.color = MUTED_BLUE
  }

  private selectAndEmit(id: RigId): void {
    if (this.activeCameraIds.indexOf(id) < 0) return
    this.setSelectedCamera(id)
    this._onCamera.invoke(id)
  }

  private addButtonRow(parent: SceneObject, parentLayout: FlexLayout, height: number, buttons: ButtonConfig[]): void {
    const row = this.obj(parent, "Button Row")
    const rowItem = row.createComponent(FlexItem.getTypeName()) as FlexItem
    rowItem.overrideHeight = height
    rowItem.flexShrink = 0
    rowItem.alignSelf = FlexAlignSelf.Stretch
    parentLayout.addItems([rowItem])

    const layout = row.createComponent(FlexLayout.getTypeName()) as FlexLayout
    layout.autoDiscoverItemsOnStart = false
    layout.width = this.panelWidth - 4
    layout.height = height
    layout.direction = FlexDirection.Row
    layout.alignItems = FlexAlign.Center
    layout.justifyContent = FlexJustify.Center
    layout.columnGap = 0.8

    const availableWidth = this.panelWidth - 4.8 - Math.max(0, buttons.length - 1) * 0.8
    const buttonWidth = availableWidth / buttons.length
    for (const config of buttons) {
      const buttonObject = this.obj(row, config.label)
      const buttonItem = buttonObject.createComponent(FlexItem.getTypeName()) as FlexItem
      buttonItem.overrideWidth = buttonWidth
      buttonItem.overrideHeight = height
      buttonItem.flexShrink = 0
      layout.addItems([buttonItem])

      const button = buttonObject.createComponent(Button.getTypeName()) as Button
      button.setVariant({theme: "SnapOS2", shape: "Rectangle", style: config.style})
      button.onInitialized.add(() => button.size = new vec3(buttonWidth, height, 1))
      button.onTriggerUp.add(config.action)
      const label = this.addButtonLabel(buttonObject, config.label, buttonWidth - 0.6, height)
      if (config.id) {
        this.cameraLabels[config.id] = label
        this.cameraButtonObjects[config.id] = buttonObject
      }
      config.onBuilt?.(buttonObject, label)
    }
  }

  private addTextRow(
    parent: SceneObject,
    layout: FlexLayout,
    value: string,
    role: TextRole,
    height: number,
    alignment: HorizontalAlignment,
    color: vec4,
  ): Text {
    return this.addSizedTextRow(parent, layout, value, role, height, this.panelWidth - 5, alignment, color)
  }

  private addSizedTextRow(
    parent: SceneObject,
    layout: FlexLayout,
    value: string,
    role: TextRole,
    height: number,
    width: number,
    alignment: HorizontalAlignment,
    color: vec4,
  ): Text {
    const row = this.obj(parent, "Text - " + value)
    const item = row.createComponent(FlexItem.getTypeName()) as FlexItem
    item.overrideHeight = height
    item.flexShrink = 0
    item.alignSelf = FlexAlignSelf.Stretch
    layout.addItems([item])
    const text = row.createComponent("Component.Text") as Text
    text.text = value
    text.textFill.color = color
    text.depthTest = true
    applyTextRole(text, role)
    text.horizontalAlignment = alignment
    text.verticalAlignment = VerticalAlignment.Center
    text.horizontalOverflow = role === "Title" || role === "Hero" || role === "Section"
      ? HorizontalOverflow.Overflow
      : HorizontalOverflow.Shrink
    text.verticalOverflow = VerticalOverflow.Overflow
    text.layoutRect = Rect.create(-width / 2, width / 2, -height / 2, height / 2)
    return text
  }

  private addButtonLabel(parent: SceneObject, value: string, width: number, height: number): Text {
    const labelObject = this.obj(parent, "Button Label", new vec3(0, 0, 0.08))
    const text = labelObject.createComponent("Component.Text") as Text
    text.text = value
    text.textFill.color = ICE
    text.depthTest = true
    applyTextRole(text, "Button")
    text.horizontalAlignment = HorizontalAlignment.Center
    text.verticalAlignment = VerticalAlignment.Center
    text.horizontalOverflow = HorizontalOverflow.Shrink
    text.verticalOverflow = VerticalOverflow.Overflow
    text.layoutRect = Rect.create(-width / 2, width / 2, -height / 2 + 0.4, height / 2 - 0.4)
    return text
  }

  private placeFrameInFrontOfHead(distanceCm: number): void {
    const cameraObject = this.findInScene("Camera Object")
    if (!cameraObject) {
      console.warn("[SpatialDirectorUI] Camera Object not found; keeping the current floating pose")
      return
    }
    const cameraTransform = cameraObject.getTransform()
    const cameraRotation = cameraTransform.getWorldRotation()
    const cameraPosition = cameraTransform.getWorldPosition()
    const forward = cameraRotation.multiplyVec3(new vec3(0, 0, -1))
    const panelTransform = this.sceneObject.getTransform()
    panelTransform.setWorldPosition(new vec3(
      cameraPosition.x + forward.x * distanceCm,
      cameraPosition.y + forward.y * distanceCm - 4,
      cameraPosition.z + forward.z * distanceCm,
    ))
    panelTransform.setWorldRotation(quat.quatIdentity())
  }

  private bindViewFlatRotation(frame: Frame): void {
    const cameraObject = this.findInScene("Camera Object")
    if (!cameraObject) {
      console.warn("[SpatialDirectorUI] Camera Object not found; view-flat rotation disabled")
      return
    }
    const cameraTransform = cameraObject.getTransform()
    const panelTransform = this.sceneObject.getTransform()
    frame.onFollowUpdate.add(() => panelTransform.setWorldRotation(cameraTransform.getWorldRotation()))
    console.log("[SpatialDirectorUI] VIEW_FLAT bound=true")
  }

  private findInScene(name: string): SceneObject | null {
    for (let index = 0; index < global.scene.getRootObjectsCount(); index++) {
      const found = this.findByName(global.scene.getRootObject(index), name)
      if (found) return found
    }
    return null
  }

  private findByName(parent: SceneObject, name: string): SceneObject | null {
    if (parent.name === name) return parent
    for (let index = 0; index < parent.getChildrenCount(); index++) {
      const found = this.findByName(parent.getChild(index), name)
      if (found) return found
    }
    return null
  }

  private disableAnimationPlayers(object: SceneObject): void {
    const player = object.getComponent("Component.AnimationPlayer") as AnimationPlayer
    if (player) player.enabled = false
    for (let index = 0; index < object.getChildrenCount(); index++) this.disableAnimationPlayers(object.getChild(index))
  }

  private setLayerRecursive(object: SceneObject, layer: LayerSet): void {
    object.layer = layer
    for (let index = 0; index < object.getChildrenCount(); index++) this.setLayerRecursive(object.getChild(index), layer)
  }

  private time(seconds: number): string {
    const whole = Math.max(0, Math.floor(seconds))
    const minutes = Math.floor(whole / 60)
    const remainder = whole % 60
    return "0" + minutes + ":" + (remainder < 10 ? "0" : "") + remainder
  }

  private obj(parent: SceneObject, name: string, position?: vec3): SceneObject {
    const object = global.scene.createSceneObject(name)
    object.setParent(parent)
    object.layer = this.sceneObject.layer
    if (position) object.getTransform().setLocalPosition(position)
    return object
  }
}
