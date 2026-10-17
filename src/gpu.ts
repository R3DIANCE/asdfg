import {
  Engine3D,
  Scene3D,
  View3D,
  Camera3D,
  Object3D,
  Sprite,
  SpriteRenderer,
  BitmapTexture2D,
  Color,
  Vector2,
} from "@orillusion/core";

const SHADER = /* wgsl */ `
struct View { size: vec2<f32>, pad: vec2<f32> };
@group(0) @binding(0) var<uniform> view: View;
@group(1) @binding(0) var samp: sampler;
@group(1) @binding(1) var tex: texture_2d<f32>;

struct Inst {
  @location(0) rect: vec4<f32>,   // x, y, w, h in screen px
  @location(1) uv: vec4<f32>,     // u0, v0, u1, v1
  @location(2) color: vec4<f32>,  // premultiplied tint
};
struct VOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32>, @location(1) color: vec4<f32> };

@vertex
fn vs(@builtin(vertex_index) vi: u32, i: Inst) -> VOut {
  var corners = array<vec2<f32>, 6>(vec2(0.,0.), vec2(1.,0.), vec2(0.,1.), vec2(0.,1.), vec2(1.,0.), vec2(1.,1.));
  let c = corners[vi];
  let p = i.rect.xy + c * i.rect.zw;
  var o: VOut;
  o.pos = vec4<f32>(p.x / view.size.x * 2.0 - 1.0, 1.0 - p.y / view.size.y * 2.0, 0.0, 1.0);
  o.uv = mix(i.uv.xy, i.uv.zw, c);
  o.color = i.color;
  return o;
}

@fragment
fn fs(v: VOut) -> @location(0) vec4<f32> {
  return textureSample(tex, samp, v.uv) * v.color;
}
`;

export interface Tex {
  tex?: GPUTexture;
  bind?: GPUBindGroup;
  glTex?: WebGLTexture;
  w: number;
  h: number;
  bitmapTexture?: BitmapTexture2D;
  orillusionSprite?: Sprite;
}

const FLOATS = 12;
const MAX = 16384;

export class Renderer {
  backend: "webgpu" | "webgl" = "webgpu";

  get renderType(): string {
    if (this.backend === "webgpu") return "WebGPU";
    if (this.backend === "webgl") return this.isWebGL2 ? "WebGL2" : "WebGL";
    return "Canvas";
  }

  // WebGPU pipeline
  device!: GPUDevice;
  ctx!: GPUCanvasContext;
  pipeline!: GPURenderPipeline;
  viewBuf!: GPUBuffer;
  viewBind!: GPUBindGroup;
  sampler!: GPUSampler;
  inst!: GPUBuffer;

  // WebGL fallback pipeline
  gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  isWebGL2 = false;
  angleExt: any = null;
  glProgram: WebGLProgram | null = null;
  glCornerBuf: WebGLBuffer | null = null;
  glInstBuf: WebGLBuffer | null = null;
  locCorner = -1;
  locRect = -1;
  locUv = -1;
  locColor = -1;
  locViewSize: WebGLUniformLocation | null = null;
  locTex: WebGLUniformLocation | null = null;

  // Shared state
  data = new Float32Array(MAX * FLOATS);
  private viewData = new Float32Array(4);
  count = 0;
  batches: { tex: Tex; start: number; n: number }[] = [];
  white!: Tex;
  width = 1;
  height = 1;
  scale = 1;
  clear = { r: 0.6, g: 0.8, b: 1, a: 1 };

  // Orillusion 3D Engine objects (available in WebGPU mode)
  engine?: Engine3D;
  scene?: Scene3D;
  view?: View3D;
  camera?: Camera3D;
  spriteContainer?: Object3D;
  activeSpriteRenderers = new Map<Tex, SpriteRenderer>();

  constructor(public canvas: HTMLCanvasElement) {}

