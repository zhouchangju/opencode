// Ported from elec-claw htmlLivePreview.ts
// Adapted for opencode's Solid.js architecture

const SANDBOX =
  "allow-scripts allow-forms allow-modals allow-popups allow-downloads"
const MIN_HEIGHT = 120
const MAX_HEIGHT = 1000

// Edge-aware scroll forwarder: only forwards wheel/touch to parent when
// iframe cannot consume the scroll in that direction.
const SCROLL_FORWARDER = `
function _canScrollY(dy) {
  var de = document.documentElement;
  if (!de || !dy) return false;
  if (dy > 0) return de.scrollTop + de.clientHeight < de.scrollHeight - 1;
  return de.scrollTop > 0;
}
function _canScrollX(dx) {
  var de = document.documentElement;
  if (!de || !dx) return false;
  if (dx > 0) return de.scrollLeft + de.clientWidth < de.scrollWidth - 1;
  return de.scrollLeft > 0;
}
window.addEventListener('wheel', function(e){
  if (_canScrollY(e.deltaY) || _canScrollX(e.deltaX)) return;
  try { parent.postMessage({ __htmlLive: true, type: 'wheel', dx: e.deltaX, dy: e.deltaY }, '*'); } catch (_) {}
  e.preventDefault();
}, { passive: false, capture: true });
var _lastTouchY = 0, _lastTouchX = 0;
window.addEventListener('touchstart', function(e){
  if (e.touches && e.touches.length === 1) {
    _lastTouchY = e.touches[0].clientY;
    _lastTouchX = e.touches[0].clientX;
  }
}, { passive: true, capture: true });
window.addEventListener('touchmove', function(e){
  if (!e.touches || e.touches.length !== 1) return;
  var ty = e.touches[0].clientY, tx = e.touches[0].clientX;
  var dy = _lastTouchY - ty, dx = _lastTouchX - tx;
  _lastTouchY = ty; _lastTouchX = tx;
  if (_canScrollY(dy) || _canScrollX(dx)) return;
  try { parent.postMessage({ __htmlLive: true, type: 'wheel', dx: dx, dy: dy }, '*'); } catch (_) {}
  e.preventDefault();
}, { passive: false, capture: true });
`

// Height tracker: ResizeObserver + timeouts, reports height via postMessage.
// Injected at the end of final srcdoc.
const HEIGHT_TRACKER_TAG = `<script>
(function(){
  var lastH = 0;
  function reportHeight(){
    try {
      var de = document.documentElement;
      var saved = de.style.height;
      de.style.height = '0';
      var h = document.body ? Math.ceil(document.body.scrollHeight) : 0;
      de.style.height = saved;
      if (h && h !== lastH) {
        lastH = h;
        parent.postMessage({ __htmlLive: true, type: 'h', h: h }, '*');
      }
    } catch (e) {}
  }
  try {
    var ro = new ResizeObserver(reportHeight);
    if (document.body) ro.observe(document.body);
  } catch (e) {}
  window.addEventListener('load', reportHeight);
  setTimeout(reportHeight, 0);
  setTimeout(reportHeight, 50);
  setTimeout(reportHeight, 200);
  ${SCROLL_FORWARDER}
})();
<\/script>`

const PARTIAL_THROTTLE_MS = 60
const SCRIPT_TAG_REGEX = /<script\b[\s\S]*?<\/script\s*>/gi

const stripScripts = (html: string) =>
  String(html || "").replace(SCRIPT_TAG_REGEX, "")

