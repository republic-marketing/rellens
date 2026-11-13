/* RelLens — popup */
const $ = (id) => document.getElementById(id);
const DEFAULTS = { enabled: true, style: "line", tags: false, tooltip: true, internal: false, hidden: {} };
const TYPES = [
  ["follow", "Follow", "Passes authority to the other site"],
  ["nofollow", "Nofollow", "Asks search engines not to count it"],
  ["ugc", "UGC", "Added by users, such as comments"],
  ["sponsored", "Sponsored", "Paid or affiliate placement"],
  ["internal", "Internal", "Links within this site"]
];
const NAME = Object.fromEntries(TYPES.map((t) => [t[0], t[1]]));
const TICK = '<svg viewBox="0 0 10 10"><path d="M2 5.3l2.1 2.1L8 3"/></svg>';
const num = (n) => (n || 0).toLocaleString();
const plural = (n, one, many) => num(n) + " " + (n === 1 ? one : many);

let tabId = null;
let settings = { ...DEFAULTS };
let counts = {};
let links = null;
let view = "overview";

function send(msg, cb) {
  if (tabId == null) return cb && cb(null);
  chrome.tabs.sendMessage(tabId, msg, (resp) => {
    if (chrome.runtime.lastError) return cb && cb(null);
    cb && cb(resp);
  });
}

function save(patch) {
  settings = { ...settings, ...patch };
  chrome.storage.local.set(patch);
  renderSettings();
  renderTypes();
}

/* ---------- overview ---------- */

function buildTypes() {
  const ul = $("types");
  ul.textContent = "";
  for (const [key, name, desc] of TYPES) {
    const li = document.createElement("li");
    li.dataset.t = key;
    const b = document.createElement("button");
    b.innerHTML = `<span class="tile">0</span><span class="txt"><b><span class="hl"></span></b><span class="d"></span></span><span class="box">${TICK}</span>`;
    b.querySelector(".hl").textContent = name;
    b.querySelector(".d").textContent = desc;
    b.addEventListener("click", () => {
      const hidden = { ...settings.hidden, [key]: !settings.hidden[key] };
      save({ hidden });
    });
    li.appendChild(b);
    ul.appendChild(li);
  }
}

function renderTypes() {
  for (const li of $("types").children) {
    const key = li.dataset.t;
    li.hidden = key === "internal" && !settings.internal;
    const b = li.firstChild;
    b.setAttribute("aria-pressed", String(!settings.hidden[key]));
    b.title = (settings.hidden[key] ? "Show " : "Hide ") + NAME[key].toLowerCase() + " links on the page";
    const tile = b.querySelector(".tile");
    tile.textContent = num(counts[key]);
    tile.classList.toggle("sm", (counts[key] || 0) > 999);
  }
}

function renderCta() {
  const back = view === "links";
  $("cta").classList.toggle("back", back);
  $("cta-text").textContent = back ? "Back to overview" : "View all " + plural(counts.external || 0, "link", "links");
}

function renderCounts(resp) {
  counts = resp.counts || {};
  const ext = counts.external || 0;
  const held = (counts.nofollow || 0) + (counts.ugc || 0) + (counts.sponsored || 0);
  $("headline").textContent = ext === 0 ? "No links leave this page" : ext === 1 ? "1 link leaves this page" : num(ext) + " links leave this page";
  $("sub").textContent =
    (ext ? (held ? (held === 1 ? "1 passes no authority. " : num(held) + " pass no authority. ") : "All of them pass authority. ") : "") +
    plural(counts.domains || 0, "domain", "domains") + ", " + plural(counts.internal || 0, "internal link", "internal links") + ".";

  const notes = [];
  if (resp.pageNofollow) notes.push("This page has a robots nofollow tag, so search engines treat every link on it as nofollow.");
  if (counts.internalNofollow) {
    notes.push(counts.internalNofollow === 1 ? "1 internal link is marked nofollow." : counts.internalNofollow + " internal links are marked nofollow.");
  }
  $("notice").hidden = !notes.length;
  $("notice").textContent = notes.join(" ");
  renderTypes();
  renderCta();
}

function renderSettings() {
  document.body.classList.toggle("off", !settings.enabled);
  $("enabled").checked = settings.enabled;
  $("tooltip").checked = settings.tooltip;
  $("tags").checked = settings.tags;
  $("internal").checked = settings.internal;
  for (const b of $("style").children) b.setAttribute("aria-checked", String(b.dataset.v === settings.style));
}

/* ---------- links view ---------- */

function visibleLinks() {
  const q = $("q").value.trim().toLowerCase();
  const f = $("filter").value;
  return (links || []).filter((l) => {
    if (f === "external" && l.internal) return false;
    if (f === "internal" && !l.internal) return false;
    if (NAME[f] && f !== "internal" && (l.internal || l.type !== f)) return false;
    if (!q) return true;
    return (l.text + " " + l.href + " " + l.rel + " " + l.type).toLowerCase().includes(q);
  });
}