  async init() {
    // Explicitly lock canvas style to full viewport before engine init to prevent 300x150 fallback
    this.canvas.style.position = "fixed";
    this.canvas.style.top = "0";
    this.canvas.style.left = "0";
    this.canvas.style.width = "100vw";
    this.canvas.style.height = "100vh";
    this.canvas.style.display = "block";
    this.resize();

    window.addEventListener("resize", () => {
      this.resize();
      if (this.camera) {
        this.camera.orthoOffCenter(0, this.width, this.height, 0, -1000, 1000);
      }
    });

    // Check if WebGL is forced via URL parameter (e.g. ?gl=1 or ?webgl=1)
    const forceWebGL = typeof location !== "undefined" && (location.search.includes("webgl") || location.search.includes("gl=1"));

    let webgpuSuccess = false;
    if (!forceWebGL && typeof navigator !== "undefined" && (navigator as any).gpu) {
      try {
        await this.initWebGPU();
        webgpuSuccess = true;
      } catch (err) {
        console.warn("WebGPU / Orillusion initialization failed, falling back to WebGL:", err);
      }
    }

    if (!webgpuSuccess) {
      await this.initWebGL();
    }

    const px = new OffscreenCanvas(1, 1);
    const c = px.getContext("2d")!;
    c.fillStyle = "#fff";
    c.fillRect(0, 0, 1, 1);
    this.white = this.texture(await createImageBitmap(px));
  }