// Baseline dark theme CSS injected at <head> start. LLM's own <style>
// is parsed afterwards and naturally overrides this.
const THEME_PREFACE = `<style id="elec-claw-theme">
:root{
  --ui-fg:#e0e0e0;--ui-muted:#888;--ui-border:#333;
  --ui-bg:#1a1a1a;--ui-surface:#222;
  --ui-accent:#7ea9ff;--ui-radius:8px;
  --ui-font:-apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue",sans-serif;
  --ui-mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  color-scheme:dark;
}
*{box-sizing:border-box}
html,body{margin:0;padding:16px;background:transparent;color:var(--ui-fg);font-family:var(--ui-font);font-size:14px;line-height:1.55}
h1,h2,h3,h4{color:var(--ui-fg);margin:0 0 12px;font-weight:600}
p{margin:0 0 12px}
small,.muted{color:var(--ui-muted)}
hr{border:none;border-top:1px solid var(--ui-border);margin:16px 0}
a{color:var(--ui-accent);text-decoration:none}
a:hover{text-decoration:underline}
button{background:var(--ui-surface);border:1px solid var(--ui-border);color:var(--ui-fg);border-radius:var(--ui-radius);padding:8px 14px;font:inherit;cursor:pointer;transition:background .15s ease}
button:hover{background:rgba(255,255,255,0.08)}
button[disabled]{opacity:.5;cursor:not-allowed}
input[type=text],input[type=number],input[type=search],input[type=email],input[type=password],input[type=tel],input[type=url],select,textarea{background:var(--ui-surface);border:1px solid var(--ui-border);color:var(--ui-fg);border-radius:var(--ui-radius);padding:8px 10px;font:inherit;outline:none}
input:focus,select:focus,textarea:focus{border-color:var(--ui-accent)}
input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:4px;background:var(--ui-border);border-radius:2px;outline:none;padding:0}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:var(--ui-fg);cursor:pointer;border:none}
input[type=checkbox],input[type=radio]{accent-color:var(--ui-accent)}
[role=tab],.tab{background:transparent;border:1px solid var(--ui-border);color:var(--ui-fg);border-radius:var(--ui-radius);padding:8px 16px;cursor:pointer;font:inherit}
[role=tab][aria-selected="true"],.tab.active,.tab[aria-selected="true"]{background:rgba(255,255,255,0.06)}
table{border-collapse:collapse;width:100%}
th,td{padding:8px 10px;border-bottom:1px solid var(--ui-border);text-align:left}
th{font-weight:600;color:var(--ui-muted)}
code,pre,kbd{font-family:var(--ui-mono);font-size:.92em}
pre{background:var(--ui-surface);border:1px solid var(--ui-border);border-radius:var(--ui-radius);padding:10px 12px;overflow:auto}
code{background:var(--ui-surface);padding:1px 6px;border-radius:4px}
::selection{background:rgba(126,169,255,0.3)}
::-webkit-scrollbar{width:8px;height:8px}
::-webkit-scrollbar-thumb{background:var(--ui-border);border-radius:4px}
::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,0.15)}
</style>`

// Enforcement: !important floor injected at <body> start. Only locks 4
// critical properties so LLM can still design freely inside.
const ENFORCEMENT_BASE = `html,body{background:transparent!important;color:var(--ui-fg)!important;font-family:var(--ui-font)!important}
body{font-size:14px!important;margin:0!important}
::-webkit-scrollbar{width:8px!important;height:8px!important}
::-webkit-scrollbar-thumb{background:var(--ui-border)!important;border-radius:4px!important}`

// Partial-only: kill animation/transition + suppress pointer-events.
const ENFORCEMENT_PARTIAL_EXTRA = `*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;animation-iteration-count:1!important;transition-duration:0s!important;transition-delay:0s!important;pointer-events:none!important}`

const THEME_ENFORCEMENT_PARTIAL = `<style id="elec-claw-enforcement">
${ENFORCEMENT_BASE}
${ENFORCEMENT_PARTIAL_EXTRA}
</style>`

const THEME_ENFORCEMENT_FINAL = `<style id="elec-claw-enforcement">
${ENFORCEMENT_BASE}
</style>`

// ---- HTML injection helpers ----

const HEAD_OPEN_REGEX = /<head\b[^>]*>/i
const HTML_OPEN_REGEX = /<html\b[^>]*>/i
const BODY_OPEN_REGEX = /<body\b[^>]*>/i
const PARTIAL_READY_REGEX = /<\/head\s*>|<body\b/i

function injectThemePreface(html: string): string {
  const src = String(html || "")
  const headMatch = src.match(HEAD_OPEN_REGEX)
  if (headMatch) {
    const at = headMatch.index! + headMatch[0].length
    return `${src.slice(0, at)}${THEME_PREFACE}${src.slice(at)}`
  }
  const htmlMatch = src.match(HTML_OPEN_REGEX)
  if (htmlMatch) {
    const at = htmlMatch.index! + htmlMatch[0].length
    return `${src.slice(0, at)}<head>${THEME_PREFACE}</head>${src.slice(at)}`
  }
  return `${THEME_PREFACE}${src}`
}

