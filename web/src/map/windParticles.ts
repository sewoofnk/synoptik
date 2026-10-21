// Častice vetra podľa techniky mapbox/webgl-wind (MIT): pozície častíc v textúre (RGBA8,
// 16 bitov na súradnicu), simulácia aj vykreslenie na GPU, stopy cez stmievanie predošlého snímku.
// Častice žijú v súradniciach obrazovky (0–1), vietor sa vzorkuje v geografickej polohe pixelu.

import type { CustomLayerInterface, Map as MlMap } from "maplibre-gl";
import type { Field } from "../data/fieldLoader";
import {
  compileProgram,
  createQuadVao,
  createTexture,
  GLSL_LONLAT_TO_TEX,
  GLSL_SCREEN_TO_LONLAT,
  resetUnpack,
  uniforms,
  viewportMercator,
} from "./glUtil";

const QUAD_VS = /* glsl */ `#version 300 es
layout(location = 0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos;
  gl_Position = vec4(a_pos * 2.0 - 1.0, 0.0, 1.0);
}`;

// Dekódovanie/kódovanie pozície 0–1 do dvoch bajtov (ako webgl-wind)
const GLSL_POS = /* glsl */ `
vec2 decodePos(vec4 c) { return vec2(c.r / 255.0 + c.b, c.g / 255.0 + c.a); }
vec4 encodePos(vec2 p) { return vec4(fract(p * 255.0), floor(p * 255.0) / 255.0); }`;

const UPDATE_FS = /* glsl */ `#version 300 es
precision highp float;
${GLSL_SCREEN_TO_LONLAT}
${GLSL_LONLAT_TO_TEX}
${GLSL_POS}
uniform sampler2D u_particles;
uniform sampler2D u_wind;
uniform vec2 u_screen;      // veľkosť v pixeloch zariadenia
uniform float u_speedFactor; // px za snímok na 1 m/s
uniform float u_dropRate;
uniform float u_dropRateBump;
uniform float u_seed;
uniform float u_maxSpeed;
in vec2 v_uv;
out vec4 fragColor;

// pseudonáhodné číslo 0–1
const vec3 RAND = vec3(12.9898, 78.233, 4375.85453);
float rand(vec2 co) {
  float t = dot(RAND.xy, co);
  return fract(sin(t) * (RAND.z + t));
}

void main() {
  vec2 pos = decodePos(texture(u_particles, v_uv));
  vec2 seed = (pos + v_uv) * u_seed;
  vec2 tc = lonLatToTex(screenToLonLat(pos));
  vec2 wind = tc.x < 0.0 ? vec2(0.0) : texture(u_wind, tc).rg;
  bool invalid = tc.x < 0.0 || isnan(wind.x) || isnan(wind.y);
  if (invalid) wind = vec2(0.0);
  float speed = length(wind);

  vec2 newPos = pos + wind * u_speedFactor / u_screen;

  // náhodná obnova častíc, aby sa plocha rovnomerne pokryla
  float drop = u_dropRate + clamp(speed / u_maxSpeed, 0.0, 1.0) * u_dropRateBump;
  if (invalid || rand(seed) < drop || newPos.x < 0.0 || newPos.x > 1.0 || newPos.y < 0.0 || newPos.y > 1.0) {
    newPos = vec2(rand(seed + 1.3), rand(seed + 2.1));
  }
  fragColor = encodePos(clamp(newPos, 0.0, 0.9999));
}`;

const DRAW_VS = /* glsl */ `#version 300 es
precision highp float;
${GLSL_POS}
uniform sampler2D u_particles;
uniform float u_res;
uniform float u_pointSize;
void main() {
  float i = float(gl_VertexID);
  vec2 tc = (vec2(mod(i, u_res), floor(i / u_res)) + 0.5) / u_res;
  vec2 pos = decodePos(texture(u_particles, tc));
  gl_PointSize = u_pointSize;
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}`;

const DRAW_FS = /* glsl */ `#version 300 es
precision mediump float;
out vec4 fragColor;
void main() {
  fragColor = vec4(1.0);
}`;

// Stmievanie predošlého snímku; floor zaručí, že stopa úplne zmizne (8-bitové zaokrúhľovanie)
const FADE_FS = /* glsl */ `#version 300 es
precision mediump float;
uniform sampler2D u_screenTex;
uniform float u_fade;
in vec2 v_uv;
out vec4 fragColor;
void main() {
  vec4 c = texture(u_screenTex, v_uv);
  fragColor = floor(255.0 * c * u_fade) / 255.0;
}`;

const COMPOSITE_FS = /* glsl */ `#version 300 es
precision mediump float;
uniform sampler2D u_screenTex;
uniform float u_opacity;
in vec2 v_uv;
out vec4 fragColor;
void main() {
  vec4 c = texture(u_screenTex, v_uv);
  fragColor = c * u_opacity; // textúra je premultiplikovaná (biela × alfa)
}`;

