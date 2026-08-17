/**
 * Every line of GLSL the viewer owns.
 *
 * Five programs, and they are here rather than next to the code that compiles
 * them for one reason: a shader is the one part of this project no node test
 * can run, so the least it can do is sit in a file you can read end to end. The
 * page's job is then reduced to handing them uniforms — and `blockUniforms`
 * below is the single source of what those are, so a typo in a name is a test
 * failure rather than a silently black world.
 *
 * ## The layers, in the order a fragment meets them
 *
 * 1. **The atlas wrap.** Unchanged from the flat viewer, and still the reason
 *    this shader is hand-written: `fract(uv)` inside a cell needs explicit
 *    gradients or every tile seam fetches the coarsest mip. See `atlas.js`.
 * 2. **The baked term.** `acolor` already carries tint × face shade × AO, and
 *    it stays the ambient base — an unlit face keeps most of the old read.
 * 3. **The sun.** A geometric normal recovered from the derivatives of the
 *    world position (the mesher emits no normals, and for flat quads the
 *    derivative *is* the normal), a lambert term, and a PCF shadow lookup with
 *    the cloud field scrolled through it.
 * 4. **Water,** which replaces its own colour outright: fresnel between the
 *    deep tone and the sky, a Blinn-Phong glint, and more opacity at grazing
 *    angles.
 * 5. **Fog,** warm on the sun's side of the sky and cool away from it.
 *
 * ## The defines
 *
 * `LIT`, `SHADOWS`, `SOFT_SHADOWS`, `CLOUD_SHADOWS`, `WIND`, `WATER_FX`,
 * `CUTOUT`, `LINEAR_OUTPUT`. With none of them set the program is the one the
 * viewer shipped with, which is what `?quality=off` compiles.
 */

/* -------------------------------------------------------------------------- */
/* shared vertex animation                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Wind and swell, in world space.
 *
 * The JS twin of both functions is `wave.js`; keep them spelling the same
 * constants. Two rules hold the geometry together:
 *
 * - **Leaves and water displace as continuous functions of world position,**
 *   so two quads meeting at an edge agree on where that edge went and nothing
 *   tears.
 * - **A plant displaces by the phase of its own cell** (`floor(xz) + 0.5`),
 *   not of the vertex, so both crossed quads of one plant lean together
 *   instead of shearing apart.
 *
 * The depth material animates with this same chunk, or every shadow would be
 * cast by a world standing perfectly still.
 */
export const ANIM_GLSL = /* glsl */ `
  uniform float time;
  uniform float windStrength;

  float waterHeight(vec2 p, float t) {
    return 0.045 * sin(p.x * 0.55 + t * 1.1) + 0.030 * sin(p.y * 0.73 - p.x * 0.21 + t * 0.77);
  }

  vec2 plantSway(vec2 p, float t) {
    float phase = p.x * 0.28 + p.y * 0.19;
    float gust = 0.5 + 0.5 * sin(phase * 0.35 + t * 0.21);
    float swing = sin(phase + t * 1.7) + 0.35 * sin(phase * 2.3 + t * 3.1);
    float amount = 0.55 + 0.75 * gust;
    return vec2(swing * 0.09 * amount, swing * 0.05 * amount);
  }

  vec3 animateWorld(vec3 world, int flags, float texV) {
    vec3 moved = world;
    #ifdef WIND
      if ((flags & 4) != 0) {
        // v is 1 at the ground and 0 at the tip (see mesher.emitCross), so the
        // tip leans and the root does not.
        float lean = clamp(1.0 - texV, 0.0, 1.0);
        vec2 cell = floor(world.xz) + 0.5;
        moved.xz += plantSway(cell, time) * windStrength * lean * lean;
      } else if ((flags & 2) != 0) {
        vec2 rustle = plantSway(world.xz * 0.5, time) * windStrength * 0.22;
        moved.xz += rustle;
        moved.y += rustle.x * 0.35;
      }
    #endif
    #ifdef WATER_FX
      if ((flags & 8) != 0) moved.y += waterHeight(world.xz, time);
    #endif
    return moved;
  }
`;

/* -------------------------------------------------------------------------- */
/* the block program                                                           */
/* -------------------------------------------------------------------------- */