  private async initWebGPU() {
    this.backend = "webgpu";

    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error("No WebGPU adapter available.");
    this.device = await adapter.requestDevice();
    this.ctx = this.canvas.getContext("webgpu") as GPUCanvasContext;
    if (!this.ctx) throw new Error("Could not acquire WebGPU canvas context.");
    const format = navigator.gpu.getPreferredCanvasFormat();
    this.ctx.configure({ device: this.device, format, alphaMode: "opaque" });

    try {
      this.scene = new Scene3D();
      const cameraObj = new Object3D();
      cameraObj.name = "OrillusionCamera";
      this.camera = cameraObj.addComponent(Camera3D);
      this.camera.orthoOffCenter(0, this.width, this.height, 0, -1000, 1000);
      this.scene.addChild(cameraObj);

      this.spriteContainer = new Object3D();
      this.spriteContainer.name = "SpriteContainer";
      this.scene.addChild(this.spriteContainer);

      this.view = new View3D();
      this.view.scene = this.scene;
      this.view.camera = this.camera;
    } catch (e) {
      console.warn("Orillusion scene hierarchy setup note:", e);
    }

    const module = this.device.createShaderModule({ code: SHADER });
    this.pipeline = this.device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module, entryPoint: "vs",
        buffers: [{
          arrayStride: FLOATS * 4, stepMode: "instance",
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x4" },
            { shaderLocation: 1, offset: 16, format: "float32x4" },
            { shaderLocation: 2, offset: 32, format: "float32x4" },
          ],
        }],
      },
      fragment: {
        module, entryPoint: "fs",
        targets: [{
          format,
          blend: {
            color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
          },
        }],
      },
      primitive: { topology: "triangle-list" },
    });
    this.viewBuf = this.device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.viewBind = this.device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.viewBuf } }] });
    this.sampler = this.device.createSampler({ magFilter: "nearest", minFilter: "nearest" });
    this.inst = this.device.createBuffer({ size: this.data.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  }

  private async initWebGL() {
    this.backend = "webgl";
    console.info("Initializing WebGL fallback renderer...");

    const glOpts: WebGLContextAttributes = {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    };

    let gl: WebGLRenderingContext | WebGL2RenderingContext | null = this.canvas.getContext("webgl2", glOpts);
    if (gl) {
      this.isWebGL2 = true;
    } else {
      gl = (this.canvas.getContext("webgl", glOpts) || this.canvas.getContext("experimental-webgl", glOpts)) as WebGLRenderingContext | null;
      this.isWebGL2 = false;
      if (gl) {
        this.angleExt = gl.getExtension("ANGLE_instanced_arrays");
        if (!this.angleExt) {
          throw new Error("WebGL ANGLE_instanced_arrays extension not supported.");
        }
      }
    }

    if (!gl) {
      throw new Error("Neither WebGPU nor WebGL is supported by your browser or graphics hardware.");
    }
    this.gl = gl;

    // GLSL Shaders compatible across WebGL 1 & WebGL 2
    const vsSource = `
      attribute vec2 a_corner;
      attribute vec4 a_rect;
      attribute vec4 a_uv;
      attribute vec4 a_color;

      uniform vec2 u_viewSize;

      varying vec2 v_uv;
      varying vec4 v_color;

      void main() {
        vec2 p = a_rect.xy + a_corner * a_rect.zw;
        gl_Position = vec4(p.x / u_viewSize.x * 2.0 - 1.0, 1.0 - p.y / u_viewSize.y * 2.0, 0.0, 1.0);
        v_uv = mix(a_uv.xy, a_uv.zw, a_corner);
        v_color = a_color;
      }
    `;

    const fsSource = `
      precision mediump float;
      uniform sampler2D u_tex;
      varying vec2 v_uv;
      varying vec4 v_color;

      void main() {
        gl_FragColor = texture2D(u_tex, v_uv) * v_color;
      }
    `;

    const vs = this.compileGLShader(gl.VERTEX_SHADER, vsSource);
    const fs = this.compileGLShader(gl.FRAGMENT_SHADER, fsSource);

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`WebGL program link error: ${gl.getProgramInfoLog(prog)}`);
    }
    this.glProgram = prog;

    this.locCorner = gl.getAttribLocation(prog, "a_corner");
    this.locRect = gl.getAttribLocation(prog, "a_rect");
    this.locUv = gl.getAttribLocation(prog, "a_uv");
    this.locColor = gl.getAttribLocation(prog, "a_color");
    this.locViewSize = gl.getUniformLocation(prog, "u_viewSize");
    this.locTex = gl.getUniformLocation(prog, "u_tex");

    // Static 6-vertex quad corners buffer (2 triangles)
    const corners = new Float32Array([
      0, 0,
      1, 0,
      0, 1,
      0, 1,
      1, 0,
      1, 1,
    ]);
    this.glCornerBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.glCornerBuf);
    gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);

    // Dynamic instance buffer
    this.glInstBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.glInstBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
  }

  private compileGLShader(type: number, source: string): WebGLShader {
    const gl = this.gl!;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const err = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`WebGL shader compile error: ${err}`);
    }
    return shader;
  }

  texture(bmp: ImageBitmap): Tex {
    if (this.backend === "webgpu") {
      const tex = this.device.createTexture({
        size: [bmp.width, bmp.height], format: "rgba8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this.device.queue.copyExternalImageToTexture({ source: bmp }, { texture: tex, premultipliedAlpha: true }, [bmp.width, bmp.height]);
      const bind = this.device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(1),
        entries: [{ binding: 0, resource: this.sampler }, { binding: 1, resource: tex.createView() }],
      });

      return { tex, bind, w: bmp.width, h: bmp.height };
    } else {
      const gl = this.gl!;
      const glTex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, glTex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bmp);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return { glTex, w: bmp.width, h: bmp.height };
    }
  }

  /** Explicitly releases WebGPU / WebGL VRAM and scene objects for a texture */
  destroyTexture(t: Tex | null | undefined) {
    if (!t) return;
    if (t.tex) {
      try { t.tex.destroy(); } catch {}
      t.tex = undefined;
    }
    if (t.bind) {
      t.bind = undefined;
    }
    if (t.glTex && this.gl) {
      try { this.gl.deleteTexture(t.glTex); } catch {}
      t.glTex = undefined;
    }
    if (t.bitmapTexture) {
      try { (t.bitmapTexture as any).destroy?.(); } catch {}
      t.bitmapTexture = undefined;
    }
    if (this.activeSpriteRenderers.has(t)) {
      const sr = this.activeSpriteRenderers.get(t);
      if (sr?.object3D) {
        if (this.spriteContainer) {
          try { this.spriteContainer.removeChild(sr.object3D); } catch {}
        } else if (this.scene) {
          try { this.scene.removeChild(sr.object3D); } catch {}
        }
        try { (sr.object3D as any).destroy?.(); } catch {}
      }
      this.activeSpriteRenderers.delete(t);
    }
  }

  /** Create or retrieve an Orillusion SpriteRenderer component bound to this asset texture */
  getOrCreateSpriteRenderer(t: Tex, size?: { w: number; h: number }): SpriteRenderer | null {
    if (!this.scene || !t.orillusionSprite) return null;
    let sr = this.activeSpriteRenderers.get(t);
    if (!sr) {
      const obj = new Object3D();
      obj.name = `Sprite_${t.w}x${t.h}`;
      sr = obj.addComponent(SpriteRenderer);
      sr.sprite = t.orillusionSprite;
      sr.size = new Vector2(size?.w ?? t.w, size?.h ?? t.h);
      if (this.spriteContainer) {
        this.spriteContainer.addChild(obj);
      } else {
        this.scene.addChild(obj);
      }
      this.activeSpriteRenderers.set(t, sr);
    }
    return sr;
  }

  /** Render or update an asset using Orillusion's SpriteRenderer */
  renderSpriteAsset(t: Tex, x: number, y: number, w = t.w, h = t.h, opts?: { flip?: boolean; alpha?: number; tint?: [number, number, number] }) {
    const sr = this.getOrCreateSpriteRenderer(t, { w, h });
    if (sr && sr.object3D) {
      sr.object3D.x = x + w / 2;
      sr.object3D.y = y + h / 2;
      sr.size = new Vector2(w, h);
      if (opts?.tint || opts?.alpha !== undefined) {
        const r = opts?.tint ? opts.tint[0] : 1;
        const g = opts?.tint ? opts.tint[1] : 1;
        const b = opts?.tint ? opts.tint[2] : 1;
        const a = opts?.alpha ?? 1;
        sr.color = new Color(r, g, b, a);
      }
    }
  }


  resize() {
    const dpr = Math.min(1.25, Math.max(1, devicePixelRatio || 1));
    const w = Math.min(1920, Math.ceil(innerWidth * dpr));
    const h = Math.min(1080, Math.ceil(innerHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.scale = w / Math.max(1, innerWidth);
    this.width = innerWidth;
    this.height = innerHeight;
  }

  begin() {
    this.count = 0;
    this.batches.length = 0;
  }

  /** Draw a texture region at logical (CSS-pixel) coordinates. */
  draw(t: Tex, x: number, y: number, w = t.w, h = t.h, opts?: { flip?: boolean; alpha?: number; tint?: [number, number, number]; sx?: number; sy?: number; sw?: number; sh?: number }) {
    if (this.count >= MAX) return;
    if (x > this.width || y > this.height || x + w < 0 || y + h < 0) return;
    const a = opts?.alpha ?? 1;
    const tint = opts?.tint ?? [1, 1, 1];
    const sx = opts?.sx ?? 0, sy = opts?.sy ?? 0, sw = opts?.sw ?? t.w, sh = opts?.sh ?? t.h;
    let u0 = sx / t.w, u1 = (sx + sw) / t.w;
    if (opts?.flip) [u0, u1] = [u1, u0];
    const s = this.scale;
    const o = this.count * FLOATS;
    const d = this.data;
    d[o] = Math.round(x * s); d[o + 1] = Math.round(y * s); d[o + 2] = Math.round(w * s); d[o + 3] = Math.round(h * s);
    d[o + 4] = u0; d[o + 5] = sy / t.h; d[o + 6] = u1; d[o + 7] = (sy + sh) / t.h;
    d[o + 8] = tint[0] * a; d[o + 9] = tint[1] * a; d[o + 10] = tint[2] * a; d[o + 11] = a;
    const last = this.batches[this.batches.length - 1];
    if (last && last.tex === t) last.n++;
    else this.batches.push({ tex: t, start: this.count, n: 1 });
    this.count++;
  }

  rect(x: number, y: number, w: number, h: number, color: [number, number, number, number]) {
    this.draw(this.white, x, y, w, h, { tint: [color[0], color[1], color[2]], alpha: color[3] });
  }

  end() {
    if (this.backend === "webgpu") {
      const q = this.device.queue;
      this.viewData[0] = this.canvas.width;
      this.viewData[1] = this.canvas.height;
      q.writeBuffer(this.viewBuf, 0, this.viewData);
      q.writeBuffer(this.inst, 0, this.data, 0, this.count * FLOATS);
      const enc = this.device.createCommandEncoder();
      const pass = enc.beginRenderPass({
        colorAttachments: [{ view: this.ctx.getCurrentTexture().createView(), loadOp: "clear", storeOp: "store", clearValue: this.clear }],
      });
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.viewBind);
      pass.setVertexBuffer(0, this.inst);
      for (const b of this.batches) {
        if (b.tex.bind) {
          pass.setBindGroup(1, b.tex.bind);
          pass.draw(6, b.n, 0, b.start);
        }
      }
      pass.end();
      q.submit([enc.finish()]);
    } else {
      const gl = this.gl;
      if (!gl || !this.glProgram) return;

      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(this.clear.r, this.clear.g, this.clear.b, this.clear.a);
      gl.clear(gl.COLOR_BUFFER_BIT);

      if (this.count === 0 || this.batches.length === 0) return;

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(this.glProgram);
      gl.uniform2f(this.locViewSize, this.canvas.width, this.canvas.height);

      // Bind corner buffer for vertex 0..5
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glCornerBuf);
      gl.enableVertexAttribArray(this.locCorner);
      gl.vertexAttribPointer(this.locCorner, 2, gl.FLOAT, false, 0, 0);
      if (this.isWebGL2) {
        (gl as WebGL2RenderingContext).vertexAttribDivisor(this.locCorner, 0);
      } else if (this.angleExt) {
        this.angleExt.vertexAttribDivisorANGLE(this.locCorner, 0);
      }

      // Update instance buffer with all batch data
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glInstBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, this.count * FLOATS));

      // Enable instanced vertex attributes
      gl.enableVertexAttribArray(this.locRect);
      gl.enableVertexAttribArray(this.locUv);
      gl.enableVertexAttribArray(this.locColor);

      if (this.isWebGL2) {
        const gl2 = gl as WebGL2RenderingContext;
        gl2.vertexAttribDivisor(this.locRect, 1);
        gl2.vertexAttribDivisor(this.locUv, 1);
        gl2.vertexAttribDivisor(this.locColor, 1);
      } else if (this.angleExt) {
        this.angleExt.vertexAttribDivisorANGLE(this.locRect, 1);
        this.angleExt.vertexAttribDivisorANGLE(this.locUv, 1);
        this.angleExt.vertexAttribDivisorANGLE(this.locColor, 1);
      }

      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(this.locTex, 0);

      const stride = FLOATS * 4;
      for (const b of this.batches) {
        const byteOffset = b.start * stride;
        gl.vertexAttribPointer(this.locRect, 4, gl.FLOAT, false, stride, byteOffset);
        gl.vertexAttribPointer(this.locUv, 4, gl.FLOAT, false, stride, byteOffset + 16);
        gl.vertexAttribPointer(this.locColor, 4, gl.FLOAT, false, stride, byteOffset + 32);

        gl.bindTexture(gl.TEXTURE_2D, b.tex.glTex ?? null);

        if (this.isWebGL2) {
          (gl as WebGL2RenderingContext).drawArraysInstanced(gl.TRIANGLES, 0, 6, b.n);
        } else if (this.angleExt) {
          this.angleExt.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 6, b.n);
        }
      }
    }
  }
}