function injectBodyEnforcement(
  html: string,
  options: { final?: boolean } = {},
): string {
  const enforcement = options.final
    ? THEME_ENFORCEMENT_FINAL
    : THEME_ENFORCEMENT_PARTIAL
  const src = String(html || "")
  const m = src.match(BODY_OPEN_REGEX)
  if (m) {
    const at = m.index! + m[0].length
    return `${src.slice(0, at)}${enforcement}${src.slice(at)}`
  }
  return `${enforcement}${src}`
}

function injectHeightTracker(html: string): string {
  if (!html) return HEIGHT_TRACKER_TAG
  const idx = html.toLowerCase().lastIndexOf("</body>")
  if (idx >= 0) {
    return `${html.slice(0, idx)}${HEIGHT_TRACKER_TAG}${html.slice(idx)}`
  }
  return `${html}${HEIGHT_TRACKER_TAG}`
}

// ---- Partial rendering ----

function isPartialReady(html: string): boolean {
  return PARTIAL_READY_REGEX.test(String(html || ""))
}

const PARTIAL_SKELETON = `<!doctype html><html><head></head><body><div class="elec-skeleton"><div class="bar"></div><div class="bar"></div><div class="bar short"></div><div class="hint">Generating HTML…</div></div><style>
.elec-skeleton{padding:8px 0}
.elec-skeleton .bar{height:14px;margin:8px 0;background:var(--ui-surface);border-radius:6px;animation:elec-pulse 1.4s ease-in-out infinite}
.elec-skeleton .bar.short{width:40%}
.elec-skeleton .hint{color:var(--ui-muted);margin-top:12px;font-size:12px}
@keyframes elec-pulse{0%,100%{opacity:.5}50%{opacity:.95}}
</style></body></html>`

function preparePartialHtml(html: string): string {
  if (isPartialReady(html)) {
    return injectBodyEnforcement(html)
  }
  // HTML without </head> or <body> — wrap content in a basic body structure
  return injectBodyEnforcement(`<body>${html}</body>`)
}

// iframe bootstrap for streaming partials: navigates once, then each
// subsequent frame is delivered via postMessage using DOMParser sync.
const PARTIAL_BOOTSTRAP = `<!doctype html><html><head><meta charset="utf-8">
${THEME_PREFACE}
</head><body><script>
(function(){
  var lastH = 0;
  function reportHeight(){
    try {
      var de = document.documentElement;
      var saved = de.style.height;
      de.style.height = '0';
      var h = document.body ? Math.ceil(document.body.scrollHeight) : 0;
      de.style.height = saved;
      if (h && h !== lastH) {
        lastH = h;
        parent.postMessage({ __htmlLive: true, type: 'h', h: h }, '*');
      }
    } catch (e) {}
  }
  var lastHeadKey = '';
  function applyPartial(htmlStr){
    try {
      var doc = new DOMParser().parseFromString(String(htmlStr || ''), 'text/html');
      var theme = document.getElementById('elec-claw-theme');
      var themeOuter = theme ? theme.outerHTML : '';
      var docHeadInner = doc.head ? doc.head.innerHTML : '';
      var newHeadKey = themeOuter + docHeadInner;
      var bodyNodes = doc.body ? Array.prototype.slice.call(doc.body.childNodes) : [];
      requestAnimationFrame(function(){
        if (newHeadKey !== lastHeadKey) {
          var tpl = document.createElement('template');
          tpl.innerHTML = newHeadKey;
          document.head.replaceChildren.apply(
            document.head,
            Array.prototype.slice.call(tpl.content.childNodes)
          );
          lastHeadKey = newHeadKey;
        }
        document.body.replaceChildren.apply(document.body, bodyNodes);
        reportHeight();
      });
    } catch (err) {}
  }
  window.addEventListener('message', function(e){
    var d = e.data || {};
    if (!d || d.__htmlLive !== true) return;
    if (d.type === 'partial') applyPartial(d.html);
  });
  try {
    var ro = new ResizeObserver(reportHeight);
    if (document.body) ro.observe(document.body);
  } catch (err) {}
  ${SCROLL_FORWARDER}
  parent.postMessage({ __htmlLive: true, type: 'ready' }, '*');
})();
<\/script></body></html>`

// ---- Cache & parent listener ----

