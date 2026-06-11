// Frame capture from a live three.js scene (E10-T2).
import {
  PerspectiveCamera,
  type Camera,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from 'three'

export interface RenderHandles {
  gl: WebGLRenderer
  scene: Scene
  camera: Camera
  /** The group whose Y rotation is advanced each frame for the 360° spin. */
  group: Object3D
}

export interface FrameDrawer {
  /** Render frame `i` of `total` and return the canvas to capture. */
  drawFrame: (i: number, total: number) => HTMLCanvasElement
  /** Restore the renderer to its pre-capture size. */
  restore: () => void
}

/**
 * Resizes the renderer to the target portrait resolution and returns a per-frame
 * draw function that advances the doll's Y rotation and renders synchronously.
 */
export function createFrameDrawer(
  handles: RenderHandles,
  width: number,
  height: number,
): FrameDrawer {
  const { gl, scene, camera, group } = handles
  const prev = { w: gl.domElement.width, h: gl.domElement.height }

  gl.setSize(width, height, false)
  if (camera instanceof PerspectiveCamera) {
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }

  const drawFrame = (i: number, total: number): HTMLCanvasElement => {
    group.rotation.y = (i / total) * Math.PI * 2
    gl.render(scene, camera)
    return gl.domElement
  }

  const restore = () => gl.setSize(prev.w, prev.h, false)

  return { drawFrame, restore }
}

export const RENDER_WIDTH = 1080
export const RENDER_HEIGHT = 1920
export const RENDER_FPS = 30