export const BLOCK_VERTEX = /* glsl */ `
  attribute vec3 acolor;
  attribute vec4 cell;
  attribute float aflags;

  varying vec2 vUv;
  varying vec4 vCell;
  varying vec3 vColor;
  varying vec3 vWorld;
  varying float vFlags;
  varying float vDepth;

${ANIM_GLSL}

  void main() {
    vUv = uv;
    vCell = cell;
    vColor = acolor;
    vFlags = aflags;
    vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
    world = animateWorld(world, int(aflags + 0.5), uv.y);
    vWorld = world;
    vec4 view = viewMatrix * vec4(world, 1.0);
    vDepth = -view.z;
    gl_Position = projectionMatrix * view;
  }
`;

export const BLOCK_FRAGMENT = /* glsl */ `
  precision highp float;

  // GLSL3 has no gl_FragColor; three's colorspace include still writes to
  // that name, so alias it to a declared out — three's own idiom. Found on
  // first GPU compile (the one thing no node test can check).
  layout(location = 0) out highp vec4 pc_fragColor;
  #define gl_FragColor pc_fragColor

  uniform sampler2D map;
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;
  uniform float opacity;
  uniform vec3 sunDirection;
  uniform vec3 sunColor;
  uniform vec3 ambientColor;
  uniform float ambientLevel;
  uniform float sunStrength;
  uniform float emissiveBoost;
  uniform vec3 skyTop;
  uniform vec3 skyHorizon;
  uniform vec3 waterDeep;
  uniform sampler2D shadowMap;
  uniform mat4 sunMatrix;
  uniform vec2 shadowTexel;
  uniform float shadowBias;
  uniform float shadowNormalOffset;
  uniform sampler2D cloudMap;
  uniform vec2 cloudOffset;
  uniform float cloudScale;
  uniform float cloudDepth;

  varying vec2 vUv;
  varying vec4 vCell;
  varying vec3 vColor;
  varying vec3 vWorld;
  varying float vFlags;
  varying float vDepth;

  vec3 srgbToLinear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
  }

  #ifdef LIT
    /** The sky, as the water reflects it and the fog borrows from it. */
    vec3 skyAt(vec3 dir) {
      float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
      vec3 base = mix(skyHorizon, skyTop, pow(h, 0.7));
      float glow = pow(max(dot(dir, sunDirection), 0.0), 8.0);
      return base + sunColor * glow * 0.6;
    }
  #endif

  #ifdef SHADOWS
    float shadowTap(vec3 coord, vec2 offset, float bias) {
      float depth = texture(shadowMap, coord.xy + offset * shadowTexel).r;
      return coord.z - bias > depth ? 0.0 : 1.0;
    }

    /**
     * How much sun reaches this fragment, 0 to 1.
     *
     * The receiver is pushed along its own normal before the lookup: with one
     * cascade over a whole view radius a texel is a fraction of a block wide,
     * and a constant depth bias alone either peters (acne on every flat roof)
     * or overshoots (a shadow that starts a foot away from the thing casting
     * it). The normal offset is what buys both at once.
     */
    float sunlightAt(vec3 world, vec3 normal, float ndl) {
      vec4 projected = sunMatrix * vec4(world + normal * shadowNormalOffset, 1.0);
      vec3 coord = projected.xyz / projected.w * 0.5 + 0.5;
      // Outside the cascade there is no information, and "no information" must
      // read as lit — the fog has the horizon by then anyway.
      if (coord.x < 0.0 || coord.x > 1.0 || coord.y < 0.0 || coord.y > 1.0 || coord.z > 1.0) {
        return 1.0;
      }
      float bias = shadowBias * (1.0 + (1.0 - ndl) * 2.0);
      float sum = 0.0;
      #ifdef SOFT_SHADOWS
        for (int j = -1; j <= 1; j++) {
          for (int i = -1; i <= 1; i++) {
            sum += shadowTap(coord, vec2(float(i), float(j)), bias);
          }
        }
        sum /= 9.0;
      #else
        sum += shadowTap(coord, vec2(-0.5, -0.5), bias);
        sum += shadowTap(coord, vec2(0.5, -0.5), bias);
        sum += shadowTap(coord, vec2(-0.5, 0.5), bias);
        sum += shadowTap(coord, vec2(0.5, 0.5), bias);
        sum *= 0.25;
      #endif
      // Fade the cascade out at its own edge rather than cutting it.
      vec2 edge = abs(coord.xy - 0.5) * 2.0;
      float inside = 1.0 - smoothstep(0.86, 1.0, max(edge.x, edge.y));
      return mix(1.0, sum, inside);
    }
  #endif

  void main() {
    vec2 wrapped = vCell.xy + fract(vUv) * vCell.zw;
    vec2 ddx = dFdx(vUv) * vCell.zw;
    vec2 ddy = dFdy(vUv) * vCell.zw;
    vec4 texel = textureGrad(map, wrapped, ddx, ddy);
    #ifdef CUTOUT
      if (texel.a < 0.5) discard;
    #endif
    int flags = int(vFlags + 0.5);
    vec3 rgb = srgbToLinear(texel.rgb) * vColor;
    float alpha = texel.a * opacity;
    vec3 fog = fogColor;

    #ifdef LIT
      vec3 view = normalize(cameraPosition - vWorld);
      // No normals come out of the mesher — every face is flat, so the
      // derivative of the world position IS the normal, and it costs two
      // instructions instead of an attribute on every vertex in the world.
      vec3 normal = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
      if (dot(normal, view) < 0.0) normal = -normal;

      bool isEmissive = (flags & 1) != 0;
      bool isWater = (flags & 8) != 0;
      bool isCross = (flags & 4) != 0;

      // A crossed quad's normal is a diagonal that means nothing; plants take
      // the light as a constant so a meadow does not flicker half-dark.
      float ndl = isCross ? 0.72 : max(dot(normal, sunDirection), 0.0);
      float lit = 1.0;
      #ifdef SHADOWS
        lit = sunlightAt(vWorld, isCross ? vec3(0.0, 1.0, 0.0) : normal, ndl);
        if (isCross) lit = mix(1.0, lit, 0.55); // plants receive softly
      #endif
      #ifdef CLOUD_SHADOWS
        float cloud = texture(cloudMap, vWorld.xz * cloudScale + cloudOffset).r;
        lit *= mix(1.0, smoothstep(0.26, 0.68, cloud), cloudDepth);
      #endif

      vec3 light = ambientColor * ambientLevel + sunColor * (sunStrength * ndl * lit);
      rgb *= light;
      if (isEmissive) rgb = srgbToLinear(texel.rgb) * vColor * emissiveBoost;

      #ifdef WATER_FX
        if (isWater) {
          float facing = clamp(dot(normal, view), 0.0, 1.0);
          float fresnel = mix(0.05, 1.0, pow(1.0 - facing, 5.0));
          vec3 reflected = skyAt(reflect(-view, normal));
          vec3 halfway = normalize(sunDirection + view);
          float glint = pow(max(dot(normal, halfway), 0.0), 220.0) * lit;
          rgb = mix(rgb * waterDeep, reflected, fresnel * 0.85) + sunColor * glint * 2.2;
          alpha = clamp(mix(alpha, 0.97, pow(1.0 - facing, 3.0)), 0.0, 1.0);
        }
      #endif

      // The haze belongs to the sun: warm looking into it, cool away from it.
      float toward = max(dot(-view, sunDirection), 0.0);
      fog = mix(fogColor, sunColor * 1.15, pow(toward, 4.0) * 0.6);
    #endif

    rgb = mix(rgb, fog, smoothstep(fogNear, fogFar, vDepth));
    gl_FragColor = vec4(rgb, alpha);
    #ifndef LINEAR_OUTPUT
      #include <colorspace_fragment>
    #endif
  }
`;

