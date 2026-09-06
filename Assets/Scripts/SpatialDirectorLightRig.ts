import "SpectaclesUIKit.lspkg/Scripts/Themes/ThemeService"
import {BackPlate} from "SpectaclesUIKit.lspkg/Scripts/BackPlate"
import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import {Slider} from "SpectaclesUIKit.lspkg/Scripts/Components/Slider/Slider"
import {RoundedRectangleVisual} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangleVisual"
import {GradientParameters} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"

interface ColorPreset {
  name: string
  light: vec3
  ui: vec4
}

const PANEL_WIDTH = 15.5
const PANEL_HEIGHT = 13.5
const SLIDER_WIDTH = 10.8
const LIGHT_REAR_OFFSET = 5.4
const ORANGE = new vec4(1, 0.28, 0.035, 1)
const ORANGE_HOT = new vec4(1, 0.47, 0.08, 1)
const TEXT = new vec4(0.76, 0.9, 0.97, 1)
const MUTED = new vec4(0.58, 0.72, 0.82, 0.86)

const COLORS: ColorPreset[] = [
  {name: "WHITE", light: new vec3(1, 1, 1), ui: new vec4(1, 1, 1, 1)},
  {name: "WARM", light: new vec3(1, 0.68, 0.36), ui: new vec4(1, 0.68, 0.36, 1)},
  {name: "RED", light: new vec3(1, 0.16, 0.1), ui: new vec4(1, 0.16, 0.1, 1)},
  {name: "MAGENTA", light: new vec3(1, 0.12, 0.62), ui: new vec4(1, 0.12, 0.62, 1)},
  {name: "BLUE", light: new vec3(0.18, 0.36, 1), ui: new vec4(0.18, 0.36, 1, 1)},
  {name: "CYAN", light: new vec3(0.08, 0.9, 1), ui: new vec4(0.08, 0.9, 1, 1)},
  {name: "GREEN", light: new vec3(0.22, 1, 0.28), ui: new vec4(0.22, 1, 0.28, 1)},
  {name: "AMBER", light: new vec3(1, 0.42, 0.05), ui: new vec4(1, 0.42, 0.05, 1)},
]

/** Compact rear control deck for the physical key light. */
@component
export class SpatialDirectorLightRig extends BaseScriptComponent {
  @input
  @hint("Lowest usable key-light intensity.")
  minIntensity: number = 0.25

  @input
  @hint("Highest usable key-light intensity.")
  maxIntensity: number = 6

