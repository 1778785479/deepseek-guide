/* ============================================================
 * 真实感行星渲染 —— 程序化生成
 *  - fbm(value noise) 程序化纹理：木星 / 土星 / 地球 / 火星
 *  - 水平无缝循环 + background-position 动画 = 行星自转
 *  - 光照明暗面、大气辉光、土星光环
 * ============================================================ */
(function () {
  "use strict";

  var SEED = 20260731;

  function hash2(x, y, seed) {
    var h = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
    return h - Math.floor(h);
  }
  // 水平周期无缝 value noise（x 以 period 为周期）
  function vnoiseLoop(x, y, seed, period) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var xf = x - xi, yf = y - yi;
    var x0 = ((xi % period) + period) % period;
    var x1 = (x0 + 1) % period;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = hash2(x0, yi, seed), b = hash2(x1, yi, seed);
    var c = hash2(x0, yi + 1, seed), d = hash2(x1, yi + 1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbmLoop(x, y, oct, seed, period) {
    var val = 0, amp = 0.5, freq = 1, tot = 0;
    for (var i = 0; i < oct; i++) {
      val += amp * vnoiseLoop(x * freq, y * freq, seed + i * 13.7, Math.max(1, Math.round(period * freq)));
      tot += amp; amp *= 0.5; freq *= 2;
    }
    return val / tot;
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function mix(c1, c2, t) { return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)]; }
  function multiLerp(stops, t) {
    t = Math.max(0, Math.min(1, t));
    for (var i = 0; i < stops.length - 1; i++) {
      if (t <= stops[i + 1][0]) {
        var f = (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
        return mix(stops[i][1], stops[i + 1][1], f);
      }
    }
    return stops[stops.length - 1][1];
  }
  function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

  /* ---------- 各行星纹理 ---------- */
  var TEXTURES = {
    jupiter: function (W, H) {
      var stops = [
        [0.0, [232, 224, 208]], [0.18, [196, 160, 118]], [0.34, [235, 226, 208]],
        [0.5, [168, 118, 74]], [0.66, [238, 230, 214]], [0.82, [178, 134, 88]],
        [1.0, [232, 224, 208]]
      ];
      return function (u, v) {
        var n = fbmLoop(u * 3, v * 6, 5, SEED + 1, 3);
        var s = Math.sin(v * Math.PI * 13 + n * 4.2);
        var t = s * 0.5 + 0.5 + (n - 0.5) * 0.35;
        var c = multiLerp(stops, t);
        // 大红斑（椭圆涡旋）
        var ex = (u - 0.66) / 0.055, ey = (v - 0.72) / 0.045;
        var d = ex * ex + ey * ey;
        if (d < 1) {
          var swirl = fbmLoop(u * 10 + v * 4, v * 10, 4, SEED + 7, 10);
          c = mix(c, [186, 92, 52], (1 - d) * (0.55 + 0.4 * swirl));
        }
        // 微纹理
        var g = fbmLoop(u * 40, v * 40, 3, SEED + 3, 40);
        c = [c[0] + (g - 0.5) * 14, c[1] + (g - 0.5) * 12, c[2] + (g - 0.5) * 10];
        return c;
      };
    },
    saturn: function (W, H) {
      var stops = [
        [0.0, [226, 205, 160]], [0.3, [214, 188, 138]], [0.5, [236, 222, 186]],
        [0.7, [198, 166, 118]], [1.0, [226, 205, 160]]
      ];
      return function (u, v) {
        var n = fbmLoop(u * 3, v * 5, 5, SEED + 11, 3);
        var s = Math.sin(v * Math.PI * 9 + n * 3.4);
        var t = s * 0.5 + 0.5 + (n - 0.5) * 0.4;
        var c = multiLerp(stops, t);
        // 柔和条带
        var g = fbmLoop(u * 30, v * 30, 3, SEED + 13, 30);
        c = [c[0] + (g - 0.5) * 10, c[1] + (g - 0.5) * 9, c[2] + (g - 0.5) * 7];
        return c;
      };
    },
    earth: function (W, H) {
      return function (u, v) {
        var n = fbmLoop(u * 4, v * 4, 6, SEED + 21, 4);
        var c;
        if (n < 0.5) {
          // 海洋，深度渐变
          var deep = 1 - n / 0.5;
          c = mix([16, 42, 108], [26, 74, 148], deep * deep);
        } else if (n < 0.6) {
          // 浅海/海岸
          c = mix([26, 74, 148], [70, 122, 92], (n - 0.5) * 10);
        } else if (n < 0.72) {
          // 平原/森林
          var f = (n - 0.6) / 0.12;
          c = mix([86, 136, 82], [128, 122, 84], f);
        } else {
          // 山地
          c = mix([128, 122, 84], [168, 156, 132], (n - 0.72) / 0.28);
        }
        // 云层（半透明白）
        var cl = fbmLoop(u * 6 + 100, v * 6 + 100, 5, SEED + 23, 6);
        if (cl > 0.58) {
          var f2 = Math.min(1, (cl - 0.58) / 0.42) * 0.85;
          c = mix(c, [235, 240, 246], f2);
        }
        // 极冠
        if (v < 0.075 || v > 0.925) {
          var pc = Math.min(v, 1 - v) / 0.075;
          c = mix([226, 234, 240], c, pc * pc);
        }
        return c;
      };
    },
    mars: function (W, H) {
      return function (u, v) {
        var n = fbmLoop(u * 5, v * 5, 5, SEED + 31, 5);
        var c = multiLerp([[0, [196, 92, 58]], [0.5, [216, 122, 74]], [1, [176, 74, 44]]], n);
        // 暗斑
        var d = fbmLoop(u * 12 + 40, v * 12 + 40, 4, SEED + 33, 12);
        if (d > 0.6) c = mix(c, [110, 52, 32], Math.min(1, (d - 0.6) / 0.4) * 0.75);
        // 微细纹理
        var g = fbmLoop(u * 50, v * 50, 3, SEED + 35, 50);
        c = [c[0] + (g - 0.5) * 16, c[1] + (g - 0.5) * 12, c[2] + (g - 0.5) * 8];
        // 极冠
        if (v < 0.06 || v > 0.94) {
          var pc = Math.min(v, 1 - v) / 0.06;
          c = mix([240, 238, 236], c, pc * pc);
        }
        return c;
      };
    }
  };

  function buildTexture(kind) {
    var W = 512, H = 256;
    var gen = TEXTURES[kind](W, H);
    var img = new ImageData(W, H);
    var data = img.data;
    for (var y = 0; y < H; y++) {
      var v = y / (H - 1);
      for (var x = 0; x < W; x++) {
        var u = x / W;
        var c = gen(u, v);
        var i = (y * W + x) * 4;
        data[i] = clamp255(c[0]);
        data[i + 1] = clamp255(c[1]);
        data[i + 2] = clamp255(c[2]);
        data[i + 3] = 255;
      }
    }
    // 首尾两列混合，保证水平无缝
    for (var y2 = 0; y2 < H; y2++) {
      var j0 = y2 * W * 4, j1 = (y2 * W + W - 1) * 4;
      var r = (data[j0] + data[j1]) >> 1, g = (data[j0 + 1] + data[j1 + 1]) >> 1, b = (data[j0 + 2] + data[j1 + 2]) >> 1;
      data[j0] = r; data[j0 + 1] = g; data[j0 + 2] = b;
      data[j1] = r; data[j1 + 1] = g; data[j1 + 2] = b;
    }
    var cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    cv.getContext("2d").putImageData(img, 0, 0);
    return cv.toDataURL();
  }

  // 大气辉光颜色
  var ATMO = {
    jupiter: { glow: "rgba(214,178,140,0.55)", inner: "rgba(214,178,140,0.16)" },
    saturn: { glow: "rgba(238,216,168,0.55)", inner: "rgba(238,216,168,0.16)" },
    earth: { glow: "rgba(120,170,255,0.6)", inner: "rgba(120,170,255,0.18)" },
    mars: { glow: "rgba(255,150,110,0.45)", inner: "rgba(255,150,110,0.14)" }
  };

  function buildPlanet(el) {
    var kind = el.getAttribute("data-kind");
    if (!TEXTURES[kind]) return;
    // 动态构建内部结构（HTML 中为自闭合标签）
    if (!el.querySelector(".p-body")) {
      el.innerHTML =
        '<div class="p-ring"></div>' +
        '<div class="p-body"><div class="p-tex"></div></div>' +
        '<div class="p-ring-front"></div>' +
        '<div class="p-shade"></div>' +
        '<div class="p-atmo"></div>';
    }
    var url = buildTexture(kind);
    var body = el.querySelector(".p-tex");
    var shade = el.querySelector(".p-shade");
    var atmo = el.querySelector(".p-atmo");
    if (body) body.style.backgroundImage = "url(" + url + ")";
    if (atmo) {
      atmo.style.boxShadow = "0 0 46px 6px " + ATMO[kind].glow;
      atmo.style.background = "radial-gradient(circle at 50% 50%, transparent 58%, " + ATMO[kind].inner + " 78%, transparent 92%)";
    }
    // 土星环
    if (kind === "saturn") {
      var rings = el.querySelectorAll(".p-ring");
      for (var i = 0; i < rings.length; i++) {
        rings[i].style.display = "block";
      }
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    var els = document.querySelectorAll(".planet");
    for (var i = 0; i < els.length; i++) buildPlanet(els[i]);
  });
})();
