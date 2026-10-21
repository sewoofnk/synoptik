// WebGL vrstva farebného poľa. Hodnoty sa nahrajú ako R16F textúra už normalizované
// do pozície v škále (0–1), farba sa berie z LUT textúry (256 farieb).

import type { CustomLayerInterface, Map as MlMap } from "maplibre-gl";
import { buildLut, scalePosition, type ColorScale } from "../config/colorscales";
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

const VS = /* glsl */ `#version 300 es
layout(location = 0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos;
  gl_Position = vec4(a_pos * 2.0 - 1.0, 0.0, 1.0);
}`;

const FS = /* glsl */ `#version 300 es
precision highp float;
${GLSL_SCREEN_TO_LONLAT}
${GLSL_LONLAT_TO_TEX}
uniform sampler2D u_data;
uniform sampler2D u_lut;
uniform float u_opacity;
in vec2 v_uv;
out vec4 fragColor;
void main() {
  vec2 tc = lonLatToTex(screenToLonLat(v_uv));
  if (tc.x < 0.0) discard;
  float pos = texture(u_data, tc).r;
  if (isnan(pos)) discard;
  vec4 c = texture(u_lut, vec2(clamp(pos, 0.0, 1.0) * (255.0 / 256.0) + 0.5 / 256.0, 0.5));
  float a = c.a * u_opacity;
  fragColor = vec4(c.rgb * a, a);
}`;

export class FieldLayer implements CustomLayerInterface {
  readonly id: string;
  readonly type = "custom" as const;
  readonly renderingMode = "2d" as const;

  private map: MlMap | null = null;
  private program: WebGLProgram | null = null;
  private u: Record<string, WebGLUniformLocation> = {};
  private vao: WebGLVertexArrayObject | null = null;
  private dataTex: WebGLTexture | null = null;
  private lutTex: WebGLTexture | null = null;
  private field: Field | null = null;
  private scale: ColorScale | null = null;
  private dirtyData = false;
  private dirtyLut = false;
  opacity = 0.85;

  constructor(id: string) {
    this.id = id;
  }

  /** Nastaví pole a škálu; nahratie do GPU prebehne pri najbližšom vykreslení */
  setField(field: Field | null, scale: ColorScale) {
    if (field !== this.field || scale !== this.scale) this.dirtyData = true;
    if (scale !== this.scale) this.dirtyLut = true;
    this.field = field;
    this.scale = scale;
    this.map?.triggerRepaint();
  }

  onAdd(map: MlMap, gl: WebGL2RenderingContext) {
    this.map = map;
    this.program = compileProgram(gl, VS, FS);
    this.u = uniforms(gl, this.program);
    this.vao = createQuadVao(gl);
    this.dirtyData = this.dirtyLut = true;
  }

  onRemove(_map: MlMap, gl: WebGL2RenderingContext) {
    gl.deleteProgram(this.program);
    gl.deleteVertexArray(this.vao);
    gl.deleteTexture(this.dataTex);
    gl.deleteTexture(this.lutTex);
    this.dataTex = this.lutTex = null;
    this.map = null;
  }

  private upload(gl: WebGL2RenderingContext) {
    const { field, scale } = this;
    if (!field || !scale) return;
    if (this.dirtyLut) {
      gl.deleteTexture(this.lutTex);
      this.lutTex = createTexture(gl, gl.LINEAR, gl.RGBA8, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, buildLut(scale));
      this.dirtyLut = false;
    }
    if (this.dirtyData) {
      const pos = new Float32Array(field.data.length);
      for (let i = 0; i < pos.length; i++) pos[i] = scalePosition(scale, field.data[i]!);
      const { nx, ny } = field.grid;
      if (this.dataTex) {
        gl.bindTexture(gl.TEXTURE_2D, this.dataTex);
        resetUnpack(gl);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, nx, ny, 0, gl.RED, gl.FLOAT, pos);
      } else {
        this.dataTex = createTexture(gl, gl.LINEAR, gl.R16F, nx, ny, gl.RED, gl.FLOAT, pos);
      }
      this.dirtyData = false;
    }
  }

  render(gl: WebGL2RenderingContext) {
    if (!this.map || !this.field || !this.scale || !this.program) return;
    this.upload(gl);
    if (!this.dataTex || !this.lutTex) return;
    const g = this.field.grid;

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.dataTex);
    gl.uniform1i(this.u.u_data!, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.lutTex);
    gl.uniform1i(this.u.u_lut!, 1);

    gl.uniform4fv(this.u.u_merc!, viewportMercator(this.map));
    gl.uniform4f(this.u.u_grid!, g.lon0, g.lat0, (g.nx - 1) * g.dlon, (g.ny - 1) * g.dlat);
    gl.uniform2f(this.u.u_gridSize!, g.nx, g.ny);
    gl.uniform1f(this.u.u_opacity!, this.opacity);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }
}