  private light: LightSource | null = null
  private panelRoot: SceneObject | null = null
  private intensityText: Text | null = null
  private colorText: Text | null = null
  private colorDots: Text[] = []
  private controlsVisible = false
  private built = false

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.buildControls())
  }

  setControlsVisible(visible: boolean): void {
    this.controlsVisible = visible
    if (this.panelRoot) this.panelRoot.enabled = visible
  }

  setColorIndex(index: number): void {
    this.setColor(index)
  }

  setIntensityNormalized(normalized: number): void {
    this.setIntensity(normalized)
  }

  private buildControls(): void {
    if (this.built) return
    this.built = true
    this.light = this.getSceneObject().getComponent("Component.LightSource") as LightSource
    if (!this.light) {
      console.error("[SpatialDirectorLight] LightSource missing")
      return
    }

    // +Z is the physical rear of the authored light. Keeping identity local
    // rotation makes the deck parallel to the light housing instead of billboarding.
    const panel = this.obj(this.getSceneObject(), "Key Light Rear Controls", new vec3(0, 0, LIGHT_REAR_OFFSET))
    this.panelRoot = panel
    panel.getTransform().setLocalRotation(quat.quatIdentity())
    panel.createComponent("Component.Canvas")
    const plate = panel.createComponent(BackPlate.getTypeName()) as BackPlate
    plate.style = "simple"
    plate.size = new vec2(PANEL_WIDTH, PANEL_HEIGHT)

    const content = this.obj(panel, "Light Control Content", new vec3(0, 0, 0.65))
    this.text(content, "KEY LIGHT", new vec3(-4.8, 5.45, 0), 5, 1.2, 27, TEXT, HorizontalAlignment.Left)
    this.text(content, "REAR CONTROLS", new vec3(4.2, 5.45, 0), 6, 1.2, 19, ORANGE, HorizontalAlignment.Right)
    this.colorText = this.text(content, "COLOR · WHITE", new vec3(0, 4.15, 0), 10, 1, 22, MUTED, HorizontalAlignment.Center)

    const wheelCenter = new vec3(0, 1.15, 0.14)
    const radius = 2.55
    for (let i = 0; i < COLORS.length; i++) {
      const angle = i / COLORS.length * Math.PI * 2
      const x = Math.sin(angle) * radius
      const y = Math.cos(angle) * radius
      this.createColorButton(content, i, wheelCenter.add(new vec3(x, y, 0)))
    }

    const initialIntensity = this.clamp01((this.light.intensity - this.minIntensity) / (this.maxIntensity - this.minIntensity))
    this.intensityText = this.text(content, "INTENSITY · " + Math.round(initialIntensity * 100) + "%", new vec3(-2.6, -2.45, 0), 10, 1, 22, MUTED, HorizontalAlignment.Left)
    const sliderObject = this.obj(content, "Light Intensity Slider", new vec3(0, -4.15, 0.14))
    const slider = sliderObject.createComponent(Slider.getTypeName()) as Slider
    slider.setThemeOverride("SnapOS2")
    slider.size = new vec3(SLIDER_WIDTH, 1.65, 0.8)
    slider.segmented = false
    slider.customKnobSize = true
    slider.knobSize = new vec2(1.35, 1.35)
    slider.initialize()
    slider.updateCurrentValue(initialIntensity)
    this.tintSlider(slider)
    slider.onValueChange.add((value) => this.setIntensity(value))

    this.setColor(0)
    panel.enabled = this.controlsVisible
    console.log("[SpatialDirectorLight] READY controls=color-wheel,intensity")
  }

  private createColorButton(parent: SceneObject, index: number, position: vec3): void {
    const preset = COLORS[index]
    const buttonObject = this.obj(parent, "Color " + preset.name, position)
    const button = buttonObject.createComponent(Button.getTypeName()) as Button
    button.setVariant({theme: "SnapOS2", shape: "Round", style: "PrimaryNeutral"})
    button.size = new vec3(2.15, 2.15, 0.7)
    button.initialize()
    button.onTriggerUp.add(() => this.setColor(index))
    const dot = this.text(buttonObject, "●", new vec3(0, 0, 0.42), 1.25, 1.25, 30, preset.ui, HorizontalAlignment.Center)
    this.colorDots.push(dot)
  }

  private setColor(index: number): void {
    if (!this.light) return
    const selected = COLORS[Math.max(0, Math.min(COLORS.length - 1, index))]
    this.light.color = selected.light
    if (this.colorText) this.colorText.text = "COLOR · " + selected.name
    for (let i = 0; i < this.colorDots.length; i++) {
      this.colorDots[i].size = i === index ? 39 : 29
      this.colorDots[i].text = i === index ? "◉" : "●"
    }
    console.log("[SpatialDirectorLight] COLOR=" + selected.name)
  }

  private setIntensity(normalized: number): void {
    if (!this.light) return
    const value = this.clamp01(normalized)
    this.light.intensity = this.minIntensity + (this.maxIntensity - this.minIntensity) * value
    if (this.intensityText) this.intensityText.text = "INTENSITY · " + Math.round(value * 100) + "%"
    console.log("[SpatialDirectorLight] INTENSITY=" + this.light.intensity.toFixed(2))
  }

  private tintSlider(slider: Slider): void {
    const gradient = this.gradient(ORANGE, ORANGE_HOT)
    const fill = slider.trackFillVisual as RoundedRectangleVisual
    const knob = slider.knobVisual as RoundedRectangleVisual
    if (fill && fill.applyBaseGradientNow) {
      fill.defaultGradient = gradient
      fill.hoveredGradient = gradient
      fill.triggeredGradient = gradient
      fill.applyBaseGradientNow(gradient)
    }
    if (knob && knob.applyBaseGradientNow) {
      knob.defaultGradient = gradient
      knob.hoveredGradient = gradient
      knob.triggeredGradient = gradient
      knob.applyBaseGradientNow(gradient)
    }
  }

  private gradient(left: vec4, right: vec4): GradientParameters {
    return {
      enabled: true,
      type: "Linear",
      start: new vec2(0, 0.5),
      end: new vec2(1, 0.5),
      stop0: {color: left, percent: 0, enabled: true},
      stop1: {color: right, percent: 1, enabled: true},
    }
  }

  private text(
    parent: SceneObject,
    value: string,
    position: vec3,
    width: number,
    height: number,
    size: number,
    color: vec4,
    alignment: HorizontalAlignment,
  ): Text {
    const object = this.obj(parent, "Text - " + value, position)
    const text = object.createComponent("Component.Text") as Text
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
