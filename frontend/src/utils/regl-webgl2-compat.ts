/**
 * Compatibility layer to make regl work with WebGL2.
 * See https://github.com/regl-project/regl/issues/561
 *
 * REGL is a WebGL1 library. When given a WebGL2 context it doesn't know
 * about sized internal formats, natively-promoted extensions, or the
 * LUMINANCE→RED format change for float textures. This module patches a
 * WebGL2 context so REGL can use it transparently.
 */


const GL_DEPTH_COMPONENT = 0x1902;
const GL_DEPTH_STENCIL = 0x84f9;
const GL_LUMINANCE = 0x1909;
const GL_LUMINANCE_ALPHA = 0x190a;
const HALF_FLOAT_OES = 0x8d61;

const VERSION_PROPERTY = "___regl_gl_version___";

/** WebGL1 extensions natively supported by WebGL2. */
const gl2Extensions: Record<string, Record<string, number>> = {
  WEBGL_depth_texture: { UNSIGNED_INT_24_8_WEBGL: 0x84fa },
  OES_element_index_uint: {},
  OES_texture_float: {},
  OES_texture_half_float: { HALF_FLOAT_OES },
  EXT_color_buffer_float: {},
  OES_standard_derivatives: {},
  EXT_frag_depth: {},
  EXT_blend_minmax: { MIN_EXT: 0x8007, MAX_EXT: 0x8008 },
  EXT_shader_texture_lod: {},
};

// ---------------------------------------------------------------------------
// Format / type helpers
// ---------------------------------------------------------------------------

/**
 * Map WebGL1 unsized internal-format + type to a WebGL2 sized internal format.
 * Extended beyond the original shim to handle LUMINANCE and LUMINANCE_ALPHA
 * which have no float-capable unsized equivalent in WebGL2.
 */
function getInternalFormat(
  gl: WebGL2RenderingContext,
  format: number,
  type: number,
): number {
  if (format === GL_DEPTH_COMPONENT) return gl.DEPTH_COMPONENT24;
  if (format === GL_DEPTH_STENCIL) return gl.DEPTH24_STENCIL8;

  if (type === gl.FLOAT) {
    if (format === gl.RGBA) return gl.RGBA32F;
    if (format === gl.RGB) return gl.RGB32F;
    if (format === GL_LUMINANCE) return gl.R32F;
    if (format === GL_LUMINANCE_ALPHA) return gl.RG32F;
  }

  if (type === HALF_FLOAT_OES) {
    if (format === gl.RGBA) return gl.RGBA16F;
    if (format === gl.RGB) return gl.RGB16F;
    if (format === GL_LUMINANCE) return gl.R16F;
    if (format === GL_LUMINANCE_ALPHA) return gl.RG16F;
  }

  return format;
}

/** Convert the WebGL1 half-float constant to the WebGL2 one. */
function getTextureType(
  gl: WebGL2RenderingContext,
  type: number,
): number {
  if (type === HALF_FLOAT_OES) return gl.HALF_FLOAT;
  return type;
}

/**
 * When the internal format was promoted to R32F / RG32F (from LUMINANCE /
 * LUMINANCE_ALPHA), the *pixel* format must change too: WebGL2 does not
 * accept LUMINANCE as a pixel-transfer format for an R32F texture.
 */
function getPixelFormat(
  gl: WebGL2RenderingContext,
  format: number,
  type: number,
): number {
  if (type === gl.FLOAT || type === HALF_FLOAT_OES) {
    if (format === GL_LUMINANCE) return gl.RED;
    if (format === GL_LUMINANCE_ALPHA) return gl.RG;
  }
  return format;
}

// ---------------------------------------------------------------------------
// Context wrapper
// ---------------------------------------------------------------------------

