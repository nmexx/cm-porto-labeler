// labels.js — Label rendering + stamp extraction from Deutsche Post Internetmarke PDF

// ── PDF.js CDN guard ─────────────────────────────────────────────────────────
if (typeof pdfjsLib === "undefined") {
  document.getElementById("pdfStatus").textContent =
    "❌ PDF.js konnte nicht geladen werden (CDN offline?). Bitte Internet prüfen und Seite neu laden.";
  document.getElementById("pdfInput").disabled = true;
} else {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

// ── Debug box ────────────────────────────────────────────────────────────────
const D = document.getElementById("debugBox");
function log(msg) { D.textContent += "\n" + msg; }
window.onerror = (m, _s, l) => log(`ERROR: ${m} line:${l}`);

// ── Globals ──────────────────────────────────────────────────────────────────
const api = (typeof browser !== "undefined") ? browser : chrome;
let stampImages = [];
let allResults  = [];

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
  if (!stampImages.length) { preview.innerHTML = ""; return; }

  const visible = Math.min(stampImages.length, 8);
  let html = "<div style='display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;'>";
  for (let i = 0; i < visible; i++) {
    html += `<img src='${stampImages[i]}' style='height:50px;border:1px solid #2e4057;border-radius:3px;background:#fff;' title='Stamp ${i + 1}'/>`;
  }
  if (stampImages.length > 8) {
    html += `<span style='color:#8a9bb5;font-size:11px;align-self:center;'>+${stampImages.length - 8} weitere</span>`;
  }
  html += "</div>";
  preview.innerHTML = html;
}

// ── Render all labels ─────────────────────────────────────────────────────────
function renderLabels() {
  const grid  = document.getElementById("labelGrid");
  const count = document.getElementById("labelCount");

  if (!allResults || !allResults.length) {
    grid.innerHTML = "<p style='color:#8a9bb5;padding:20px 0'>Keine Bestellungen.</p>";
    count.textContent = "0 Etiketten";
    return;
  }

  count.textContent = `${allResults.length} Etikett${allResults.length !== 1 ? "en" : ""} bereit`;

  const ra = {
    name:    document.getElementById("rName").value.trim(),
    street:  document.getElementById("rStreet").value.trim(),
    city:    document.getElementById("rCity").value.trim(),
    country: document.getElementById("rCountry").value.trim() || "Deutschland"
  };

  const stampOffset = Math.max(0,
    parseInt(document.getElementById("stampOffset").value || "1", 10) - 1);

  grid.innerHTML = allResults
    .map((o, i) => buildLabel(o, ra, i, stampOffset))
    .join("");
}

function buildLabel(o, ra, idx, offset) {
  const stampIdx  = idx + (offset || 0);
  const hasReturn = ra.name || ra.street || ra.city;
  const senderLine = hasReturn
    ? `<span style="display:block;font-weight:600;">${esc(ra.name)}</span>` +
      `<span style="display:block;">${esc(ra.street)}, ${esc(ra.city)}</span>`
    : "";

  const stampImg = stampImages.length > stampIdx
    ? `<img class="stamp-img" src="${stampImages[stampIdx]}"/>`
    : `<div class="stamp-placeholder">${stampImages.length ? "⚠ leer" : "Marke"}</div>`;

  return `<div class="label">` +
    `<div class="label-top">` +
      `<div class="label-left">` +
        (senderLine ? `<div class="label-sender">${senderLine}</div>` : "") +
        `<div class="label-recipient">` +
          `<div class="name">${esc(o.fullName || o.buyer)}</div>` +
          `<div>${esc(o.street)}</div>` +
          `<div>${esc(o.zipCity)}</div>` +
          `<div>${esc(o.country)}</div>` +
        `</div>` +
      `</div>` +
      `<div class="label-right">${stampImg}</div>` +
    `</div>` +
    `<div class="label-order">#${esc(o.id)}</div>` +
  `</div>`;
}

function esc(s) {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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

// ── Debug box toggle ─────────────────────────────────────────────────────────
document.getElementById("btnToggleDebug").addEventListener("click", () => {
  const box    = document.getElementById("debugBox");
  const btn    = document.getElementById("btnToggleDebug");
  const hidden = box.style.display === "none";
  box.style.display = hidden ? "block" : "none";
  btn.textContent   = hidden ? "🐛 Log ausblenden" : "🐛 Log anzeigen";
});
