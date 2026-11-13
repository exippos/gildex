// Experimental WebGL atmosphere layer: one low-resolution full-screen shader
// painted behind the gallery grid for the gilded theme. Other themes use a
// static CSS background on the same element. Renders at a fixed 0.3 scale (the
// CSS upscales it), capped at 30fps, paused while the document is hidden.
import { useEffect, useRef } from 'react'
import { useStore } from '../../store'
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

  vec3 deep = mix(vec3(0.024, 0.043, 0.075), vec3(0.055, 0.086, 0.130), field);
  vec3 gilt = mix(vec3(0.420, 0.330, 0.195), vec3(0.830, 0.690, 0.480), field);
  vec3 ocean = mix(vec3(0.080, 0.250, 0.380), vec3(0.220, 0.740, 0.970), field);

  vec3 base = deep;
  vec3 ring = mix(ocean, gilt, smoothstep(0.0, 0.35, field));
  vec3 col = mix(base, ring, band * 0.10);

  float vignette = smoothstep(1.05, 0.25, r);
  col *= mix(0.9, 1.0, vignette);

  gl_FragColor = vec4(col, 1.0);
}
`

export function Atmosphere() {
  const theme = useStore((s) => s.theme)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (theme !== 'gilded') return

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
  }, [theme])

  if (theme !== 'gilded') return <div className="atmosphere" aria-hidden="true" />
  return <canvas ref={canvasRef} className="atmosphere" aria-hidden="true" />
}