/* -------------------------------------------------------------------------- */
/* the shadow-cast program                                                     */
/* -------------------------------------------------------------------------- */

/**
 * What the sun's camera draws.
 *
 * It has to be cutout-aware — a cross plant that casts a solid box shadow is
 * worse than a plant that casts none — and it has to animate identically to
 * the block program, or a swaying meadow throws a still shadow.
 */
export const DEPTH_VERTEX = /* glsl */ `
  attribute vec4 cell;
  attribute float aflags;

  varying vec2 vUv;
  varying vec4 vCell;

${ANIM_GLSL}

  void main() {
    vUv = uv;
    vCell = cell;
    vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
    world = animateWorld(world, int(aflags + 0.5), uv.y);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

export const DEPTH_FRAGMENT = /* glsl */ `
  precision highp float;
  layout(location = 0) out highp vec4 pc_fragColor;

  uniform sampler2D map;
  varying vec2 vUv;
  varying vec4 vCell;

  void main() {
    vec2 wrapped = vCell.xy + fract(vUv) * vCell.zw;
    vec2 ddx = dFdx(vUv) * vCell.zw;
    vec2 ddy = dFdy(vUv) * vCell.zw;
    if (textureGrad(map, wrapped, ddx, ddy).a < 0.5) discard;
    pc_fragColor = vec4(1.0);
  }
