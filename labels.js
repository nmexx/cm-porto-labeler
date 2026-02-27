// labels.js — Label rendering + stamp extraction from Deutsche Post Internetmarke PDF

// ── Globals — must be first ───────────────────────────────────────────────────
const api = (typeof browser !== "undefined") ? browser : chrome;
let stampImages  = [];
let allResults   = [];
let a4Mode       = false;
let activeFilter = null;   // null = all; Set of 0-based indices when filtered

// ── PDF.js worker (bundled locally) ──────────────────────────────────────────
if (typeof pdfjsLib === "undefined") {
  document.getElementById("pdfStatus").textContent =
    "❌ PDF.js konnte nicht geladen werden. Bitte Seite neu laden.";
  document.getElementById("pdfInput").disabled = true;
} else {
  pdfjsLib.GlobalWorkerOptions.workerSrc = api.runtime.getURL("lib/pdf.worker.min.js");
}

// ── Debug box ────────────────────────────────────────────────────────────────
const D = document.getElementById("debugBox");
function log(msg) { D.textContent += "\n" + msg; }
window.onerror = (m, _s, l) => log(`ERROR: ${m} line:${l}`);

log("1. Script loaded");

// ── Load persisted data from storage ─────────────────────────────────────────
api.storage.local.get(["cachedResults", "returnAddress", "stampImages"], (data) => {
  log("2. Storage loaded");

  if (data.returnAddress) {
    const ra = data.returnAddress;
    document.getElementById("rName").value    = ra.name    || "";
    document.getElementById("rStreet").value  = ra.street  || "";
    document.getElementById("rCity").value    = ra.city    || "";
    document.getElementById("rCountry").value = ra.country || "Deutschland";
  }

  if (data.stampImages && data.stampImages.length > 0) {
    stampImages = data.stampImages;
    log(`3. ${stampImages.length} stamps from storage`);
    updateStampUI();
  } else {
    log("3. No stamps yet");
  }

  allResults = data.cachedResults || [];
  log(`4. ${allResults.length} orders`);

  if (allResults.length === 0) {
    document.getElementById("labelCount").textContent =
      "Keine Daten — bitte erst im Popup scrapen";
  } else {
    renderLabels();
  }
});

// ── PDF extraction — one stamp per page ──────────────────────────────────────
document.getElementById("pdfInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (typeof pdfjsLib === "undefined") return;

  log(`PDF: ${file.name}`);
  document.getElementById("pdfStatus").textContent = "⏳ Verarbeite PDF…";

  const reader = new FileReader();
  reader.onload = (ev) => {
    const pdfData = new Uint8Array(ev.target.result);
    pdfjsLib.getDocument({ data: pdfData }).promise.then((pdf) => {
      log(`PDF has ${pdf.numPages} pages (= ${pdf.numPages} stamps)`);
      document.getElementById("pdfStatus").textContent =
        `⏳ Rendere ${pdf.numPages} Seiten…`;

      stampImages = new Array(pdf.numPages);
      let rendered = 0;

      // Render all pages in parallel (each page = one stamp)
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        pdf.getPage(pageNum).then((page) => {
          const scale    = 3.0;
          const viewport = page.getViewport({ scale });
          const canvas   = document.createElement("canvas");
          canvas.width   = viewport.width;
          canvas.height  = viewport.height;

          page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise.then(() => {
            const cropCanvas = cropStampFromPage(canvas);
            stampImages[pageNum - 1] = cropCanvas.toDataURL("image/png");
            rendered++;
            log(`Page ${pageNum} rendered (${rendered}/${pdf.numPages})`);

            if (rendered === pdf.numPages) {
              const dbg = document.getElementById("stampDebugImg");
              if (dbg) { dbg.src = stampImages[0]; dbg.style.display = "block"; }
              document.getElementById("pdfStatus").textContent =
                `✅ ${stampImages.length} Briefmarken extrahiert`;
              api.storage.local.set({ stampImages }, () => {
                updateStampUI();
                renderLabels();
              });
            }
          });
        });
      }
    }, (err) => {
      log(`PDF error: ${err.message}`);
      document.getElementById("pdfStatus").textContent = `❌ ${err.message}`;
    });
  };
  reader.readAsArrayBuffer(file);
});

