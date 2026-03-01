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
api.storage.local.get(["cachedResults", "returnAddress", "stampImages", "stampOffset"], (data) => {
  log("2. Storage loaded");

  if (data.returnAddress) {
    const ra = data.returnAddress;
    document.getElementById("rName").value    = ra.name    || "";
    document.getElementById("rStreet").value  = ra.street  || "";
    document.getElementById("rCity").value    = ra.city    || "";
    document.getElementById("rCountry").value = ra.country || "Deutschland";
  }

  // Restore persisted stamp offset
  if (data.stampOffset) {
    document.getElementById("stampOffset").value = data.stampOffset;
  }

  if (data.stampImages && data.stampImages.length > 0) {
    stampImages = data.stampImages;
    log(`3. ${stampImages.length} stamps from storage`);
    updateStampTrack();
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
              document.getElementById("pdfStatus").textContent =
                `✅ ${stampImages.length} Briefmarken extrahiert`;
              api.storage.local.set({ stampImages }, () => {
                // Reset offset to 1 when a fresh PDF is loaded
                document.getElementById("stampOffset").value = 1;
                api.storage.local.set({ stampOffset: 1 });
                const dbg = document.getElementById("stampDebugImg");
                if (dbg) { dbg.src = stampImages[0]; dbg.style.display = "block"; }
                updateStampTrack();
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

// ── Stamp tracker strip ───────────────────────────────────────────────────────
// Show up to MAX_VISIBLE thumbnails; beyond that show a badge.
const MAX_VISIBLE = 25;

function updateStampTrack() {
  const track   = document.getElementById("stampTrack");
  const summary = document.getElementById("stampTrackSummary");
  track.replaceChildren();
  summary.textContent = "";

  if (!stampImages.length) return;

  // 0-based index of the first stamp that will be used next
  const nextIdx = Math.max(0,
    parseInt(document.getElementById("stampOffset").value || "1", 10) - 1);

  const total     = stampImages.length;
  const usedCount = Math.min(nextIdx, total);
  const remaining = total - usedCount;

  const visible = Math.min(total, MAX_VISIBLE);

  for (let i = 0; i < visible; i++) {
    const thumb = document.createElement("div");
    thumb.className = "stamp-thumb " +
      (i < nextIdx ? "used" : i === nextIdx ? "next" : "avail");
    thumb.title = i < nextIdx ? `Marke ${i+1} — verbraucht`
                : i === nextIdx ? `Marke ${i+1} — als nächstes`
                : `Marke ${i+1} — verfügbar`;

    const img = document.createElement("img");
    img.src = stampImages[i];
    thumb.appendChild(img);

    const num = document.createElement("div");
    num.className = "st-num";
    num.textContent = i + 1;
    thumb.appendChild(num);

    // Click to set as next
    thumb.style.cursor = "pointer";
    thumb.addEventListener("click", () => {
      document.getElementById("stampOffset").value = i + 1;
      api.storage.local.set({ stampOffset: i + 1 });
      updateStampTrack();
      renderLabels();
    });

    track.appendChild(thumb);
  }

  if (total > MAX_VISIBLE) {
    const badge = document.createElement("div");
    badge.className = "stamp-more";
    badge.textContent = `+${total - MAX_VISIBLE} weitere`;
    track.appendChild(badge);
  }

  // Summary line — build with DOM methods (no innerHTML)
  function mkSpan(text, color, bold) {
    const s = document.createElement("span");
    s.textContent = text;
    s.style.color = color;
    if (bold) s.style.fontWeight = "600";
    return s;
  }

  if (usedCount > 0) {
    summary.replaceChildren(
      mkSpan(`✓ ${usedCount} verbraucht`, "#5a8a5a", false),
      document.createTextNode(" · "),
      mkSpan(`${remaining} verbleibend`, "#7ddb7d", false),
      ...(remaining === 0
        ? [document.createTextNode(" "), mkSpan("— PDF aufgebraucht!", "#c0392b", true)]
        : [])
    );
  } else {
    summary.replaceChildren(
      mkSpan(`${total} Marken verfügbar`, "#7ddb7d", false)
    );
  }
}

// ── Filter helpers ───────────────────────────────────────────────────────────
/**
 * Parse a range string into a Set of 0-based indices within [0, total).
 * Returns null if empty (= show all).
 *
 * Inclusion tokens:   5   1-3   1-3,5,7
 * Exclusion tokens:  -5  -1-3  (start from all, remove these)
 * Mixed:             1-5, -3   (include 1-5 except 3  →  1,2,4,5)
 * Only exclusions:   -2, -5    (all labels except 2 and 5)
 */
function parseRangeString(str, total) {
  str = str.trim();
  if (!str) return null;

  const include = new Set();
  const exclude = new Set();
  let hasIncludes = false;

  const tokens = str.split(/[,;]+/);
  for (const tok of tokens) {
    const t = tok.trim();
    if (!t) continue;

    // Exclusion range: -1-3
    const exRange = t.match(/^-\s*(\d+)\s*-\s*(\d+)$/);
    if (exRange) {
      const lo = parseInt(exRange[1], 10);
      const hi = parseInt(exRange[2], 10);
      if (lo > hi) throw new Error(`Ungültiger Bereich: ${t}`);
      for (let n = lo; n <= hi; n++) { if (n >= 1 && n <= total) exclude.add(n - 1); }
      continue;
    }

    // Exclusion single: -5
    const exSingle = t.match(/^-\s*(\d+)$/);
    if (exSingle) {
      const n = parseInt(exSingle[1], 10);
      if (n >= 1 && n <= total) exclude.add(n - 1);
      continue;
    }

    // Inclusion range: 1-3
    const inRange = t.match(/^(\d+)\s*-\s*(\d+)$/);
    if (inRange) {
      const lo = parseInt(inRange[1], 10);
      const hi = parseInt(inRange[2], 10);
      if (lo > hi) throw new Error(`Ungültiger Bereich: ${t}`);
      for (let n = lo; n <= hi; n++) { if (n >= 1 && n <= total) include.add(n - 1); }
      hasIncludes = true;
      continue;
    }

    // Inclusion single: 5
    if (/^\d+$/.test(t)) {
      const n = parseInt(t, 10);
      if (n >= 1 && n <= total) include.add(n - 1);
      hasIncludes = true;
      continue;
    }

    throw new Error(`Ungültiger Wert: "${t}"`);
  }

  // Build final set
  let result;
  if (hasIncludes) {
    // Explicit inclusions minus any exclusions
    result = new Set([...include].filter(i => !exclude.has(i)));
  } else if (exclude.size) {
    // No explicit inclusions → start from all, remove exclusions
    result = new Set();
    for (let i = 0; i < total; i++) { if (!exclude.has(i)) result.add(i); }
  } else {
    return null; // nothing specified → all
  }

  return result.size ? result : null;
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
    updateStampTrack();
    renderLabels();
  });
  // Reset offset when stamps are cleared
  document.getElementById("stampOffset").value = 1;
  api.storage.local.set({ stampOffset: 1 });
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
    setTimeout(() => {
      window.print();
      // Advance the offset by the number of labels just sent to print
      const printed      = getFilteredResults().length;
      const currentInput = parseInt(document.getElementById("stampOffset").value || "1", 10);
      const newOffset    = currentInput + printed;
      document.getElementById("stampOffset").value = newOffset;
      api.storage.local.set({ stampOffset: newOffset }, () => {
        updateStampTrack();
        renderLabels();
      });
    }, 200);
  });
});

document.getElementById("stampOffset").addEventListener("change", () => {
  const v = parseInt(document.getElementById("stampOffset").value || "1", 10);
  api.storage.local.set({ stampOffset: v });
  updateStampTrack();
  renderLabels();
});

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