interface CacheEntry {
  iframe: HTMLIFrameElement
  ready: boolean
  pendingMessage: Record<string, unknown> | null
  lastFinalHtml: string | null
  lastPartialHtml: string | null
  lastAppliedPartial: string | null
  pendingPartialHtml: string | null
  partialTimer: ReturnType<typeof setTimeout> | null
  lastHeight: number
}

const cache = new Map<string, CacheEntry>()
let parentListenerAttached = false

function ensureParentListener() {
  if (parentListenerAttached) return
  parentListenerAttached = true
  window.addEventListener("message", (e: MessageEvent) => {
    const data = e.data
    if (!data || data.__htmlLive !== true) return
    for (const entry of cache.values()) {
      if (entry.iframe?.contentWindow !== e.source) continue
      if (data.type === "h") {
        const raw = Math.ceil(Number(data.h) || MIN_HEIGHT)
        const h = Math.min(Math.max(MIN_HEIGHT, raw), MAX_HEIGHT)
        if (Math.abs(h - entry.lastHeight) < 2) break
        entry.iframe.style.height = `${h}px`
        entry.lastHeight = h
        const overflowing = raw > MAX_HEIGHT
        entry.iframe.style.overflowY = overflowing ? "auto" : "hidden"
      } else if (data.type === "ready") {
        entry.ready = true
        if (entry.pendingMessage) {
          try {
            entry.iframe.contentWindow?.postMessage(entry.pendingMessage, "*")
          } catch (_) {
            /* ignore */
          }
          entry.pendingMessage = null
        }
      } else if (data.type === "wheel") {
        const feed =
          entry.iframe.closest?.("[data-slot='session-turn-content']") ??
          document.querySelector("[data-slot='session-turn-content']")
        if (feed) {
          ;(feed as HTMLElement).scrollBy({
            left: Number(data.dx) || 0,
            top: Number(data.dy) || 0,
            behavior: "auto" as ScrollBehavior,
          })
        }
      }
      break
    }
  })
}

function sendOrQueue(entry: CacheEntry, msg: Record<string, unknown>) {
  if (entry.ready && entry.iframe?.contentWindow) {
    try {
      entry.iframe.contentWindow.postMessage(msg, "*")
      return
    } catch (_) {
      /* fall through */
    }
  }
  entry.pendingMessage = msg
}

// ---- Partial scheduling ----

function applyPartial(entry: CacheEntry) {
  const next = entry.pendingPartialHtml
  if (next === null || next === undefined) return
  if (next === entry.lastAppliedPartial) {
    entry.pendingPartialHtml = null
    return
  }
  entry.pendingPartialHtml = null
  entry.lastAppliedPartial = next
  sendOrQueue(entry, { __htmlLive: true, type: "partial", html: next })
}

function schedulePartial(entry: CacheEntry, html: string) {
  entry.pendingPartialHtml = preparePartialHtml(html)
  if (entry.partialTimer) return
  applyPartial(entry)
  entry.partialTimer = setTimeout(() => {
    entry.partialTimer = null
    if (entry.lastFinalHtml !== null) return
    applyPartial(entry)
  }, PARTIAL_THROTTLE_MS)
}

function cancelPartialTimer(entry: CacheEntry) {
  if (entry.partialTimer) {
    clearTimeout(entry.partialTimer)
    entry.partialTimer = null
  }
  entry.pendingPartialHtml = null
}

// ---- iframe creation ----

function createIframe(initialSrcdoc: string): HTMLIFrameElement {
  const iframe = document.createElement("iframe")
  iframe.className = "html-live-iframe"
  iframe.title = "HTML live preview"
  iframe.setAttribute("sandbox", SANDBOX)
  iframe.setAttribute("referrerpolicy", "no-referrer")
  iframe.setAttribute("loading", "lazy")
  iframe.style.width = "100%"
  iframe.style.border = "0"
  iframe.style.overflow = "hidden"
  iframe.style.minHeight = `${MIN_HEIGHT}px`
  iframe.style.maxHeight = `${MAX_HEIGHT}px`
  iframe.srcdoc = initialSrcdoc
  return iframe
}

function setStreaming(panel: Element | null, on: boolean) {
  if (!panel) return
  const was = panel.classList.contains("is-streaming")
  if (on === was) return
  panel.classList.toggle("is-streaming", on)
  if (on) panel.setAttribute("aria-busy", "true")
  else panel.removeAttribute("aria-busy")
}

// ---- Main hydrate function ----

export type HtmlLiveBlockMap = Map<number, { html: string }>

