/* ============================================================
 * 交互：滚动渐入 · 导航状态 · 代码 Tab 切换
 * ============================================================ */
(function () {
  "use strict";

  /* 导航滚动状态 */
  var nav = document.getElementById("nav");
  var onScroll = function () {
    nav.classList.toggle("scrolled", window.scrollY > 30);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* 滚动渐入 */
  var revealEls = document.querySelectorAll(".sec-head, .grid4 > *, .tl, .method, .link-card, .table-wrap, .table-title, .steps, .step, .rival, .verdict, .rank-note, .faq-list, details");
  revealEls.forEach(function (el) { el.classList.add("reveal"); });
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("in");
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.08 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("in"); });
  }

  /* 移动端汉堡菜单 */
  var toggle = document.getElementById("navToggle");
  var links = document.getElementById("navLinks");
  if (toggle && links) {
    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    links.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        links.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
    document.addEventListener("click", function (e) {
      if (!links.contains(e.target) && !toggle.contains(e.target)) {
        links.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* 代码 Tab 切换 */
  var tabs = document.querySelectorAll(".code-tabs span");
  tabs.forEach(function (tab, idx) {
    tab.addEventListener("click", function () {
      var block = tab.closest(".code-block");
      var pres = block.querySelectorAll("pre");
      block.querySelectorAll(".code-tabs span").forEach(function (t) { t.classList.remove("active"); });
      tab.classList.add("active");
      pres.forEach(function (p, pi) { p.hidden = pi !== idx; });
    });
  });

  /* 活动锚点高亮 */
  var sections = Array.prototype.slice.call(document.querySelectorAll("section[id]"));
  var linkMap = {};
  document.querySelectorAll(".links a").forEach(function (a) {
    linkMap[a.getAttribute("href").slice(1)] = a;
  });
  if ("IntersectionObserver" in window) {
    var io2 = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && linkMap[en.target.id]) {
          document.querySelectorAll(".links a").forEach(function (a) { a.style.color = ""; });
          linkMap[en.target.id].style.color = "var(--cyan)";
        }
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    sections.forEach(function (s) { io2.observe(s); });
  }
})();
