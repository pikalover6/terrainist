/**
 * The shader pack.
 *
 * Everything between "the world is a pile of vertex buffers" and "a frame is
 * on the screen": the sun and its shadow map, the block materials, the HDR
 * target, the post chain, and the switch that turns all of it off again.
 *
 * ## The frame, in order
 *
 * 1. **The sun's pass.** The opaque half of the scene, drawn from an
 *    orthographic camera at the sun's bearing into a depth texture. One
 *    cascade, snapped to its own texel grid (`shadow.js`), and cutout-aware —
 *    the depth material samples the same atlas and discards the same fragments
 *    the block material does, so a fern casts a fern.
 * 2. **The world's pass,** into a half-float target with a depth texture
 *    hanging off it. Half-float because an emissive block is deliberately
 *    brighter than white and an 8-bit target would clip it back to white
 *    before the bloom ever saw it.
 * 3. **The chain:** god rays (which read that depth, so the occlusion buffer
 *    costs nothing), bloom, and the grade — ACES, vignette, split-tone — which
 *    is the only pass that writes sRGB.
 *
 * ## Two rules
 *
 * - **Translucent geometry lives on layer 1.** That is the whole mechanism by
 *   which water and glass are excluded from the shadow pass without walking
 *   the scene graph every frame: the sun's camera only sees layer 0.
 * - **`off` must be a different program, not a quieter one.** Quality changes
 *   rebuild the materials' defines, so an `off` frame compiles the shader the
 *   viewer shipped with and takes the direct path to the screen with no target
 *   allocated at all.
 */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

import { cloudField } from "./noise.js";
import { fitSunCamera } from "./shadow.js";
import { SKY_PRESETS, paintSky, sunDirection, worldAzimuth } from "./sky.js";
import {
  BLOCK_FRAGMENT,
  BLOCK_VERTEX,
  DEPTH_FRAGMENT,
  DEPTH_VERTEX,
  GOD_RAYS_SHADER,
  GRADE_SHADER,
  blockDefines,
  blockUniforms,
  depthDefines,
} from "./shaders.js";
import { qualitySettings } from "./quality.js";

/** The layer translucent geometry sits on, and the sun's camera ignores. */
export const TRANSLUCENT_LAYER = 1;

/** How far ahead of the world the cloud field drifts, in blocks per second. */
const CLOUD_DRIFT = 1.9;

/** World size of one repeat of the cloud field. Big: these are weather. */
const CLOUD_EXTENT = 320;

const colorOf = (hex) => new THREE.Color(hex);