export function hydrateHtmlLiveBlocks(
  root: Element | undefined | null,
  blocks: HtmlLiveBlockMap,
  options: { final?: boolean; host?: Element | null } = {},
) {
  if (!root || typeof root.querySelectorAll !== "function") return
  const final = Boolean(options.final)
  const host = options.host || null
  ensureParentListener()

  const placeholders = root.querySelectorAll(".html-live-block")
  if (!placeholders.length) return

  placeholders.forEach((block, idx) => {
    const id = buildPreviewId(block, idx)
    ;(block as HTMLElement).dataset.previewId = id

    const blockIdx = Number(block.getAttribute("data-block-idx"))
    const html = blocks.get(blockIdx)?.html ?? ""
    if (!html) return

    let entry = cache.get(id)
    if (!entry) {
      // First sighting: create iframe
      const initialDoc = final
        ? injectHeightTracker(
            injectBodyEnforcement(injectThemePreface(html), { final: true }),
          )
        : PARTIAL_BOOTSTRAP
      const iframe = createIframe(initialDoc)
      iframe.dataset.previewId = id
      entry = {
        iframe,
        ready: false,
        pendingMessage: null,
        lastFinalHtml: final ? html : null,
        lastPartialHtml: final ? null : html,
        lastAppliedPartial: null,
        pendingPartialHtml: null,
        partialTimer: null,
        lastHeight: 0,
      }
      cache.set(id, entry)
      ;(host || block).appendChild(entry.iframe)
      setStreaming(host || block, !final)
      if (!final) {
        entry.pendingPartialHtml = preparePartialHtml(html)
        applyPartial(entry)
      }
      return
    }

    // Reuse existing entry
    const existingHost =
      entry.iframe.parentElement?.classList?.contains(
        "html-live-iframes-host",
      ) ||
      entry.iframe.parentElement?.getAttribute("data-component") ===
        "html-live-iframes-host"
        ? entry.iframe.parentElement
        : null
    const effectiveHost = (host as Element | null) || existingHost || null
    if (effectiveHost) {
      if (entry.iframe.parentElement !== effectiveHost)
        effectiveHost.appendChild(entry.iframe)
    } else {
      if (entry.iframe.parentElement !== block) block.appendChild(entry.iframe)
    }

    if (final) {
      setStreaming(effectiveHost || block, false)
      if (entry.lastFinalHtml === html) return
      cancelPartialTimer(entry)
      entry.lastFinalHtml = html
      entry.ready = false
      entry.pendingMessage = null
      // Rebuild iframe for final
      const newIframe = createIframe(
        injectHeightTracker(
          injectBodyEnforcement(injectThemePreface(html), { final: true }),
        ),
      )
      newIframe.dataset.previewId = id
      if (entry.lastHeight) newIframe.style.height = `${entry.lastHeight}px`
      if (entry.iframe.parentElement) {
        entry.iframe.parentElement.replaceChild(newIframe, entry.iframe)
      } else {
        ;(effectiveHost || block).appendChild(newIframe)
      }
      entry.iframe = newIframe
    } else {
      if (entry.lastFinalHtml !== null) return
      setStreaming(effectiveHost || block, true)
      if (entry.lastPartialHtml === html) return
      entry.lastPartialHtml = html
      schedulePartial(entry, html)
    }
  })
}

function buildPreviewId(block: Element, idx: number): string {
  const timelinePartId =
    block.closest("[data-timeline-part-id]")?.getAttribute(
      "data-timeline-part-id",
    ) || "global"
  return `${timelinePartId}-${idx}`
}

// ---- Cleanup ----

export function cleanupHtmlLiveBlocks(root: Element | undefined | null) {
  if (!root || typeof root.querySelectorAll !== "function") return
  const blocks = root.querySelectorAll(".html-live-block")
  blocks.forEach((block, idx) => {
    const id = buildPreviewId(block, idx)
    const entry = cache.get(id)
    if (!entry) return
    cancelPartialTimer(entry)
    entry.iframe.remove()
    cache.delete(id)
  })
}

// Testing exports
export const __htmlLivePreviewInternals = {
  cache,
  injectBodyEnforcement,
  isPartialReady,
  preparePartialHtml,
  THEME_ENFORCEMENT_PARTIAL,
  THEME_ENFORCEMENT_FINAL,
  PARTIAL_SKELETON,
}