`;

/* -------------------------------------------------------------------------- */
/* the post chain                                                              */
/* -------------------------------------------------------------------------- */

/** Every `ShaderPass` shares this one; it is three's own. */
const PASS_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * God rays: the classic screen-space radial blur of an occlusion buffer,
 * except that the occlusion buffer is free.
 *
 * Anything the scene drew has a depth; the sky does not, so `depth == 1` *is*
 * the sky mask, and marching a few samples from the fragment toward the sun's
 * screen position accumulating that mask gives shafts through every gap in the
 * skyline. Sampling the depth we already have, rather than re-rendering the
 * world into a black-and-white target, is the difference between this pass
 * costing a millisecond and costing a frame.
 *
 * `visibility` is set on the CPU: it goes to zero as the sun leaves the screen
 * or slips behind the camera, because a radial blur around a point behind you
 * is a smear pointing the wrong way.
 */
export const GOD_RAYS_SHADER = {
  name: "TerrainistGodRays",
  // `ShaderPass` copies this, and a GLSL1 loop bound must be a constant, so the
  // sample count is a compile-time number and a quality change rebuilds the
  // pass rather than setting a uniform.
  defines: { RAY_SAMPLES: 24 },
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    sunPosition: { value: null },
    rayColor: { value: null },
    exposure: { value: 0.5 },
    decay: { value: 0.96 },
    density: { value: 0.85 },
    weight: { value: 1.0 },
    visibility: { value: 0 },
    aspect: { value: 1 },
  },
  vertexShader: PASS_VERTEX,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform vec2 sunPosition;
    uniform vec3 rayColor;
    uniform float exposure;
    uniform float decay;
    uniform float density;
    uniform float weight;
    uniform float visibility;
    uniform float aspect;
    varying vec2 vUv;

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      if (visibility <= 0.0) {
        gl_FragColor = base;
        return;
      }
      // Not named "step": a variable of that name hides the built-in, and the
      // sky mask below is a call to it.
      vec2 march = (vUv - sunPosition) * (density / float(RAY_SAMPLES));
      vec2 coord = vUv;
      float illumination = 1.0;
      float accumulated = 0.0;
      for (int i = 0; i < RAY_SAMPLES; i++) {
        coord -= march;
        float depth = texture2D(tDepth, clamp(coord, 0.0, 1.0)).x;
        accumulated += step(0.9999, depth) * illumination * weight;
        illumination *= decay;
      }
      accumulated /= float(RAY_SAMPLES);
      // Written as 1 − smoothstep rather than with the edges reversed: GLSL
      // calls smoothstep(e0, e1, x) undefined when e0 > e1, and "works on this
      // driver" is not a thing to ship a landing page on.
      float fromSun = length((vUv - sunPosition) * vec2(aspect, 1.0));
      float falloff = 1.0 - smoothstep(0.1, 1.25, fromSun);
      gl_FragColor = vec4(base.rgb + rayColor * accumulated * exposure * visibility * falloff, base.a);
    }
  `,
};

/**
 * The grade: ACES, a vignette, a little saturation and a split-tone.
 *
 * Last in the chain and the only pass that writes sRGB — everything upstream
 * of it, including the bloom, works in linear light, which is the only way an
 * emissive block brighter than white survives long enough to bloom.
 *
 * The split-tone is deliberately a whisper. Warm highlights and cool shadows
 * is the oldest trick in colour grading and the fastest one to overcook; at
 * this strength it reads as "late afternoon" and at twice it reads as a filter.
 */
