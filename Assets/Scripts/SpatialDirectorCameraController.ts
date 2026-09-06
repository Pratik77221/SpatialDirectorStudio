import {SpatialDirectorCameraRig} from "./SpatialDirectorCameraRig"

type RigId = "A" | "B" | "C"

interface RigEntry {
  id: RigId
  object: SceneObject
  settings: SpatialDirectorCameraRig
}

/** Copies an editable rig pose into the independent Program Camera on a cut. */
export class SpatialDirectorCameraController {
  private activeId: RigId = "A"
  private rigs: RigEntry[] = []
  private programCamera: Camera | null

  constructor(private programCameraObject: SceneObject, rigObjects: SceneObject[]) {
    this.programCamera = this.programCameraObject.getComponent("Component.Camera") as Camera
    for (const object of rigObjects) {
      const settings = object.getComponent(SpatialDirectorCameraRig.getTypeName()) as SpatialDirectorCameraRig
      if (settings) {
        this.rigs.push({id: settings.getId(), object, settings})
      }
    }
  }

  cutTo(id: RigId): boolean {
    const rig = this.rigs.find((entry) => entry.id === id)
    if (!rig || !this.programCamera) {
      console.error("[SpatialDirector] Cannot cut to camera " + id)
      return false
    }

    this.activeId = id
    this.syncActivePose()
    this.programCamera.fov = rig.settings.fovDegrees * Math.PI / 180
    console.log("[SpatialDirector] CUT=" + id + " FOV=" + rig.settings.fovDegrees)
    return true
  }

  /** Keeps the Program Camera attached to the currently selected physical rig. */
  syncActivePose(): void {
    const rig = this.rigs.find((entry) => entry.id === this.activeId)
    if (!rig || !this.programCamera) return

    const source = rig.object.getTransform()
    const destination = this.programCameraObject.getTransform()
    destination.setWorldPosition(rig.settings.getOpticalWorldPosition())
    destination.setWorldRotation(source.getWorldRotation())
  }

  getActiveId(): RigId {
    return this.activeId
  }
}