// ── Crop stamp from full Deutsche Post Internetmarke page ─────────────────────
// The PDF page is A6 landscape. The barcode sits on the left, the Deutsche Post
// logo + text on the right. Together the stamp content occupies roughly:
//   x: 27 %–72 %  →  cropX=0.27, cropW=0.45
//   y:  3 %–65 %  →  cropY=0.03, cropH=0.62
// Adjust CROP if your PDFs have a different layout.
const CROP = { x: 0.27, y: 0.03, w: 0.45, h: 0.62 };

function cropStampFromPage(canvas) {
  const W = canvas.width;
  const H = canvas.height;

  const cropX = Math.round(W * CROP.x);
  const cropY = Math.round(H * CROP.y);
  const cropW = Math.round(W * CROP.w);
  const cropH = Math.round(H * CROP.h);

  const out = document.createElement("canvas");
  out.width  = cropW;
  out.height = cropH;
  out.getContext("2d").drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
  return out;
}

// ── Stamp preview thumbnails ──────────────────────────────────────────────────
function updateStampUI() {
  const preview = document.getElementById("stampPreview");
  preview.replaceChildren();
  if (!stampImages.length) return;

  const wrap = document.createElement("div");
  wrap.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;";

  const visible = Math.min(stampImages.length, 8);
  for (let i = 0; i < visible; i++) {
    const img = document.createElement("img");
    img.src   = stampImages[i];      // base64 data: URI from user's own PDF
    img.title = `Stamp ${i + 1}`;
    img.style.cssText = "height:50px;border:1px solid #2e4057;border-radius:3px;background:#fff;";
    wrap.appendChild(img);
  }
  if (stampImages.length > 8) {
    const span = document.createElement("span");
    span.style.cssText = "color:#8a9bb5;font-size:11px;align-self:center;";
    span.textContent = `+${stampImages.length - 8} weitere`;
    wrap.appendChild(span);
  }
  preview.appendChild(wrap);
}

// ── Filter helpers ───────────────────────────────────────────────────────────
/**
 * Parse a human range string like "1-3, 5, 7" into a sorted array of
 * 0-based indices valid within [0, total).
 * Returns null if the string is empty/blank (= all).
 * Throws if any token is invalid.
 */
function parseRangeString(str, total) {
  str = str.trim();
  if (!str) return null;

  const indices = new Set();
  const tokens  = str.split(/[,;]+/);
  for (const tok of tokens) {
    const t = tok.trim();
    if (!t) continue;
    const range = t.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const lo = parseInt(range[1], 10);
      const hi = parseInt(range[2], 10);
      if (lo > hi) throw new Error(`Ungültiger Bereich: ${t}`);
      for (let n = lo; n <= hi; n++) {
        if (n >= 1 && n <= total) indices.add(n - 1);
      }
    } else if (/^\d+$/.test(t)) {
      const n = parseInt(t, 10);
      if (n >= 1 && n <= total) indices.add(n - 1);
    } else {
      throw new Error(`Ungültiger Wert: "${t}"`);
    }
  }
  return indices.size ? indices : null;
}

function getFilteredResults() {
  if (!activeFilter) return allResults;
  return allResults.filter((_, i) => activeFilter.has(i));
}

function updateFilterStatus() {
  const total    = allResults.length;
  const filtered = getFilteredResults();
  const sel      = filtered.length;
  const span     = document.getElementById("filterStatus");
  const btn      = document.getElementById("btnPrint");

  if (!activeFilter) {
    span.textContent = `alle (${total})`;
    span.className   = "";
    btn.textContent  = "🖨 Alle drucken";
  } else {
    span.textContent = `${sel} von ${total} ausgewählt`;
    span.className   = "filtered";
    btn.textContent  = `🖨 ${sel} drucken`;
  }
}