export class ShaderPack {
  constructor({ renderer, scene, camera, atlas, worldName, fogNear, fogFar, mode = "ultra" }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.baseFogNear = fogNear;
    this.baseFogFar = fogFar;
    this.settings = qualitySettings(mode);

    this.azimuth = worldAzimuth(worldName);
    const sun = sunDirection(this.azimuth);
    this.sun = new THREE.Vector3(sun.x, sun.y, sun.z).normalize();

    this.skies = new Map();
    this.cloudTexture = buildCloudTexture();

    this.shared = blockUniforms({
      map: { value: atlas },
      fogColor: { value: colorOf(0xa8c8e8) },
      fogNear: { value: fogNear },
      fogFar: { value: fogFar },
      sunDirection: { value: this.sun.clone() },
      sunColor: { value: colorOf(0xffffff) },
      ambientColor: { value: colorOf(0xffffff) },
      skyTop: { value: colorOf(0x3c78c8) },
      skyHorizon: { value: colorOf(0x8fbbe8) },
      waterDeep: { value: new THREE.Vector3(0.55, 0.82, 1.0) },
      shadowTexel: { value: new THREE.Vector2(1 / 2048, 1 / 2048) },
      sunMatrix: { value: new THREE.Matrix4() },
      cloudOffset: { value: new THREE.Vector2() },
      cloudMap: { value: this.cloudTexture },
      cloudScale: { value: 1 / CLOUD_EXTENT },
    });

    this.opaqueMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { ...this.shared, opacity: { value: 1 } },
      defines: {},
      vertexShader: BLOCK_VERTEX,
      fragmentShader: BLOCK_FRAGMENT,
      transparent: false,
      depthWrite: true,
      side: THREE.FrontSide,
    });
    this.transparentMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { ...this.shared, opacity: { value: 0.72 } },
      defines: {},
      vertexShader: BLOCK_VERTEX,
      fragmentShader: BLOCK_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.depthMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        map: this.shared.map,
        time: this.shared.time,
        windStrength: this.shared.windStrength,
      },
      defines: {},
      vertexShader: DEPTH_VERTEX,
      fragmentShader: DEPTH_FRAGMENT,
      side: THREE.FrontSide,
    });

    this.sunCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 100);
    this.sunMatrix = new THREE.Matrix4();
    this.shadowTarget = null;
    this.sceneTarget = null;
    this.composer = null;
    this.rayPass = null;
    this.bloomPass = null;
    this.gradePass = null;

    // The main camera has to see both layers; the sun's camera never does.
    this.camera.layers.enable(TRANSLUCENT_LAYER);

    this.timings = { shadowMs: 0, sceneMs: 0, postMs: 0, frames: 0 };
    this.apply(mode);
  }

  /* ------------------------------------------------------------------ */
  /* quality                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * Switch modes: recompile the materials, resize or drop the targets, and
   * rebuild the chain. Cheap enough to do on a keypress and not once a frame.
   */
  apply(mode) {
    const settings = qualitySettings(mode);
    this.settings = settings;
    const preset = SKY_PRESETS[settings.preset];

    this.opaqueMaterial.defines = blockDefines(settings, { cutout: true });
    this.opaqueMaterial.needsUpdate = true;
    this.transparentMaterial.defines = blockDefines(settings, { cutout: false });
    this.transparentMaterial.needsUpdate = true;
    this.depthMaterial.defines = depthDefines(settings);
    this.depthMaterial.needsUpdate = true;

    this.shared.fogColor.value.setHex(preset.fog);
    this.shared.fogNear.value = this.baseFogNear * preset.fogNearScale;
    this.shared.fogFar.value = this.baseFogFar * preset.fogFarScale;
    this.shared.sunColor.value.setHex(preset.sun);
    this.shared.ambientColor.value.setHex(preset.ambient);
    this.shared.ambientLevel.value = preset.ambientLevel;
    this.shared.sunStrength.value = preset.sunStrength;
    this.shared.emissiveBoost.value = settings.post ? 2.6 : 1;
    this.shared.skyTop.value.setHex(preset.top);
    this.shared.skyHorizon.value.setHex(preset.horizon);
    this.shared.cloudDepth.value = settings.cloudShadows ? 0.5 : 0;
    this.shared.windStrength.value = settings.wind ? 1 : 0;

    this.timings.shadowMs = 0;
    this.timings.sceneMs = 0;
    this.timings.postMs = 0;
    this.timings.frames = 0;
    this.scene.background = this.skyFor(settings.preset);
    this.setShadowSize(settings.shadowMap);
    this.buildChain();
  }

  /** The sky texture for a preset, painted once and kept. */
  skyFor(name) {
    const existing = this.skies.get(name);
    if (existing !== undefined) return existing;
    const canvas = paintSky(SKY_PRESETS[name], this.sun, (width, height) => {
      const element = document.createElement("canvas");
      element.width = width;
      element.height = height;
      return element;
    }, { clouds: name !== "day", disc: name !== "day" });
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.needsUpdate = true;
    this.skies.set(name, texture);
    return texture;
  }

  setShadowSize(size) {
    if (size === 0) {
      this.shadowTarget?.dispose();
      this.shadowTarget?.depthTexture?.dispose();
      this.shadowTarget = null;
      this.shared.shadowMap.value = null;
      return;
    }
    if (this.shadowTarget !== null && this.shadowTarget.width === size) return;
    this.shadowTarget?.dispose();
    const target = new THREE.WebGLRenderTarget(size, size, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      stencilBuffer: false,
    });
    target.texture.generateMipmaps = false;
    const depth = new THREE.DepthTexture(size, size, THREE.UnsignedIntType);
    depth.format = THREE.DepthFormat;
    depth.minFilter = THREE.NearestFilter;
    depth.magFilter = THREE.NearestFilter;
    target.depthTexture = depth;
    this.shadowTarget = target;
    this.shared.shadowMap.value = depth;
    this.shared.shadowTexel.value.set(1 / size, 1 / size);
  }

  /**
   * Build (or tear down) the HDR target and the post chain.
   *
   * The god-ray pass reads the scene straight out of `sceneTarget` rather than
   * out of the composer's read buffer — `textureID` is pointed at a uniform
   * that does not exist, which stops `ShaderPass` overwriting `tDiffuse` — so
   * the chain never has to care which of its two buffers is current.
   */
  buildChain() {
    if (!this.settings.post) {
      this.disposeChain();
      return;
    }
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    if (this.sceneTarget === null) {
      const target = new THREE.WebGLRenderTarget(size.x, size.y, {
        type: THREE.HalfFloatType,
        depthBuffer: true,
        stencilBuffer: false,
      });
      target.texture.minFilter = THREE.LinearFilter;
      target.texture.magFilter = THREE.LinearFilter;
      const depth = new THREE.DepthTexture(size.x, size.y, THREE.UnsignedIntType);
      depth.format = THREE.DepthFormat;
      depth.minFilter = THREE.NearestFilter;
      depth.magFilter = THREE.NearestFilter;
      target.depthTexture = depth;
      this.sceneTarget = target;
    }

    for (const pass of this.composer?.passes ?? []) pass.dispose?.();
    this.composer?.dispose();
    // `EffectComposer` sizes itself from the renderer and applies the pixel
    // ratio on top; `size` here is already in device pixels, so it is only
    // ever handed to things that want device pixels (the scene target, the
    // bloom's mip chain) and never back to `composer.setSize`.
    const composer = new EffectComposer(this.renderer);

    // The second argument is the uniform `ShaderPass` would point at the read
    // buffer; naming one that does not exist is what leaves `tDiffuse` bound
    // to the scene target instead. See the note on `buildChain`.
    const rays = new ShaderPass(
      { ...GOD_RAYS_SHADER, defines: { RAY_SAMPLES: this.settings.rays } },
      "tSceneAlreadyBound",
    );
    rays.uniforms.tDiffuse.value = this.sceneTarget.texture;
    rays.uniforms.tDepth.value = this.sceneTarget.depthTexture;
    rays.uniforms.sunPosition.value = new THREE.Vector2(0.5, 0.7);
    rays.uniforms.rayColor.value = new THREE.Color(SKY_PRESETS[this.settings.preset].sun);
    rays.uniforms.exposure.value = 0.62;
    composer.addPass(rays);

    const bloom = new UnrealBloomPass(
      new THREE.Vector2(size.x, size.y),
      this.settings.bloom,
      0.62,
      // Above white: at 0.9 every sun-facing birch trunk bloomed like a
      // lantern (tuned live on the pirate isle, 2026-08-17). At 1.25 only
      // true emissives — pushed to 2.6× — and the hottest sunlit rims cross.
      1.25,
    );
    composer.addPass(bloom);

    const grade = new ShaderPass(GRADE_SHADER);
    grade.uniforms.shadowTint.value = new THREE.Vector3(0.94, 0.98, 1.08);
    grade.uniforms.highlightTint.value = new THREE.Vector3(1.06, 1.0, 0.92);
    grade.renderToScreen = true;
    composer.addPass(grade);

    this.composer = composer;
    this.rayPass = rays;
    this.bloomPass = bloom;
    this.gradePass = grade;
  }

  disposeChain() {
    // The composer disposes its own two buffers and nothing else, so the
    // passes — the bloom's whole mip chain among them — are freed here. `U` is
    // a key a visitor can lean on.
    for (const pass of this.composer?.passes ?? []) pass.dispose?.();
    this.composer?.dispose();
    this.composer = null;
    this.rayPass = null;
    this.bloomPass = null;
    this.gradePass = null;
    this.sceneTarget?.dispose();
    this.sceneTarget?.depthTexture?.dispose();
    this.sceneTarget = null;
  }

  /** `width`/`height` are CSS pixels: the two consumers want different units. */
  resize(width, height) {
    if (!this.settings.post) return;
    const ratio = this.renderer.getPixelRatio();
    // The scene target is a real framebuffer, so it wants device pixels — and
    // resizing it carries its own depth texture along (three does that
    // internally), so the god-ray pass keeps sampling the right one.
    this.sceneTarget?.setSize(
      Math.max(1, Math.floor(width * ratio)),
      Math.max(1, Math.floor(height * ratio)),
    );
    // The composer, by contrast, applies the pixel ratio itself.
    this.composer?.setSize(width, height);
  }

  /* ------------------------------------------------------------------ */
  /* the frame                                                           */
  /* ------------------------------------------------------------------ */

  /** Uniforms that change every frame: the clock, the sun, the drift. */
  update(seconds) {
    this.shared.time.value = seconds;
    if (!this.settings.post) return;
    // The camera was moved by the controller a moment ago and its inverse is
    // still last frame's until something renders; the sun's screen position is
    // projected through it, so it is brought forward here rather than lagging
    // a frame behind every turn of the head.
    this.camera.updateMatrixWorld();
    this.shared.cloudOffset.value.set(
      (seconds * CLOUD_DRIFT) / CLOUD_EXTENT,
      (seconds * CLOUD_DRIFT * 0.4) / CLOUD_EXTENT,
    );
    this.updateSunCamera();
    this.updateRays();
  }

  /** Follow the player with the cascade, and snap it to its own texels. */
  updateSunCamera() {
    if (this.shadowTarget === null) return;
    const radius = this.settings.shadowRadius;
    const fit = fitSunCamera({
      center: this.camera.position,
      radius,
      sun: this.sun,
      mapSize: this.settings.shadowMap,
    });
    const camera = this.sunCamera;
    camera.left = -fit.halfExtent;
    camera.right = fit.halfExtent;
    camera.top = fit.halfExtent;
    camera.bottom = -fit.halfExtent;
    camera.near = fit.near;
    camera.far = fit.far;
    camera.position.set(fit.eye.x, fit.eye.y, fit.eye.z);
    camera.up.set(fit.up.x, fit.up.y, fit.up.z);
    camera.lookAt(fit.target.x, fit.target.y, fit.target.z);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    this.sunMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.shared.sunMatrix.value = this.sunMatrix;
    // The depth range is linear under an orthographic camera, so a bias in
    // world units converts by division and stays honest at every map size.
    this.shared.shadowBias.value = 0.06 / (fit.far - fit.near);
    this.shared.shadowNormalOffset.value = fit.texel * 1.8;
  }

  /**
   * Where the sun is on the screen, and whether the rays may be drawn at all.
   *
   * A radial blur around a point behind the camera smears the wrong way, so
   * visibility is faded out by the angle between the view and the sun long
   * before it reaches the edge of the frame.
   */
  updateRays() {
    if (this.rayPass === null) return;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const facing = forward.dot(this.sun);
    const projected = this.sun.clone().multiplyScalar(900).add(this.camera.position).project(this.camera);
    this.rayPass.uniforms.sunPosition.value.set(projected.x * 0.5 + 0.5, projected.y * 0.5 + 0.5);
    this.rayPass.uniforms.aspect.value = this.camera.aspect;
    this.rayPass.uniforms.visibility.value = facing <= 0 ? 0 : smoothstep(0.05, 0.55, facing);
  }

  /** Draw. Returns nothing; the timings land on `this.timings`. */
  render() {
    const settings = this.settings;
    if (!settings.post) {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.shadowTarget !== null) {
      const started = performance.now();
      const background = this.scene.background;
      this.scene.background = null;
      this.scene.overrideMaterial = this.depthMaterial;
      this.renderer.setRenderTarget(this.shadowTarget);
      this.renderer.clear(true, true, false);
      this.renderer.render(this.scene, this.sunCamera);
      this.scene.overrideMaterial = null;
      this.scene.background = background;
      this.timings.shadowMs += performance.now() - started;
    }

    const sceneStart = performance.now();
    this.renderer.setRenderTarget(this.sceneTarget);
    this.renderer.clear(true, true, false);
    this.renderer.render(this.scene, this.camera);
    this.timings.sceneMs += performance.now() - sceneStart;

    const postStart = performance.now();
    this.renderer.setRenderTarget(null);
    this.composer.render();
    this.timings.postMs += performance.now() - postStart;
    this.timings.frames++;
  }
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** The cloud field as a repeating single-channel texture. */
function buildCloudTexture() {
  const field = cloudField({ size: 256 });
  const texture = new THREE.DataTexture(
    field.data,
    field.size,
    field.size,
    THREE.RedFormat,
    THREE.UnsignedByteType,
  );
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}