function renderList() {
  const ul = $("list");
  ul.textContent = "";
  const rows = visibleLinks();
  $("list-n").textContent = plural(rows.length, "link", "links");
  if (!rows.length) {
    const li = document.createElement("li");
    li.className = "none";
    li.textContent = links ? "No links match." : "Reading links";
    ul.appendChild(li);
    return;
  }
  const frag = document.createDocumentFragment();
  for (const l of rows.slice(0, 400)) {
    const li = document.createElement("li");
    li.dataset.t = l.internal && l.type === "follow" ? "internal" : l.type;
    const b = document.createElement("button");
    b.title = l.href + (l.rel ? '\nrel="' + l.rel + '"' : "");
    const t = document.createElement("span"); t.className = "t"; t.textContent = l.text || l.href;
    const h = document.createElement("span"); h.className = "h";
    let path = "";
    try { const u = new URL(l.href); path = u.pathname === "/" ? "" : u.pathname; } catch (e) {}
    h.textContent = l.host + path;
    const k = document.createElement("span"); k.className = "k hl"; k.textContent = NAME[li.dataset.t];
    b.append(t, k, h);
    b.addEventListener("click", () => send({ type: "relh-jump", id: l.id }));
    li.appendChild(b);
    frag.appendChild(li);
  }
  ul.appendChild(frag);
}

function loadLinks() {
  send({ type: "relh-links" }, (resp) => {
    links = resp ? resp.links : [];
    renderList();
  });
}

function csv() {
  const esc = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  const rows = [["Type", "Scope", "Anchor text", "URL", "Domain", "rel", "New tab"]];
  for (const l of visibleLinks()) {
    rows.push([NAME[l.type], l.internal ? "Internal" : "External", l.text, l.href, l.host, l.rel, l.blank ? "yes" : "no"]);
  }
  return rows.map((r) => r.map(esc).join(",")).join("\r\n");
}

function flash(btn, text) {
  const old = btn.textContent;
  btn.textContent = text;
  setTimeout(() => (btn.textContent = old), 1200);
}

/* ---------- wiring ---------- */

function showView(name) {
  view = name;
  $("overview").hidden = name !== "overview";
  $("links").hidden = name !== "links";
  renderCta();
  if (name === "links") { if (!links) loadLinks(); $("q").focus(); }
}

// If the files on disk are newer than what Chrome has loaded, reload the extension.
// Chrome keeps running the old background and page scripts until this happens.
function selfUpdate() {
  if (!chrome.runtime.getManifest) return;
  fetch(chrome.runtime.getURL("manifest.json"), { cache: "no-store" }).then((r) => r.json()).then((m) => {
    if (m.version !== chrome.runtime.getManifest().version) {
      $("host").textContent = "Updating to " + m.version;
      setTimeout(() => chrome.runtime.reload(), 350);
    }
  }).catch(() => {});
}

let injected = false;
function refresh(type) {
  send({ type: type || "relh-get" }, (resp) => {
    // RelLens runs only when asked: opening the popup is the ask, so start the scan on this tab now.
    if (!resp && !injected && tabId != null && chrome.scripting) {
      injected = true;
      // a fresh scan always shows its highlights, even if they were hidden on the last page
      if (!settings.enabled) { settings.enabled = true; chrome.storage.local.set({ enabled: true }); renderSettings(); }
      chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] })
        .then(() => setTimeout(() => refresh(type), 300))
        .catch(() => refresh(type));
      return;
    }
    if (!resp) {
      $("unsupported").hidden = false;
      $("overview").hidden = $("links").hidden = $("say").hidden = true;
      $("host").textContent = "Not available on this tab";
      return;
    }
    $("host").textContent = (resp.host || "").replace(/^www\./, "");
    renderCounts(resp);
  });
}

selfUpdate();
buildTypes();
$("cta").addEventListener("click", () => showView(view === "links" ? "overview" : "links"));
$("enabled").addEventListener("change", (e) => save({ enabled: e.target.checked }));
$("tooltip").addEventListener("change", (e) => save({ tooltip: e.target.checked }));
$("tags").addEventListener("change", (e) => save({ tags: e.target.checked }));
$("internal").addEventListener("change", (e) => save({ internal: e.target.checked }));
for (const b of $("style").children) b.addEventListener("click", () => save({ style: b.dataset.v }));
$("q").addEventListener("input", renderList);
$("filter").addEventListener("change", renderList);
$("rescan").addEventListener("click", () => { links = null; refresh("relh-rescan"); if (view === "links") loadLinks(); flash($("rescan"), "Rescanned"); });
$("copy").addEventListener("click", () => {
  const text = visibleLinks().map((l) => NAME[l.type] + "\t" + l.href + "\t" + l.text).join("\n");
  navigator.clipboard.writeText(text).then(() => flash($("copy"), "Copied"));
});
$("csv").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv()], { type: "text/csv" }));
  a.download = "rellens-" + ($("host").textContent || "links") + ".csv";
  a.click();
  flash($("csv"), "Saved");
});

chrome.storage.local.get(DEFAULTS, (s) => {
  settings = { ...DEFAULTS, ...s, hidden: { ...(s.hidden || {}) } };
  renderSettings();
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    tabId = tabs && tabs[0] ? tabs[0].id : null;
    refresh();
  });
});