// ── Render all labels ─────────────────────────────────────────────────────────
function renderLabels() {
  const grid  = document.getElementById("labelGrid");
  const count = document.getElementById("labelCount");

  grid.replaceChildren();

  if (!allResults || !allResults.length) {
    const p = document.createElement("p");
    p.style.cssText = "color:#8a9bb5;padding:20px 0";
    p.textContent = "Keine Bestellungen.";
    grid.appendChild(p);
    count.textContent = "0 Etiketten";
    return;
  }

  count.textContent = `${allResults.length} Etikett${allResults.length !== 1 ? "en" : ""} bereit`;

  const results = getFilteredResults();
  updateFilterStatus();

  const ra = {
    name:    document.getElementById("rName").value.trim(),
    street:  document.getElementById("rStreet").value.trim(),
    city:    document.getElementById("rCity").value.trim(),
    country: document.getElementById("rCountry").value.trim() || "Deutschland"
  };

  const stampOffset = Math.max(0,
    parseInt(document.getElementById("stampOffset").value || "1", 10) - 1);

  const fragment = document.createDocumentFragment();

  if (a4Mode) {
    // Group labels into pages of 4 for the A4 2×2 grid
    for (let pageIdx = 0; pageIdx < results.length; pageIdx += 4) {
      const pageWrap  = document.createElement("div");
      pageWrap.className = "a4-page";

      const inner = document.createElement("div");
      inner.className = "a4-inner";

      const chunk = results.slice(pageIdx, pageIdx + 4);
      chunk.forEach((o, i) => inner.appendChild(buildLabel(o, ra, pageIdx + i, stampOffset)));

      pageWrap.appendChild(inner);
      fragment.appendChild(pageWrap);
    }
  } else {
    results.forEach((o, i) => fragment.appendChild(buildLabel(o, ra, i, stampOffset)));
  }

  grid.appendChild(fragment);
}

function buildLabel(o, ra, idx, offset) {
  const stampIdx  = idx + (offset || 0);
  const hasReturn = ra.name || ra.street || ra.city;

  // ── outer wrapper ────────────────────────────────────────────────────────
  const label = document.createElement("div");
  label.className = "label";

  const top = document.createElement("div");
  top.className = "label-top";

  // ── left column ──────────────────────────────────────────────────────────
  const left = document.createElement("div");
  left.className = "label-left";

  if (hasReturn) {
    const sender = document.createElement("div");
    sender.className = "label-sender";
    const sName = document.createElement("span");
    sName.style.cssText = "display:block;font-weight:600;";
    sName.textContent = ra.name;
    const sAddr = document.createElement("span");
    sAddr.style.display = "block";
    sAddr.textContent = `${ra.street}, ${ra.city}`;
    sender.appendChild(sName);
    sender.appendChild(sAddr);
    left.appendChild(sender);
  }

  const recipient = document.createElement("div");
  recipient.className = "label-recipient";
  const rName    = document.createElement("div"); rName.className = "name"; rName.textContent = o.fullName || o.buyer || "";
  const rStreet  = document.createElement("div"); rStreet.textContent  = o.street  || "";
  const rZip     = document.createElement("div"); rZip.textContent     = o.zipCity || "";
  const rCountry = document.createElement("div"); rCountry.textContent = o.country || "";
  recipient.append(rName, rStreet, rZip, rCountry);
  left.appendChild(recipient);

  // ── right column (stamp) ─────────────────────────────────────────────────
  const right = document.createElement("div");
  right.className = "label-right";

  if (stampImages.length > stampIdx) {
    const img = document.createElement("img");
    img.className = "stamp-img";
    img.src = stampImages[stampIdx]; // base64 data: URI from user's own PDF
    right.appendChild(img);
  } else {
    const ph = document.createElement("div");
    ph.className = "stamp-placeholder";
    ph.textContent = stampImages.length ? "⚠ leer" : "Marke";
    right.appendChild(ph);
  }

  top.appendChild(left);
  top.appendChild(right);
  label.appendChild(top);

  const orderDiv = document.createElement("div");
  orderDiv.className = "label-order";
  orderDiv.textContent = `#${o.id || ""}`;
  label.appendChild(orderDiv);

  return label;
}