function wrapGLContext(
  gl: WebGL2RenderingContext,
  extensions: Record<string, unknown>,
): WebGL2RenderingContext {
  (gl as Record<string, unknown>)[VERSION_PROPERTY] = 2;

  for (const name in gl2Extensions) {
    extensions[name.toLowerCase()] = gl2Extensions[name];
  }

  // Activate so float render-targets work.
  gl.getExtension("EXT_color_buffer_float");

  // -- getExtension ----------------------------------------------------------
  const origGetExtension = gl.getExtension.bind(gl);
  (gl as Record<string, unknown>).getExtension = (name: string) =>
    extensions[name.toLowerCase()] ?? origGetExtension(name);

  // -- texImage2D ------------------------------------------------------------
  const origTexImage2D = gl.texImage2D.bind(gl);
  (gl as Record<string, unknown>).texImage2D = function (
    target: number,
    level: number,
    iformat: number,
    a: number,
    b: number,
    c: unknown,
    d?: number,
    e?: number,
    f?: unknown,
  ) {
    if (arguments.length === 6) {
      // 6-arg form: (target, level, iformat, format, type, source)
      const fmt = a;
      const type = b;
      origTexImage2D(
        target,
        level,
        getInternalFormat(gl, iformat, type),
        getPixelFormat(gl, fmt, type),
        getTextureType(gl, type),
        c as TexImageSource,
      );
    } else {
      // 9-arg form: (target, level, iformat, w, h, border, format, type, data)
      const fmt = d!;
      const type = e!;
      origTexImage2D(
        target,
        level,
        getInternalFormat(gl, iformat, type),
        a,
        b,
        c as number,
        getPixelFormat(gl, fmt, type),
        getTextureType(gl, type),
        f as ArrayBufferView | null,
      );
    }
  };

  // -- texSubImage2D ---------------------------------------------------------
  // REGL uses texSubImage2D for same-size texture updates. The format/type
  // must match what texImage2D created (e.g. RED+FLOAT for an R32F texture).
  const origTexSubImage2D = gl.texSubImage2D.bind(gl);
  (gl as Record<string, unknown>).texSubImage2D = function (
    target: number,
    level: number,
    xoff: number,
    yoff: number,
    a: number,
    b: number,
    c: unknown,
    d?: number,
    e?: unknown,
  ) {
    if (arguments.length === 7) {
      // 7-arg: (target, level, x, y, format, type, source)
      const fmt = a;
      const type = b;
      origTexSubImage2D(
        target,
        level,
        xoff,
        yoff,
        getPixelFormat(gl, fmt, type),
        getTextureType(gl, type),
        c as TexImageSource,
      );
    } else {
      // 9-arg: (target, level, x, y, w, h, format, type, data)
      const fmt = c as number;
      const type = d!;
      origTexSubImage2D(
        target,
        level,
        xoff,
        yoff,
        a,
        b,
        getPixelFormat(gl, fmt, type),
        getTextureType(gl, type),
        e as ArrayBufferView | null,
      );
    }
  };

  // -- draw buffers ----------------------------------------------------------
  extensions["webgl_draw_buffers"] = {
    drawBuffersWEBGL: (buffers: GLenum[]) => gl.drawBuffers(buffers),
  };

  // -- VAO -------------------------------------------------------------------
  extensions["oes_vertex_array_object"] = {
    VERTEX_ARRAY_BINDING_OES: 0x85b5,
    createVertexArrayOES: () => gl.createVertexArray(),
    deleteVertexArrayOES: (vao: WebGLVertexArrayObject | null) =>
      gl.deleteVertexArray(vao),
    isVertexArrayOES: (vao: WebGLVertexArrayObject | null) =>
      gl.isVertexArray(vao),
    bindVertexArrayOES: (vao: WebGLVertexArrayObject | null) =>
      gl.bindVertexArray(vao),
  };

  // -- Instancing ------------------------------------------------------------
  extensions["angle_instanced_arrays"] = {
    VERTEX_ATTRIB_ARRAY_DIVISOR_ANGLE: 0x88fe,
    drawArraysInstancedANGLE: (mode: GLenum, first: GLint, count: GLsizei, primcount: GLsizei) =>
      gl.drawArraysInstanced(mode, first, count, primcount),
    drawElementsInstancedANGLE: (mode: GLenum, count: GLsizei, type: GLenum, offset: GLintptr, primcount: GLsizei) =>
      gl.drawElementsInstanced(mode, count, type, offset, primcount),
    vertexAttribDivisorANGLE: (index: GLuint, divisor: GLuint) =>
      gl.vertexAttribDivisor(index, divisor),
  };

  return gl;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Temporarily monkey-patch `HTMLCanvasElement.prototype.getContext` so that
 * REGL's internal `canvas.getContext("webgl", …)` call receives a shimmed
 * WebGL2 context instead.
 *
 * Usage:
 * ```ts
 * const regl = overrideContextType(canvas, () =>
 *   createREGL({ canvas, extensions: ["OES_texture_float"] })
 * );
 * ```
 */
export function overrideContextType<T>(
  canvas: HTMLCanvasElement,
  callback: () => T,
): T {
  const extensions: Record<string, unknown> = {};
  const origGetContext = HTMLCanvasElement.prototype.getContext;

  HTMLCanvasElement.prototype.getContext = function (
    _type: string,
    attrs?: WebGLContextAttributes,
  ) {
    const gl = origGetContext.call(
      this,
      "webgl2",
      attrs,
    ) as WebGL2RenderingContext | null;
    return gl ? wrapGLContext(gl, extensions) : null;
  } as typeof HTMLCanvasElement.prototype.getContext;

  try {
    return callback();
  } finally {
    HTMLCanvasElement.prototype.getContext = origGetContext;
  }
}