export const GRADE_SHADER = {
  name: "TerrainistGrade",
  uniforms: {
    tDiffuse: { value: null },
    exposure: { value: 1.15 },
    saturation: { value: 1.08 },
    vignette: { value: 0.42 },
    shadowTint: { value: null },
    highlightTint: { value: null },
  },
  vertexShader: PASS_VERTEX,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float exposure;
    uniform float saturation;
    uniform float vignette;
    uniform vec3 shadowTint;
    uniform vec3 highlightTint;
    varying vec2 vUv;

    // Narkowicz's fit of the ACES filmic curve: two multiplies and a divide,
    // and it is the reason a sun glint clips to white instead of to magenta.
    vec3 acesFilmic(vec3 x) {
      const float a = 2.51;
      const float b = 0.03;
      const float c = 2.43;
      const float d = 0.59;
      const float e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }

    vec3 linearToSrgb(vec3 c) {
      vec3 low = c * 12.92;
      vec3 high = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
      return mix(low, high, step(vec3(0.0031308), c));
    }

    void main() {
      vec3 color = texture2D(tDiffuse, vUv).rgb * exposure;
      color = acesFilmic(color);

      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luma), color, saturation);
      color *= mix(shadowTint, highlightTint, smoothstep(0.0, 0.85, luma));

      vec2 offset = vUv - 0.5;
      color *= clamp(1.0 - dot(offset, offset) * vignette, 0.0, 1.0);

      gl_FragColor = vec4(linearToSrgb(clamp(color, 0.0, 1.0)), 1.0);
    }
  `,
};

/* -------------------------------------------------------------------------- */
/* uniforms                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Every uniform the block and depth programs declare, as one object.
 *
 * The values are *shared holders*: the page hands the same object to the
 * opaque material, the translucent material and the depth material, so setting
 * `time` once a frame sets it everywhere. `test/viewer.test.js` walks the GLSL
 * for `uniform` declarations and checks this list against them, which is the
 * closest a node test gets to compiling a shader.
 */
export function blockUniforms(overrides = {}) {
  return {
    map: { value: null },
    fogColor: { value: null },
    fogNear: { value: 0 },
    fogFar: { value: 0 },
    opacity: { value: 1 },
    time: { value: 0 },
    windStrength: { value: 1 },
    sunDirection: { value: null },
    sunColor: { value: null },
    ambientColor: { value: null },
    ambientLevel: { value: 1 },
    sunStrength: { value: 0 },
    emissiveBoost: { value: 1 },
    skyTop: { value: null },
    skyHorizon: { value: null },
    waterDeep: { value: null },
    shadowMap: { value: null },
    sunMatrix: { value: null },
    shadowTexel: { value: null },
    shadowBias: { value: 0.0012 },
    shadowNormalOffset: { value: 0.12 },
    cloudMap: { value: null },
    cloudOffset: { value: null },
    cloudScale: { value: 0.0045 },
    cloudDepth: { value: 0.55 },
    ...overrides,
  };
}

/**
 * The defines one block material compiles with, for a quality setting.
 *
 * `off` yields `{ CUTOUT }` and nothing else — the original program, byte for
 * byte, which is the promise the quality switch makes.
 */
export function blockDefines(settings, { cutout = false } = {}) {
  const defines = {};
  if (cutout) defines.CUTOUT = "";
  if (!settings.post) return defines;
  defines.LIT = "";
  defines.LINEAR_OUTPUT = "";
  if (settings.shadowMap > 0) defines.SHADOWS = "";
  if (settings.softShadows) defines.SOFT_SHADOWS = "";
  if (settings.cloudShadows) defines.CLOUD_SHADOWS = "";
  if (settings.wind) defines.WIND = "";
  if (settings.water) defines.WATER_FX = "";
  return defines;
}

/** The defines the depth material needs: the animation half, and only it. */
export function depthDefines(settings) {
  const defines = {};
  if (settings.wind) defines.WIND = "";
  if (settings.water) defines.WATER_FX = "";
  return defines;
}

/** Every `uniform` name declared in a GLSL source. For the tests. */
export function declaredUniforms(source) {
  const names = new Set();
  const pattern = /^\s*uniform\s+\w+\s+(\w+)\s*;/gm;
  let match;
  while ((match = pattern.exec(source)) !== null) names.add(match[1]);
  return names;
}
