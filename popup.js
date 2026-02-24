// popup.js

const btnStart    = document.getElementById("btnStart");
const btnDownload = document.getElementById("btnDownload");
const btnLabels   = document.getElementById("btnLabels");
const statusText  = document.getElementById("statusText");
const progressWrap = document.getElementById("progressWrap");
const progressBar  = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const resultsCount = document.getElementById("resultsCount");
const warning      = document.getElementById("warning");

// ── Check current tab ────────────────────────────────────────────────────────

browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
  const url = tabs[0].url || "";
  const isCardmarket = url.includes("cardmarket.com") || url.includes("cardmarket.eu");
  const isBezahlt = url.includes("Bezahlt") || url.includes("bezahlt") || url.includes("paid");

  if (!isCardmarket) {
    showWarning("⚠️ Bitte zuerst zu Cardmarket navigieren und die Bezahlt-Seite öffnen.");
    btnStart.disabled = true;
  } else if (!isBezahlt) {
    showWarning("⚠️ Bitte auf den Tab 'Bezahlt' in deinen Bestellungen wechseln.");
  }
});

// Restore status if scraping already ran
browser.runtime.sendMessage({ type: "GET_STATUS" }).then(s => {
  if (!s) return;
  if (s.running) {
    setRunningUI(s.done, s.total);
  } else if (s.done > 0) {
    setDoneUI(s.done);
  }
}).catch(() => {});

// ── Buttons ───────────────────────────────────────────────────────────────────

btnStart.addEventListener("click", () => {
  browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
    btnStart.disabled = true;
    btnDownload.disabled = true;
    btnLabels.disabled = true;
    warning.style.display = "none";
    setStatusSpinner("Starte Scraping…");
    browser.runtime.sendMessage({ type: "START_SCRAPING", tabId: tabs[0].id });
  });
});

btnDownload.addEventListener("click", () => {
  browser.runtime.sendMessage({ type: "DOWNLOAD_CSV" });
});

btnLabels.addEventListener("click", () => {
  browser.runtime.sendMessage({ type: "PRINT_LABELS" });
});

// ── Messages from background ──────────────────────────────────────────────────

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === "STATUS_UPDATE") {
    setStatus(msg.status);
    if (msg.total > 0) setProgress(msg.done || 0, msg.total);
  } else if (msg.type === "SCRAPING_DONE") {
    setDoneUI(msg.total);
  }
});

// ── UI helpers ────────────────────────────────────────────────────────────────

function setStatus(text) { statusText.textContent = text; }

function setStatusSpinner(text) {
  statusText.replaceChildren();
  const spinner = document.createElement("span");
  spinner.className = "spinner";
  statusText.appendChild(spinner);
  statusText.appendChild(document.createTextNode(" " + text));
}

function setProgress(done, total) {
  progressWrap.style.display = "block";
  progressText.style.display = "block";
  progressBar.style.width = (total > 0 ? Math.round(done / total * 100) : 0) + "%";
  progressText.textContent = `${done} von ${total} Bestellungen`;
}

function setRunningUI(done, total) {
  btnStart.disabled = true;
  btnDownload.disabled = true;
  btnLabels.disabled = true;
  setStatusSpinner("Scraping läuft…");
  if (total > 0) setProgress(done, total);
}

function setDoneUI(total) {
  btnStart.disabled = false;
  btnDownload.disabled = false;
  btnLabels.disabled = false;
  progressBar.style.width = "100%";
  progressText.textContent = `Alle ${total} Bestellungen verarbeitet`;
  statusText.replaceChildren();
  const icon = document.createElement("span");
  icon.className = "done-icon";
  icon.textContent = "✔";
  statusText.appendChild(icon);
  statusText.appendChild(document.createTextNode(` Fertig! ${total} Bestellungen bereit.`));
  resultsCount.textContent = "CSV herunterladen oder Labels drucken.";
}

function showWarning(msg) {
  warning.style.display = "block";
  warning.textContent = msg;
}
