// Pomocné funkcie pre WebGL2 custom layers.

import type { Map as MlMap } from "maplibre-gl";

export function compileProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(`Shader: ${gl.getShaderInfoLog(s)}`);
    }
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, shader(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`Program: ${gl.getProgramInfoLog(p)}`);
  return p;
}

export function uniforms(gl: WebGL2RenderingContext, p: WebGLProgram): Record<string, WebGLUniformLocation> {
  const out: Record<string, WebGLUniformLocation> = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(p, i)!.name;
    out[name] = gl.getUniformLocation(p, name)!;
  }
  return out;
}

/** VAO s obdĺžnikom cez celý clip space (atribút 0 = a_pos v rozsahu 0–1) */
export function createQuadVao(gl: WebGL2RenderingContext): WebGLVertexArrayObject {
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return vao;
}

/** MapLibre môže nechať nastavené flip/premultiply – pred nahrávaním dát vynulovať */
export function resetUnpack(gl: WebGL2RenderingContext) {
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
}

export function createTexture(
  gl: WebGL2RenderingContext,
  filter: number,
  internalFormat: number,
  width: number,
  height: number,
  format: number,
  type: number,
  data: ArrayBufferView | null,
): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  resetUnpack(gl);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, data);
  return t;
}

/**
 * Výrez mapy v súradniciach Web Mercator (0–1): [xLeft, yTop, xRight, yBottom].
 * Platí pre mapu bez rotácie a náklonu (tie sú vypnuté).
 */
export function viewportMercator(map: MlMap): [number, number, number, number] {
  const c = map.getCanvas();
  const tl = map.unproject([0, 0]);
  const br = map.unproject([c.clientWidth, c.clientHeight]);
  const mx = (lng: number) => (lng + 180) / 360;
  const my = (lat: number) => {
    const s = Math.sin((lat * Math.PI) / 180);
    return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  };
  return [mx(tl.lng), my(tl.lat), mx(br.lng), my(br.lat)];
}

/**
 * GLSL: prevod pozície na obrazovke (uv 0–1, počiatok vľavo dole) na lon/lat.
 * u_merc = [xLeft, yTop, xRight, yBottom].
 */
export const GLSL_SCREEN_TO_LONLAT = /* glsl */ `
const float PI = 3.141592653589793;
uniform vec4 u_merc;
vec2 screenToLonLat(vec2 uv) {
  float mx = mix(u_merc.x, u_merc.z, uv.x);
  float my = mix(u_merc.w, u_merc.y, uv.y);
  float lon = mx * 360.0 - 180.0;
  lon = mod(lon + 180.0, 360.0) - 180.0;
  float lat = degrees(atan(sinh(PI * (1.0 - 2.0 * my))));
  return vec2(lon, lat);
}`;

/**
 * GLSL: lon/lat → súradnica textúry poľa (stredy buniek = stredy texelov); mimo mriežky < 0.
 * u_grid = [lon0, lat0, lonSpan, latSpan], u_gridSize = [nx, ny].
 */
export const GLSL_LONLAT_TO_TEX = /* glsl */ `
uniform vec4 u_grid;
uniform vec2 u_gridSize;
vec2 lonLatToTex(vec2 ll) {
  vec2 g = (ll - u_grid.xy) / u_grid.zw;
  if (g.x < 0.0 || g.y < 0.0 || g.x > 1.0 || g.y > 1.0) return vec2(-1.0);
  return (g * (u_gridSize - 1.0) + 0.5) / u_gridSize;
}`;
