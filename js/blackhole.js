/* ============================================================
 * 黑洞实时渲染 —— Schwarzschild 光线追踪（实时引力透镜）
 * 升级：
 *  - 性能：滚出视口 / 页面隐藏时自动暂停渲染；DPR 上限 1.25；
 *    步数 700；自适应步长（近处密、远处疏）
 *  - 真实感：相机拉近放低（黑洞占画面主体，吸积盘更扁）；
 *    光子球亮环（photon ring，掠过 r≈1.5 的光线增强）；
 *    吸积盘内侧白热化、外缘渐隐、更细密的轨道条纹；
 *    星空更亮更密，爱因斯坦环更明显
 * ============================================================ */
(function () {
  "use strict";

  var canvas = document.getElementById("bhCanvas");
  if (!canvas) return;
  var gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
  if (!gl) {
    // WebGL 不可用时的降级：静态渐变
    canvas.style.background = "radial-gradient(60% 60% at 50% 50%, #000 0%, #000 25%, #241103 45%, #0a0e27 70%, #04060f 100%)";
    return;
  }

  var VERT = [
    "attribute vec2 aPos;",
    "void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }"
  ].join("\n");

  var FRAG = [
    "precision highp float;",
    "uniform vec2 uRes;",
    "uniform float uTime;",
    "",
    "// gravity: Schwarzschild geometry (Rs=1, photon critical orbit r=1.5)",
    "vec3 accel(vec3 p){",
    "  float r2 = dot(p, p);",
    "  return -1.5 * p / (r2 * sqrt(r2));",
    "}",
    "",
    "// hash noise for starfield",
    "float hash31(vec3 p){",
    "  p = fract(p * 0.1031);",
    "  p += dot(p, p.zyx + 31.32);",
    "  return fract((p.x + p.y) * p.z);",
    "}",
    "vec3 skyColor(vec3 d){",
    "  vec3 col = vec3(0.006, 0.008, 0.024);",
    "  // milky-way band",
    "  float g = pow(max(0.0, dot(normalize(d), normalize(vec3(0.42, 0.18, -0.9)))), 3.0);",
    "  col += vec3(0.07, 0.06, 0.14) * g;",
    "  // two star layers",
    "  for(int layer = 0; layer < 2; layer++){",
    "    float scale = (layer == 0) ? 90.0 : 32.0;",
    "    float th = (layer == 0) ? 0.980 : 0.965;",
    "    vec3 cell = floor(d * scale);",
    "    vec3 f = fract(d * scale);",
    "    float h = hash31(cell);",
    "    if(h > th){",
    "      vec3 off = vec3(hash31(cell + 7.31), hash31(cell + 13.7), hash31(cell + 29.9)) - 0.5;",
    "      vec3 pc = f - 0.5 - off * 0.82;",
    "      float dist = dot(pc, pc);",
    "      float s = exp(-dist * 130.0);",
    "      float br = (h - th) / (1.0 - th);",
    "      float sz = (layer == 0) ? 0.45 : 0.9;",
    "      vec3 tint = (layer == 0) ? vec3(0.8, 0.92, 1.0) : vec3(1.0, 0.96, 0.88);",
    "      col += tint * s * sz * (0.35 + br * 1.2);",
    "    }",
    "  }",
    "  return col;",
    "}",
    "",
    "// accretion disk: Keplerian rotation + Doppler shift",
    "vec3 diskColor(vec3 p, vec3 v){",
    "  float r = length(vec2(p.x, p.z));",
    "  // Keplerian tangential velocity (counter-clockwise)",
    "  vec3 tang = normalize(vec3(-p.z, 0.0, p.x));",
    "  float omega = pow(r, -1.5);",
    "  vec3 diskVel = tang * r * omega;",
    "  vec3 viewDir = normalize(v);",
    "  // Doppler: toward viewer -> blueshift brighter/bluer, away -> redshift darker/redder",
    "  float dopp = clamp(1.0 + dot(diskVel, viewDir) * 1.5, 0.10, 2.4);",
    "  // temperature: white-hot inside -> dim orange outside (steep curve)",
    "  float t = clamp((15.0 - r) / 13.0, 0.0, 1.0);",
    "  float heat = t * t * t;",
    "  vec3 base = mix(vec3(0.62, 0.18, 0.04), vec3(1.0, 0.97, 0.9), heat);",
    "  // fine orbital turbulence streaks",
    "  float ang = atan(p.z, p.x);",
    "  float stripe = 0.8 + 0.2 * sin(ang * 52.0 + r * 30.0 + uTime * 2.2);",
    "  // radial brightness + edge falloff",
    "  float bright = 0.32 + 1.3 * heat;",
    "  float fade = smoothstep(2.1, 2.7, r) * smoothstep(15.0, 11.0, r);",
    "  // Doppler color modulation",
    "  vec3 dcol = mix(vec3(1.0, 0.38, 0.18), vec3(0.62, 0.94, 1.0), clamp(dopp * 0.55, 0.0, 1.0));",
    "  vec3 c = base * stripe * bright * dcol * (0.16 + 1.05 * dopp) * fade;",
    "  return c * 2.5;",
    "}",
    "",
    "void main(){",
    "  vec2 uv = (2.0 * gl_FragCoord.xy - uRes) / uRes.y;",
    "",
    "  // camera: slow low orbit, close to the black hole",
    "  float ca = uTime * 0.05;",
    "  vec3 ro = vec3(8.2 * cos(ca), 0.85, 8.2 * sin(ca));",
    "  vec3 fwd = normalize(-ro);",
    "  vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));",
    "  vec3 up = cross(right, fwd);",
    "  float fov = 0.95;",
    "  vec3 rd = normalize(fwd + right * uv.x * fov + up * uv.y * fov);",
    "",
    "  vec3 p = ro;",
    "  vec3 v = rd;",
    "  vec3 col = vec3(0.0);",
    "  float dt = 0.014;",
    "  float minR = 1e5;",
    "  bool done = false;",
    "",
    "  for(int i = 0; i < 700; i++){",
    "    v += accel(p) * dt;",
    "    p += v * dt;",
    "    float r = length(p);",
    "    if(r < minR) minR = r;",
    "    if(r < 1.30){ col = vec3(0.0); done = true; break; }",
    "    // crossing the accretion disk plane",
    "    if(p.y < 0.03 && p.y > -0.03 && r > 2.1 && r < 15.0){",
    "      col = diskColor(p, v); done = true; break;",
    "    }",
    "    if(r > 30.0){ col = skyColor(normalize(v)); done = true; break; }",
    "    // adaptive step: fine near the horizon, coarse far away",
    "    dt = 0.014 + 0.0014 * r;",
    "  }",
    "  if(!done) col = skyColor(normalize(v));",
    "",
    "  // photon ring: rays grazing the photon sphere (r~1.5) glow",
    "  if(minR > 1.44 && minR < 2.4){",
    "    float pr = exp(-pow((minR - 1.5) / 0.30, 2.0));",
    "    col += vec3(0.85, 0.95, 1.0) * pr * (0.55 + 0.45 * sin(uTime * 2.0));",
    "  }",
    "",
    "  // tonemap + slight gamma + vignette",
    "  col = col / (1.0 + col);",
    "  col = pow(col, vec3(0.82));",
    "  float vig = 1.0 - 0.2 * dot(uv, uv) * 0.5;",
    "  col *= vig;",
    "  gl_FragColor = vec4(col, 1.0);",
    "}"
  ].join("\n");

  function compile(type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error("Shader error:", gl.getShaderInfoLog(sh));
      return null;
    }
    return sh;
  }

  var prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("Link error:", gl.getProgramInfoLog(prog));
    return;
  }
  gl.useProgram(prog);

  // 全屏三角形
  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  var uRes = gl.getUniformLocation(prog, "uRes");
  var uTime = gl.getUniformLocation(prog, "uTime");

  function resize() {
    var w = canvas.clientWidth, h = canvas.clientHeight;
    // 移动端 DPR 上限 1（手机屏 DPR 常为 2-3，过高会拖垮 GPU）；桌面 1.25
    var isMobile = Math.min(window.innerWidth, window.innerHeight) < 768;
    var dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1 : 1.25);
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();
  window.addEventListener("resize", resize);

  /* ---------- 暂停机制：滚出视口 / 页面隐藏时停止渲染 ---------- */
  var paused = false;
  function setPaused(v) { paused = v; }
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { setPaused(!e.isIntersecting); });
    }, { threshold: 0 });
    io.observe(canvas);
  }
  document.addEventListener("visibilitychange", function () {
    setPaused(document.hidden);
  });

  var start = performance.now();
  function frame() {
    if (!paused) {
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, (performance.now() - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
