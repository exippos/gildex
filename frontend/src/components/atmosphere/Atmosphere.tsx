// Experimental WebGL atmosphere layer: one low-resolution full-screen shader
// painted behind the gallery grid. Renders at a fixed 0.3 scale (the CSS
// upscales it), capped at 30fps, paused while the document is hidden. If WebGL
// or shader compilation is unavailable it simply paints nothing and the CSS
// fallback on the canvas remains visible.
import { useEffect, useRef } from 'react'
import './atmosphere.css'

const RENDER_SCALE = 0.3
const FRAME_MS = 1000 / 30

const VERT_SRC = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

const FRAG_SRC = `
precision mediump float;
uniform float u_time;
uniform vec2 u_res;
uniform float u_theme;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
  float t = u_time * 0.012;
  float n1 = noise(p * 1.6 + vec2(t, -t * 0.6));
  float n2 = noise(p * 3.7 - vec2(t * 0.7, t));
  float field = n1 * 0.65 + n2 * 0.35;

  float r = length(p);
  float band = smoothstep(0.75, 0.0, abs(r - (0.42 + field * 0.10)));

  vec3 sage = mix(vec3(0.086, 0.125, 0.106), vec3(0.145, 0.196, 0.165), field);
  vec3 gilt = mix(vec3(0.478, 0.396, 0.216), vec3(0.839, 0.741, 0.502), field);
  vec3 light = mix(vec3(0.957, 0.953, 0.933), vec3(0.878, 0.855, 0.804), field);

  vec3 base = mix(sage, light, u_theme);
  vec3 col = mix(base, gilt, band * (0.16 + 0.06 * u_theme));

  float vignette = smoothstep(1.05, 0.25, r);
  col *= mix(0.86, 1.0, vignette);

  gl_FragColor = vec4(col, 1.0);
}
`

export function Atmosphere() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
    })
    if (!gl) return

    // GL objects are hoisted so a partial failure can still clean up.
    let vs: WebGLShader | null = null
    let fs: WebGLShader | null = null
    let program: WebGLProgram | null = null
    let buffer: WebGLBuffer | null = null

    let aPos = -1
    let uTime: WebGLUniformLocation | null = null
    let uRes: WebGLUniformLocation | null = null
    let uTheme: WebGLUniformLocation | null = null

    let raf = 0
    let observer: ResizeObserver | null = null
    let start = 0
    let last = 0
    let ready = false

    const compile = (type: number, source: string): WebGLShader => {
      const shader = gl.createShader(type)
      if (!shader) throw new Error('atmosphere: could not create shader')
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader)
        gl.deleteShader(shader)
        throw new Error(`atmosphere: shader compile failed: ${log ?? 'unknown error'}`)
      }
      return shader
    }

    const link = (vertex: WebGLShader, fragment: WebGLShader): WebGLProgram => {
      const next = gl.createProgram()
      if (!next) throw new Error('atmosphere: could not create program')
      gl.attachShader(next, vertex)
      gl.attachShader(next, fragment)
      gl.linkProgram(next)
      if (!gl.getProgramParameter(next, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(next)
        gl.deleteProgram(next)
        throw new Error(`atmosphere: program link failed: ${log ?? 'unknown error'}`)
      }
      return next
    }

    const stop = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    }

    const sizeTo = (width: number, height: number) => {
      canvas.width = Math.max(1, Math.round(width * RENDER_SCALE))
      canvas.height = Math.max(1, Math.round(height * RENDER_SCALE))
      gl.viewport(0, 0, canvas.width, canvas.height)
    }

    const draw = (now: number) => {
      raf = 0
      if (!ready || !program) return
      // Cap to 30fps: skip frames that arrive too soon, but keep the loop alive.
      if (now - last < FRAME_MS) {
        raf = requestAnimationFrame(draw)
        return
      }
      last = now

      gl.uniform1f(uTime, (now - start) / 1000)
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform1f(uTheme, document.documentElement.dataset.theme === 'light' ? 1 : 0)

      gl.enableVertexAttribArray(aPos)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLES, 0, 3)

      raf = requestAnimationFrame(draw)
    }

    const startLoop = () => {
      // Single rAF id: never double-start.
      if (raf || !ready || document.hidden) return
      raf = requestAnimationFrame(draw)
    }

    const onVisibility = () => {
      if (document.hidden) stop()
      else startLoop()
    }

    const onContextLost = (event: Event) => {
      event.preventDefault()
      ready = false
      stop()
    }

    const dispose = () => {
      stop()
      if (observer) observer.disconnect()
      observer = null
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.removeEventListener('webglcontextlost', onContextLost)
      if (buffer) gl.deleteBuffer(buffer)
      if (program) gl.deleteProgram(program)
      if (vs) gl.deleteShader(vs)
      if (fs) gl.deleteShader(fs)
      buffer = null
      program = null
      vs = null
      fs = null
    }

    try {
      vs = compile(gl.VERTEX_SHADER, VERT_SRC)
      fs = compile(gl.FRAGMENT_SHADER, FRAG_SRC)
      program = link(vs, fs)

      aPos = gl.getAttribLocation(program, 'a_pos')
      if (aPos < 0) throw new Error('atmosphere: missing a_pos attribute')

      uTime = gl.getUniformLocation(program, 'u_time')
      uRes = gl.getUniformLocation(program, 'u_res')
      uTheme = gl.getUniformLocation(program, 'u_theme')

      buffer = gl.createBuffer()
      if (!buffer) throw new Error('atmosphere: could not create buffer')
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
      gl.enableVertexAttribArray(aPos)
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

      gl.useProgram(program)
      gl.clearColor(0, 0, 0, 1)

      const rect = canvas.getBoundingClientRect()
      sizeTo(rect.width, rect.height)

      observer = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (!entry) return
        sizeTo(entry.contentRect.width, entry.contentRect.height)
      })
      observer.observe(canvas)

      document.addEventListener('visibilitychange', onVisibility)
      canvas.addEventListener('webglcontextlost', onContextLost)

      start = performance.now()
      last = 0
      ready = true
      startLoop()
    } catch {
      // Shader/GL failure: leave the static CSS fallback in place.
      dispose()
      return
    }

    return dispose
  }, [])

  return <canvas ref={canvasRef} className="atmosphere" aria-hidden="true" />
}