// ── Button handlers ───────────────────────────────────────────────────────────
document.getElementById("btnSave").addEventListener("click", () => {
  const ra = {
    name:    document.getElementById("rName").value.trim(),
    street:  document.getElementById("rStreet").value.trim(),
    city:    document.getElementById("rCity").value.trim(),
    country: document.getElementById("rCountry").value.trim()
  };
  api.storage.local.set({ returnAddress: ra }, () => renderLabels());

  const btn = document.getElementById("btnSave");
  btn.textContent = "✔ Gespeichert";
  setTimeout(() => { btn.textContent = "💾 Speichern"; }, 1500);
});

document.getElementById("btnClearStamps").addEventListener("click", () => {
  stampImages = [];
  api.storage.local.remove("stampImages", () => {
    updateStampUI();
    renderLabels();
  });
  document.getElementById("pdfStatus").textContent = "Marken gelöscht";
  const dbg = document.getElementById("stampDebugImg");
  if (dbg) dbg.style.display = "none";
});

document.getElementById("btnPrint").addEventListener("click", () => {
  const ra = {
    name:    document.getElementById("rName").value.trim(),
    street:  document.getElementById("rStreet").value.trim(),
    city:    document.getElementById("rCity").value.trim(),
    country: document.getElementById("rCountry").value.trim()
  };
  api.storage.local.set({ returnAddress: ra }, () => {
    renderLabels();
    setTimeout(() => window.print(), 200);
  });
});

document.getElementById("stampOffset").addEventListener("change", () => renderLabels());

// ── Filter bar handlers ───────────────────────────────────────────────────────
function applyFilter() {
  const input = document.getElementById("filterInput");
  try {
    activeFilter = parseRangeString(input.value, allResults.length);
    input.classList.remove("invalid");
    renderLabels();
  } catch (e) {
    input.classList.add("invalid");
    document.getElementById("filterStatus").textContent = "⚠ " + e.message;
    document.getElementById("filterStatus").className = "filtered";
  }
}

document.getElementById("btnFilterApply").addEventListener("click", applyFilter);

document.getElementById("filterInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") applyFilter();
  // Clear invalid state on any edit
  if (e.key !== "Enter") document.getElementById("filterInput").classList.remove("invalid");
});

document.getElementById("btnFilterAll").addEventListener("click", () => {
  activeFilter = null;
  document.getElementById("filterInput").value = "";
  document.getElementById("filterInput").classList.remove("invalid");
  renderLabels();
});

// ── A4 mode toggle ────────────────────────────────────────────────────────────
document.getElementById("btnA4Mode").addEventListener("click", () => {
  a4Mode = !a4Mode;
  document.body.classList.toggle("a4-mode", a4Mode);

  // @page size cannot be toggled by class — inject/remove an override <style>
  const existing = document.getElementById("a4PageOverride");
  if (a4Mode) {
    if (!existing) {
      const s = document.createElement("style");
      s.id = "a4PageOverride";
      s.textContent = "@media print { @page { size: A4 portrait; margin: 0; } }";
      document.head.appendChild(s);
    }
  } else {
    if (existing) existing.remove();
  }

  const btn = document.getElementById("btnA4Mode");
  btn.textContent = a4Mode ? "📄 A4-Raster ✔" : "📄 A4-Raster (4/Seite)";
  renderLabels();
});

// ── Debug box toggle ─────────────────────────────────────────────────────────
document.getElementById("btnToggleDebug").addEventListener("click", () => {
  const box    = document.getElementById("debugBox");
  const btn    = document.getElementById("btnToggleDebug");
  const hidden = box.style.display === "none";
  box.style.display = hidden ? "block" : "none";
  btn.textContent   = hidden ? "🐛 Log ausblenden" : "🐛 Log anzeigen";
});