export class WindParticlesLayer implements CustomLayerInterface {
  readonly id: string;
  readonly type = "custom" as const;
  readonly renderingMode = "2d" as const;

  /** Px (CSS) za snímok pri 1 m/s */
  speedFactor = 0.12;
  fade = 0.955;
  opacity = 0.85;
  dropRate = 0.004;
  dropRateBump = 0.01;

  private map: MlMap | null = null;
  private progUpdate!: WebGLProgram;
  private progDraw!: WebGLProgram;
  private progFade!: WebGLProgram;
  private progComposite!: WebGLProgram;
  private uUpdate: Record<string, WebGLUniformLocation> = {};
  private uDraw: Record<string, WebGLUniformLocation> = {};
  private uFade: Record<string, WebGLUniformLocation> = {};
  private uComposite: Record<string, WebGLUniformLocation> = {};
  private vao: WebGLVertexArrayObject | null = null;
  private emptyVao: WebGLVertexArrayObject | null = null;
  private fbo: WebGLFramebuffer | null = null;

  private stateTex: [WebGLTexture, WebGLTexture] | null = null;
  private res = 0;
  private screenTex: [WebGLTexture, WebGLTexture] | null = null;
  private screenSize: [number, number] = [0, 0];
  private windTex: WebGLTexture | null = null;
  private wind: { u: Field; v: Field } | null = null;
  private windDirty = false;
  private clearTrails = true;
  private lastFrame = 0;

  private onMove = () => {
    this.clearTrails = true;
  };

  constructor(id: string) {
    this.id = id;
  }

  setWind(u: Field | null, v: Field | null) {
    this.wind = u && v ? { u, v } : null;
    this.windDirty = true;
    this.map?.triggerRepaint();
  }

  onAdd(map: MlMap, gl: WebGL2RenderingContext) {
    this.map = map;
    this.progUpdate = compileProgram(gl, QUAD_VS, UPDATE_FS);
    this.progDraw = compileProgram(gl, DRAW_VS, DRAW_FS);
    this.progFade = compileProgram(gl, QUAD_VS, FADE_FS);
    this.progComposite = compileProgram(gl, QUAD_VS, COMPOSITE_FS);
    this.uUpdate = uniforms(gl, this.progUpdate);
    this.uDraw = uniforms(gl, this.progDraw);
    this.uFade = uniforms(gl, this.progFade);
    this.uComposite = uniforms(gl, this.progComposite);
    this.vao = createQuadVao(gl);
    this.emptyVao = gl.createVertexArray();
    this.fbo = gl.createFramebuffer();
    this.windDirty = true;
    map.on("move", this.onMove);
    map.on("resize", this.onMove);
  }

  onRemove(map: MlMap, gl: WebGL2RenderingContext) {
    map.off("move", this.onMove);
    map.off("resize", this.onMove);
    [this.progUpdate, this.progDraw, this.progFade, this.progComposite].forEach((p) => gl.deleteProgram(p));
    gl.deleteVertexArray(this.vao);
    gl.deleteVertexArray(this.emptyVao);
    gl.deleteFramebuffer(this.fbo);
    this.stateTex?.forEach((t) => gl.deleteTexture(t));
    this.screenTex?.forEach((t) => gl.deleteTexture(t));
    gl.deleteTexture(this.windTex);
    this.stateTex = this.screenTex = null;
    this.windTex = null;
    this.res = 0;
    this.screenSize = [0, 0];
    this.map = null;
  }

  /** Počet častíc podľa plochy obrazovky (CSS px): ~1 častica na 30 px², max 65 536 */
  private ensureParticles(gl: WebGL2RenderingContext) {
    const c = this.map!.getCanvas();
    const n = Math.min(65536, Math.max(4096, (c.clientWidth * c.clientHeight) / 30));
    const res = Math.ceil(Math.sqrt(n));
    if (res === this.res) return;
    this.stateTex?.forEach((t) => gl.deleteTexture(t));
    const data = new Uint8Array(res * res * 4);
    for (let i = 0; i < data.length; i++) data[i] = Math.floor(Math.random() * 256);
    this.stateTex = [
      createTexture(gl, gl.NEAREST, gl.RGBA8, res, res, gl.RGBA, gl.UNSIGNED_BYTE, data),
      createTexture(gl, gl.NEAREST, gl.RGBA8, res, res, gl.RGBA, gl.UNSIGNED_BYTE, data),
    ];
    this.res = res;
  }

