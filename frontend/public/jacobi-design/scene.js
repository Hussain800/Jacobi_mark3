/* ============================================================================
   JACOBI — Scene background (WebGL gradient mesh)
   A real fragment shader: fbm-noise driven cobalt/violet light field, slow
   time evolution, cursor warp, fine grain + vignette. Lives on a fixed
   full-viewport canvas behind every page.
   ========================================================================== */
(function () {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (document.querySelector('.jacobi-scene-bg')) return;

  const cv = document.createElement('canvas');
  cv.className = 'jacobi-scene-bg';
  cv.setAttribute('aria-hidden', 'true');
  (document.body || document.documentElement).insertBefore(cv, (document.body || document.documentElement).firstChild);

  const gl = cv.getContext('webgl', { antialias: false, alpha: true, premultipliedAlpha: false }) ||
             cv.getContext('experimental-webgl');
  if (!gl) { cv.remove(); return; }

  const VERT = `
    attribute vec2 a_pos;
    varying vec2 vUv;
    void main(){ vUv = (a_pos + 1.0) * 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }
  `;

  const FRAG = `
    precision highp float;
    varying vec2 vUv;
    uniform float uTime;
    uniform vec2  uRes;
    uniform vec2  uMouse;

    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      float a = hash(i), b = hash(i + vec2(1.0,0.0));
      float c = hash(i + vec2(0.0,1.0)), d = hash(i + vec2(1.0,1.0));
      vec2 u = f*f*(3.0 - 2.0*f);
      return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
    }
    float fbm(vec2 p){
      float v = 0.0, a = 0.55;
      mat2 rot = mat2(0.86, 0.5, -0.5, 0.86);
      for (int i = 0; i < 6; i++) {
        v += a * noise(p);
        p = rot * p * 2.02;
        a *= 0.5;
      }
      return v;
    }

    void main(){
      vec2 uv = vUv;
      float ar = uRes.x / max(uRes.y, 1.0);
      vec2 puv = vec2(uv.x * ar, uv.y);

      float t = uTime * 0.04;
      vec2  drift = vec2(t * 0.15, -t * 0.10);
      float n1 = fbm(puv * 1.30 + drift);
      float n2 = fbm(puv * 2.10 - drift * 0.6 + vec2(n1 * 0.9, n1 * 0.6));
      float n  = mix(n1, n2, 0.55);

      // Palette — quiet luxury: near-black → indigo → cobalt → violet
      vec3 c0 = vec3(0.014, 0.018, 0.030);
      vec3 c1 = vec3(0.040, 0.060, 0.150);
      vec3 c2 = vec3(0.110, 0.180, 0.520);
      vec3 c3 = vec3(0.270, 0.130, 0.490);
      vec3 c4 = vec3(0.520, 0.300, 0.720);

      vec3 col = mix(c0, c1, smoothstep(0.05, 0.45, n));
      col = mix(col, c2, smoothstep(0.40, 0.72, n) * 0.85);
      col = mix(col, c3, smoothstep(0.62, 0.85, n) * 0.55);
      col = mix(col, c4, smoothstep(0.78, 0.95, n) * 0.22);

      // Soft cursor lift — barely there
      vec2 m = uMouse / max(uRes, vec2(1.0));
      m.x *= ar;
      float md = distance(puv, m);
      col += vec3(0.045, 0.075, 0.180) * smoothstep(0.55, 0.05, md);

      // Editorial vignette (darker corners, more luxe)
      vec2 vc = uv - 0.5; vc.x *= ar;
      float vg = smoothstep(1.10, 0.30, length(vc));
      col *= mix(0.55, 1.05, vg);

      // Fine grain
      float g = (hash(uv * uRes + uTime * 60.0) - 0.5) * 0.018;
      col += g;

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  function compile(type, src){
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('shader:', gl.getShaderInfoLog(s)); gl.deleteShader(s); return null;
    }
    return s;
  }
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) { cv.remove(); return; }

  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { cv.remove(); return; }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uTime  = gl.getUniformLocation(prog, 'uTime');
  const uRes   = gl.getUniformLocation(prog, 'uRes');
  const uMouse = gl.getUniformLocation(prog, 'uMouse');

  const dpr = Math.min(1.5, window.devicePixelRatio || 1);
  function size() {
    const w = innerWidth, h = innerHeight;
    cv.width = Math.floor(w * dpr); cv.height = Math.floor(h * dpr);
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    gl.viewport(0, 0, cv.width, cv.height);
    gl.uniform2f(uRes, cv.width, cv.height);
  }
  size(); addEventListener('resize', size);

  let mx = 0.5 * cv.width, my = 0.5 * cv.height;
  let tmx = mx, tmy = my;
  addEventListener('pointermove', e => {
    tmx = e.clientX * dpr;
    tmy = (innerHeight - e.clientY) * dpr;
  }, { passive: true });

  const t0 = performance.now();
  (function frame(){
    mx += (tmx - mx) * 0.05;
    my += (tmy - my) * 0.05;
    gl.uniform1f(uTime, (performance.now() - t0) / 1000);
    gl.uniform2f(uMouse, mx, my);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    requestAnimationFrame(frame);
  })();
})();
