/* RelLens 2 — content script
 *
 * The page is never modified. Every highlight is drawn in one overlay that
 * lives in its own closed shadow root, so page CSS cannot break it and it
 * cannot break the page. Links are measured, clipped to whatever scroll or
 * overflow box they sit in, and hidden when a sticky bar covers them.
 */
(() => {
  if (window.__rellens2) return;
  window.__rellens2 = true;

  const NAMES = { follow: "Follow", nofollow: "Nofollow", ugc: "UGC", sponsored: "Sponsored", internal: "Internal" };
  const DEFAULTS = { enabled: true, style: "line", tags: false, tooltip: true, internal: false, hidden: {} };
  const MEDIA = "img,picture,video,canvas,svg";
  const HINTS = new Set(["nofollow", "ugc", "sponsored"]);

  let settings = { ...DEFAULTS };
  const recs = new Map(); // element -> record
  const byId = new Map();
  let nextId = 1;
  let counts = emptyCounts();
  let pageNofollow = false;

  /* ---------- which site is this ---------- */

  const SECOND = new Set("co com org net gov ac edu ltd plc me nhs sch".split(" "));
  const SHARED = new Set([
    "github.io", "wordpress.com", "blogspot.com", "substack.com", "netlify.app", "vercel.app",
    "pages.dev", "myshopify.com", "wixsite.com", "webflow.io", "herokuapp.com", "tumblr.com"
  ]);
  function siteOf(host) {
    host = host.toLowerCase().replace(/^www\./, "");
    if (/^[\d.:]+$/.test(host)) return host;
    const p = host.split(".");
    if (p.length <= 2) return host;
    let n = p[p.length - 1].length === 2 && SECOND.has(p[p.length - 2]) ? 3 : 2;
    if (SHARED.has(p.slice(-n).join("."))) n++;
    return p.slice(-n).join(".");
  }
  const pageSite = siteOf(location.hostname);

  function emptyCounts() {
    return { follow: 0, nofollow: 0, ugc: 0, sponsored: 0, external: 0, internal: 0, internalNofollow: 0, domains: 0 };
  }

  /* ---------- overlay ---------- */

  const CSS = `
:host{all:initial!important;position:absolute!important;top:0!important;left:0!important;width:0!important;height:0!important;
  display:block!important;z-index:2147483647!important;pointer-events:none!important}
.layer{position:absolute;top:0;left:0;width:0;height:0}
.m{position:absolute;top:0;left:0;--c:#12a150;animation:rl-in .2s ease-out}
.m.follow{--c:#12824f}.m.nofollow{--c:#d93a32}.m.ugc{--c:#b87400}.m.sponsored{--c:#6D00F8}.m.internal{--c:#016DFF}
.r{position:absolute;box-sizing:border-box;border-radius:3px}

.s-line .text .r{background:color-mix(in srgb,var(--c) 13%,transparent);box-shadow:0 2px 0 0 var(--c);border-radius:2px 2px 1px 1px}
.s-box .text .r{background:color-mix(in srgb,var(--c) 9%,transparent);box-shadow:inset 0 0 0 1.5px var(--c);border-radius:4px}
.s-fill .text .r{background:color-mix(in srgb,var(--c) 26%,transparent);border-radius:3px}

.box .r{border:2px solid var(--c);border-radius:6px;background:color-mix(in srgb,var(--c) 6%,transparent)}
.s-fill .box .r{background:color-mix(in srgb,var(--c) 20%,transparent)}

.tag{position:absolute;display:none;font:600 9.5px/14px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  color:#fff;background:var(--c);padding:0 5px;border-radius:4px;white-space:nowrap;letter-spacing:0;box-shadow:0 0 0 1.5px rgba(255,255,255,.85)}
.tags .tag{display:block}

.m.pulse .r{animation:rl-pulse 1.1s ease-out 2;outline:2px solid var(--c);outline-offset:2px}

@keyframes rl-in{from{opacity:0}to{opacity:1}}
@keyframes rl-pulse{0%{outline-offset:0;outline-color:var(--c)}100%{outline-offset:14px;outline-color:transparent}}

.tip{position:fixed;top:0;left:0;max-width:320px;min-width:200px;box-sizing:border-box;padding:12px 13px 11px;
  background:#fff;color:#111212;border:1px solid rgba(17,18,18,.16);border-radius:8px;
  box-shadow:0 10px 30px rgba(17,18,18,.14);font:400 12px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  opacity:0;transform:translateY(3px);transition:opacity .13s ease,transform .13s ease;visibility:hidden;text-align:left}
.tip.on{opacity:1;transform:none;visibility:visible}
.tip *{box-sizing:border-box}
.th{display:flex;align-items:center;gap:8px;margin-bottom:9px}
.tt{font-weight:500;font-size:11px;line-height:19px;padding:0 7px;border-radius:4px;color:#fff;background:#111212;box-shadow:0 2px 0 var(--c)}
.ts{color:#6f6f6f;font-size:11px}
.host{font-weight:500;font-size:15px;letter-spacing:-.01em;overflow-wrap:anywhere}
.path{color:#6f6f6f;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px}
.rel{display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-top:9px;padding-top:9px;border-top:1px solid rgba(17,18,18,.1)}
.rel span{color:#6f6f6f}
.rel b{font-weight:400;font-size:11px;line-height:19px;padding:0 7px;border-radius:4px;background:#f2f2f0;color:#111212}
.rel b.k{background:color-mix(in srgb,var(--c) 13%,#fff);color:color-mix(in srgb,var(--c) 80%,#000)}
.notes{color:#6f6f6f;margin-top:7px;font-size:11px}
.warn{color:#8a5a00;margin-top:7px;font-size:11px}

@media (prefers-reduced-motion:reduce){.m,.m.pulse .r{animation:none}.tip{transition:none}}
`;

  const host = document.createElement("rellens-overlay");
  host.style.cssText =
    "all:initial!important;position:absolute!important;top:0!important;left:0!important;width:0!important;" +
    "height:0!important;margin:0!important;padding:0!important;border:0!important;display:block!important;" +
    "z-index:2147483647!important;pointer-events:none!important;";
  const shadow = host.attachShadow({ mode: "closed" });
  const styleEl = document.createElement("style");
  styleEl.textContent = CSS;
  const layer = document.createElement("div");
  layer.className = "layer";
  const tip = document.createElement("div");
  tip.className = "tip";
  shadow.append(styleEl, layer, tip);

  // clear anything an older copy of RelLens left on this page
  document.querySelectorAll("rellens-overlay").forEach((n) => n.remove());
  document.querySelectorAll("span.relh-badge").forEach((n) => n.remove());
  document.documentElement.classList.remove("relh-on");

  // When the extension is updated or reloaded, Chrome leaves this script running on open tabs
  // but cuts it off from settings and messages. Such a copy must remove itself, or its
  // highlights would stay on the page with no way to switch them off.
  let dead = false;
  function alive() {
    if (dead) return false;
    try { if (chrome.runtime && chrome.runtime.id) return true; } catch (e) {}
    dead = true;
    try { mo.disconnect(); } catch (e) {}
    host.remove();
    return false;
  }

  function mount() {
    if (dead) return;
    if (!host.isConnected && document.documentElement) document.documentElement.appendChild(host);
  }

  /* ---------- finding and reading links ---------- */

  function collect(root, out, roots) {
    root.querySelectorAll("a, area").forEach((el) => out.push(el));
    // open shadow roots (web components)
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let n = walker.currentNode;
    while ((n = walker.nextNode())) {
      if (n.shadowRoot && n !== host) {
        roots.push(n.shadowRoot);
        collect(n.shadowRoot, out, roots);
      }
    }
  }

  function analyze(el) {
    let raw = el.getAttribute("href");
    if (raw == null) raw = el.getAttribute("xlink:href");
    if (raw == null || raw.trim() === "") return null;
    let url;
    try { url = new URL(raw, el.baseURI); } catch (e) { return null; }
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // jump links to a spot on this same page are not real links out
    if (url.hash && url.href.split("#")[0] === location.href.split("#")[0]) return null;
    const rel = (el.getAttribute("rel") || "").toLowerCase().split(/\s+/).filter(Boolean);
    const type = rel.includes("sponsored") ? "sponsored" : rel.includes("ugc") ? "ugc" : rel.includes("nofollow") ? "nofollow" : "follow";
    const internal = siteOf(url.hostname) === pageSite;
    return { url, rel, type, internal, cls: internal && type === "follow" ? "internal" : type };
  }

  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.target === host) continue;
      queueScan();
      scheduleSoon();
      return;
    }
  });
  const watched = new WeakSet();
  function watch(root) {
    if (watched.has(root)) return;
    watched.add(root);
    mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["rel", "href", "class", "style", "hidden", "open"] });
  }

  let clipCache = new WeakMap();

  function scan() {
    scanTimer = 0;
    if (!alive()) return;
    mount();
    const found = [];
    const roots = [];
    collect(document, found, roots);
    watch(document.documentElement);
    roots.forEach(watch);
    clipCache = new WeakMap();

    const robots = document.querySelectorAll('meta[name="robots" i], meta[name="googlebot" i]');
    pageNofollow = [...robots].some((m) => /\b(nofollow|none)\b/i.test(m.content || ""));

    const seen = new Set();
    const c = emptyCounts();
    const domains = new Set();
    for (const el of found) {
      const info = analyze(el);
      if (!info) continue;
      seen.add(el);
      let rec = recs.get(el);
      if (!rec) {
        rec = { el, id: nextId++, node: null, key: "", fs: 0, clips: null };
        recs.set(el, rec);
        byId.set(rec.id, rec);
      }
      if (rec.cls !== info.cls) rec.key = "";
      Object.assign(rec, info);
      rec.clips = null;
      const media = el.matches("svg a, svg *") ? [] : [...el.querySelectorAll(MEDIA)].slice(0, 4);
      rec.media = media;
      rec.text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (info.internal) {
        c.internal++;
        if (info.type !== "follow") c.internalNofollow++;
      } else {
        c.external++;
        c[info.type]++;
        domains.add(siteOf(info.url.hostname));
      }
    }
    for (const [el, rec] of recs) {
      if (seen.has(el)) continue;
      if (rec.node) rec.node.remove();
      recs.delete(el);
      byId.delete(rec.id);
    }
    c.domains = domains.size;
    counts = c;
    try { chrome.runtime.sendMessage({ type: "relh-counts", counts: c, enabled: settings.enabled }); } catch (e) {}
    schedule();
  }

  let scanTimer = 0;
  function queueScan() {
    if (!scanTimer) scanTimer = setTimeout(scan, 350);
  }

  /* ---------- measuring ---------- */

  function isShown(rec) {
    if (rec.force) return true;
    if (rec.internal && !settings.internal) return false;
    return !settings.hidden[rec.cls];
  }

  function parentOf(el) {
    if (el.parentElement) return el.parentElement;
    const root = el.getRootNode();
    return root && root.host ? root.host : null;
  }

  // Ancestors that can cut the link off (scroll boxes, carousels, closed accordions).
  function clippersOf(el) {
    const list = [];
    let p = parentOf(el);
    let pos = getComputedStyle(el).position;
    while (p && p !== document.documentElement) {
      if (pos === "fixed") break;
      let c = clipCache.get(p);
      if (!c) {
        const cs = getComputedStyle(p);
        c = { clip: (cs.overflowX !== "visible" || cs.overflowY !== "visible") && cs.display !== "contents", pos: cs.position };
        clipCache.set(p, c);
      }
      if (c.clip && p !== document.body) list.push(p);
      pos = c.pos;
      p = parentOf(p);
    }
    return list;
  }

  function coveredByBar(el, x, y) {
    const root = el.getRootNode();
    const scope = root && root.elementFromPoint ? root : document;
    let hit = scope.elementFromPoint(x, y);
    if (!hit || hit === el || el.contains(hit)) return false;
    while (hit && !hit.contains(el)) {
      const p = getComputedStyle(hit).position;
      if (p === "fixed" || p === "sticky") return true;
      hit = parentOf(hit);
    }
    return false;
  }

  function measure(rec, vw, vh) {
    const el = rec.el;
    if (!el.isConnected) return null;
    if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return null;

    let rects = [];
    for (const r of el.getClientRects()) if (r.width >= 2 && r.height >= 2) rects.push({ l: r.left, t: r.top, r: r.right, b: r.bottom });

    let kind = "text";
    const bigMedia = rec.media.some((m) => { const r = m.getBoundingClientRect(); return r.height >= 36 && r.width >= 36; });
    if (!rects.length || bigMedia || (rec.media.length && !rec.text)) kind = "box";
    else if (rects.length === 1) {
      if (!rec.fs) rec.fs = parseFloat(getComputedStyle(el).fontSize) || 16;
      if (rects[0].b - rects[0].t > rec.fs * 2) kind = "box";
    }

    if (kind === "box") {
      let b = null;
      const add = (r) => {
        if (r.width < 2 || r.height < 2) return;
        b = b ? { l: Math.min(b.l, r.left), t: Math.min(b.t, r.top), r: Math.max(b.r, r.right), b: Math.max(b.b, r.bottom) }
              : { l: r.left, t: r.top, r: r.right, b: r.bottom };
      };
      add(el.getBoundingClientRect());
      rec.media.forEach((m) => add(m.getBoundingClientRect()));
      if (!b) for (const c of el.children) add(c.getBoundingClientRect());
      if (!b) return null;
      rects = [b];
    } else {
      if (rects.length > 8) rects.length = 8;
      for (const r of rects) { r.l -= 2; r.r += 2; }
    }

    if (!rec.clips) rec.clips = clippersOf(el);
    for (const c of rec.clips) {
      const cr = c.getBoundingClientRect();
      rects = rects
        .map((r) => ({ l: Math.max(r.l, cr.left), t: Math.max(r.t, cr.top), r: Math.min(r.r, cr.right), b: Math.min(r.b, cr.bottom) }))
        .filter((r) => r.r - r.l >= 3 && r.b - r.t >= 3);
      if (!rects.length) return null;
    }

    const f = rects[0];
    const x = (f.l + f.r) / 2, y = (f.t + f.b) / 2;
    if (x >= 0 && y >= 0 && x < vw && y < vh && coveredByBar(el, x, y)) return null;
    return { kind, rects };
  }

  /* ---------- painting ---------- */

  function paint(rec, geo, ox, oy) {
    if (!geo) {
      if (rec.node) { rec.node.remove(); rec.node = null; rec.key = ""; }
      return;
    }
    const rs = geo.rects.map((r) => [
      Math.round((r.l - ox) * 2) / 2, Math.round((r.t - oy) * 2) / 2,
      Math.round((r.r - r.l) * 2) / 2, Math.round((r.b - r.t) * 2) / 2
    ]);
    const key = geo.kind + rec.cls + (rec.pulse ? "p" : "") + rs.join(";");
    if (key === rec.key) return;
    rec.key = key;
    let node = rec.node;
    if (!node) {
      node = rec.node = document.createElement("div");
      const tag = document.createElement("div");
      tag.className = "tag";
      node.appendChild(tag);
      layer.appendChild(node);
    }
    node.className = "m " + rec.cls + " " + geo.kind + (rec.pulse ? " pulse" : "");
    const tag = node.lastChild;
    while (node.childNodes.length - 1 > rs.length) node.firstChild.remove();
    while (node.childNodes.length - 1 < rs.length) {
      const d = document.createElement("div");
      d.className = "r";
      node.insertBefore(d, tag);
    }
    rs.forEach((r, i) => {
      node.childNodes[i].style.cssText = `left:${r[0]}px;top:${r[1]}px;width:${r[2]}px;height:${r[3]}px`;
    });
    tag.textContent = NAMES[rec.cls];
    // tags sit on the top edge, at the start of the link, so they never cover the words after it
    const first = rs[0];
    if (geo.kind === "box") tag.style.cssText = `left:${first[0] + 8}px;top:${first[1] - 7}px`;
    else tag.style.cssText = `left:${first[0]}px;top:${first[1] - 12.5}px`;
  }

  let raf = 0, soon = 0, rafBackup = 0;
  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(layout);
    // frames can stall (background tab, heavy page): never wait on them for long
    clearTimeout(rafBackup);
    rafBackup = setTimeout(() => { if (raf) { cancelAnimationFrame(raf); layout(); } }, 150);
  }
  function scheduleSoon() {
    if (!soon) soon = setTimeout(() => { soon = 0; schedule(); }, 90);
  }

  function layout() {
    raf = 0;
    if (!alive()) return;
    mount();
    layer.className = "layer s-" + settings.style + (settings.tags ? " tags" : "");
    if (!settings.enabled) {
      for (const rec of recs.values()) paint(rec, null);
      return;
    }
    const vw = innerWidth, vh = innerHeight;
    const jobs = [];
    for (const rec of recs.values()) {
      let geo = null;
      if (isShown(rec)) {
        // cheap pre-check: only links on or near the screen get measured properly
        const b = rec.el.getBoundingClientRect();
        const near = b.bottom > -250 && b.top < vh + 250 && b.right > -250 && b.left < vw + 250;
        if (near || (!b.width && !b.height && rec.media.length)) geo = measure(rec, vw, vh);
      }
      jobs.push(rec, geo);
    }
    const o = layer.getBoundingClientRect();
    for (let i = 0; i < jobs.length; i += 2) paint(jobs[i], jobs[i + 1], o.left, o.top);
  }

  /* ---------- hover details ---------- */

  let tipRec = null, tipTimer = 0;

  function el(tagName, cls, text) {
    const n = document.createElement(tagName);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function showTip(rec) {
    tipRec = rec;
    tip.textContent = "";
    tip.style.setProperty("--c", { follow: "#12824f", nofollow: "#d93a32", ugc: "#b87400", sponsored: "#6D00F8", internal: "#016DFF" }[rec.cls]);

    const head = el("div", "th");
    head.append(el("span", "tt", NAMES[rec.type]), el("span", "ts", rec.internal ? "Internal link" : "External link"));
    tip.append(head);
    tip.append(el("div", "host", rec.url.hostname.replace(/^www\./, "")));
    const path = rec.url.pathname + rec.url.search + rec.url.hash;
    if (path && path !== "/") tip.append(el("div", "path", path));

    const rel = el("div", "rel");
    if (rec.rel.length) {
      rel.append(el("span", "", "rel"));
      rec.rel.forEach((t) => rel.append(el("b", HINTS.has(t) ? "k" : "", t)));
    } else {
      rel.append(el("span", "", "No rel attribute, so it counts as a follow link"));
    }
    tip.append(rel);

    const notes = [];
    if (rec.el.target === "_blank") notes.push("Opens in a new tab");
    if (rec.media.length && !rec.text) {
      const img = rec.media.find((m) => m.tagName === "IMG");
      notes.push(img && img.alt ? "Image link, alt “" + img.alt.slice(0, 60) + "”" : "Image link with no alt text");
    }
    if (rec.url.protocol === "http:") notes.push("Not secure (http)");
    if (notes.length) tip.append(el("div", "notes", notes.join(" · ")));
    if (pageNofollow) tip.append(el("div", "warn", "This page has a robots nofollow tag, so every link here is treated as nofollow."));

    placeTip();
    tip.classList.add("on");
  }

  function placeTip() {
    if (!tipRec) return;
    const rects = tipRec.el.getClientRects();
    const r = rects.length ? rects[0] : tipRec.el.getBoundingClientRect();
    const full = tipRec.el.getBoundingClientRect();
    const a = full.height > 2 ? full : r;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = Math.min(Math.max(8, r.left), innerWidth - w - 8);
    let y = a.bottom + 9;
    if (y + h > innerHeight - 8) y = Math.max(8, a.top - h - 9);
    tip.style.left = Math.round(x) + "px";
    tip.style.top = Math.round(y) + "px";
  }

  function hideTip() {
    clearTimeout(tipTimer);
    tipRec = null;
    tip.classList.remove("on");
  }

  function linkFromEvent(e) {
    const path = e.composedPath ? e.composedPath() : [e.target];
    for (const n of path) {
      const rec = recs.get(n);
      if (rec) return rec;
      if (n === document) break;
    }
    return null;
  }

  document.addEventListener("mouseover", (e) => {
    if (!settings.enabled || !settings.tooltip) return;
    const rec = linkFromEvent(e);
    if (rec === tipRec) return;
    clearTimeout(tipTimer);
    if (!rec || !isShown(rec)) { if (tipRec) hideTip(); return; }
    tipTimer = setTimeout(() => showTip(rec), tipRec ? 0 : 140);
  }, true);
  document.documentElement.addEventListener("mouseleave", hideTip);
  document.addEventListener("mousedown", hideTip, true);

  /* ---------- keeping in step with the page ---------- */

  addEventListener("scroll", () => { if (tipRec) hideTip(); schedule(); }, { capture: true, passive: true });
  addEventListener("resize", schedule, { passive: true });
  addEventListener("load", schedule, true); // images and frames finishing
  document.addEventListener("transitionend", schedule, true);
  document.addEventListener("animationend", schedule, true);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
  setInterval(() => { if (!alive()) return; if (!document.hidden && settings.enabled) schedule(); }, 1200);

  // single-page apps: the URL changes without a reload
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) { lastUrl = location.href; queueScan(); }
  }, 800);

  /* ---------- settings and messages ---------- */

  function applySettings(s) {
    settings = { ...DEFAULTS, ...s, hidden: { ...(s.hidden || {}) } };
    if (!settings.enabled || !settings.tooltip) hideTip();
    try { chrome.runtime.sendMessage({ type: "relh-counts", counts, enabled: settings.enabled }); } catch (e) {}
    schedule();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const next = { ...settings };
    for (const k in changes) if (k in DEFAULTS) next[k] = changes[k].newValue === undefined ? DEFAULTS[k] : changes[k].newValue;
    applySettings(next);
  });

  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (!msg) return;
    if (msg.type === "relh-get") {
      respond({ counts, settings, pageNofollow, host: location.hostname });
    } else if (msg.type === "relh-rescan") {
      scan();
      respond({ counts, settings, pageNofollow, host: location.hostname });
    } else if (msg.type === "relh-links") {
      const list = [];
      for (const rec of recs.values()) {
        if (list.length >= 3000) break;
        list.push({
          id: rec.id, type: rec.type, internal: rec.internal, href: rec.url.href,
          host: rec.url.hostname.replace(/^www\./, ""), rel: rec.rel.join(" "),
          text: rec.text.slice(0, 140) || (rec.media.length ? "Image link" : ""),
          blank: rec.el.target === "_blank"
        });
      }
      respond({ links: list });
    } else if (msg.type === "relh-jump") {
      const rec = byId.get(msg.id);
      if (rec && rec.el.isConnected) {
        rec.el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
        rec.force = rec.pulse = true;
        rec.key = "";
        schedule();
        clearTimeout(rec.pulseTimer);
        rec.pulseTimer = setTimeout(() => { rec.force = rec.pulse = false; rec.key = ""; schedule(); }, 2600);
      }
      respond({ ok: !!rec });
    }
  });

  if (chrome.__dev) window.__rl = { layer, tip, recs, measure, layout }; // dev/test.html only

  function init() {
    chrome.storage.local.get(DEFAULTS, (s) => {
      applySettings(s || DEFAULTS);
      scan();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