  private ensureScreen(gl: WebGL2RenderingContext) {
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    if (this.screenTex && this.screenSize[0] === w && this.screenSize[1] === h) return;
    this.screenTex?.forEach((t) => gl.deleteTexture(t));
    const empty = new Uint8Array(w * h * 4);
    this.screenTex = [
      createTexture(gl, gl.NEAREST, gl.RGBA8, w, h, gl.RGBA, gl.UNSIGNED_BYTE, empty),
      createTexture(gl, gl.NEAREST, gl.RGBA8, w, h, gl.RGBA, gl.UNSIGNED_BYTE, empty),
    ];
    this.screenSize = [w, h];
  }

  private uploadWind(gl: WebGL2RenderingContext) {
    if (!this.windDirty) return;
    this.windDirty = false;
    if (!this.wind) return;
    const { u, v } = this.wind;
    const { nx, ny } = u.grid;
    const uv = new Float32Array(nx * ny * 2);
    for (let i = 0; i < nx * ny; i++) {
      uv[2 * i] = u.data[i]!;
      uv[2 * i + 1] = v.data[i]!;
    }
    if (this.windTex) {
      gl.bindTexture(gl.TEXTURE_2D, this.windTex);
      resetUnpack(gl);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, nx, ny, 0, gl.RG, gl.FLOAT, uv);
    } else {
      this.windTex = createTexture(gl, gl.LINEAR, gl.RG16F, nx, ny, gl.RG, gl.FLOAT, uv);
    }
  }

  private bindTarget(gl: WebGL2RenderingContext, tex: WebGLTexture, w: number, h: number) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h);
  }

  prerender(gl: WebGL2RenderingContext) {
    if (!this.map || !this.wind) return;
    this.uploadWind(gl);
    this.ensureParticles(gl);
    this.ensureScreen(gl);
    if (!this.windTex || !this.stateTex || !this.screenTex) return;

    const g = this.wind.u.grid;
    const [w, h] = this.screenSize;
    const dpr = w / Math.max(1, this.map.getCanvas().clientWidth);
    // nezávislosť od snímkovej frekvencie (normované na 60 fps, obmedzené pri zaseknutí)
    const now = performance.now();
    const dt = this.lastFrame ? Math.min(3, (now - this.lastFrame) / (1000 / 60)) : 1;
    this.lastFrame = now;

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);

    // 1) stmiť predošlé stopy do screenTex[1] (alebo vyčistiť po pohybe mapy)
    this.bindTarget(gl, this.screenTex[1], w, h);
    if (this.clearTrails) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.clearTrails = false;
    } else {
      gl.useProgram(this.progFade);
      gl.bindVertexArray(this.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.screenTex[0]);
      gl.uniform1i(this.uFade.u_screenTex!, 0);
      gl.uniform1f(this.uFade.u_fade!, this.fade);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    // 2) nakresliť častice na aktuálnych pozíciách
    gl.useProgram(this.progDraw);
    gl.bindVertexArray(this.emptyVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.stateTex[0]);
    gl.uniform1i(this.uDraw.u_particles!, 0);
    gl.uniform1f(this.uDraw.u_res!, this.res);
    gl.uniform1f(this.uDraw.u_pointSize!, Math.max(1, 1.4 * dpr));
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.POINTS, 0, this.res * this.res);
    gl.disable(gl.BLEND);

    // 3) posunúť častice → stateTex[1]
    this.bindTarget(gl, this.stateTex[1], this.res, this.res);
    gl.useProgram(this.progUpdate);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.stateTex[0]);
    gl.uniform1i(this.uUpdate.u_particles!, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.windTex);
    gl.uniform1i(this.uUpdate.u_wind!, 1);
    gl.uniform4fv(this.uUpdate.u_merc!, viewportMercator(this.map));
    gl.uniform4f(this.uUpdate.u_grid!, g.lon0, g.lat0, (g.nx - 1) * g.dlon, (g.ny - 1) * g.dlat);
    gl.uniform2f(this.uUpdate.u_gridSize!, g.nx, g.ny);
    gl.uniform2f(this.uUpdate.u_screen!, w, h);
    gl.uniform1f(this.uUpdate.u_speedFactor!, this.speedFactor * dpr * dt);
    gl.uniform1f(this.uUpdate.u_dropRate!, this.dropRate * dt);
    gl.uniform1f(this.uUpdate.u_dropRateBump!, this.dropRateBump * dt);
    gl.uniform1f(this.uUpdate.u_seed!, Math.random());
    gl.uniform1f(this.uUpdate.u_maxSpeed!, 30);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    this.stateTex.reverse();
    this.screenTex.reverse();

    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  }

  render(gl: WebGL2RenderingContext) {
    if (!this.map || !this.wind || !this.screenTex) return;
    gl.useProgram(this.progComposite);
    gl.bindVertexArray(this.vao);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.screenTex[0]);
    gl.uniform1i(this.uComposite.u_screenTex!, 0);
    gl.uniform1f(this.uComposite.u_opacity!, this.opacity);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
    // nepretržitá animácia
    this.map.triggerRepaint();
  }
}
