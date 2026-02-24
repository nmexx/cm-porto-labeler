// background.js

let state = {
  running: false,
  orders: [],
  results: [],
  currentIndex: 0,
  tabId: null,
  totalOrders: 0
};

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {

    case "START_SCRAPING":
      if (state.running) return;
      startScraping(msg.tabId);
      break;

    case "ORDER_LIST":
      handleOrderList(msg.orders);
      break;

    case "ORDER_DETAIL":
      handleOrderDetail(msg.data);
      break;

    case "PAGE_ERROR": {
      const failedOrder = state.orders[state.currentIndex];
      const orderLabel = failedOrder ? `#${failedOrder.id}` : `index ${state.currentIndex}`;
      console.warn("Page error on order", orderLabel, msg.error);
      notifyPopup({ type: "STATUS_UPDATE", status: `⚠ Fehler bei Bestellung ${orderLabel} — übersprungen.` });
      state.currentIndex++;
      processNextOrder();
      break;
    }

    case "GET_STATUS":
      sendResponse({
        running: state.running,
        total: state.totalOrders,
        done: state.results.length,
        currentIndex: state.currentIndex
      });
      return true;

    case "DOWNLOAD_CSV":
      downloadCSV();
      break;

    case "PRINT_LABELS":
      openLabelPrintPage();
      break;

    case "SAVE_SETTINGS": {
      const settingsToSave = { returnAddress: msg.returnAddress };
      if (msg.scrapingDelay != null) settingsToSave.scrapingDelay = msg.scrapingDelay;
      browser.storage.local.set(settingsToSave);
      sendResponse({ ok: true });
      return true;
    }

    case "GET_SETTINGS":
      browser.storage.local.get(["returnAddress", "scrapingDelay"]).then(data => {
        sendResponse({
          returnAddress: data.returnAddress || null,
          scrapingDelay: data.scrapingDelay || 800
        });
      });
      return true;

    case "GET_RESULTS":
      // Store results in local storage so labels.html can read them reliably
      sendResponse({ results: state.results, count: state.results.length });
      return true;
  }
});

async function startScraping(tabId) {
  state = { running: true, orders: [], results: [], currentIndex: 0, tabId, totalOrders: 0 };
  notifyPopup({ type: "STATUS_UPDATE", status: "Scraping order list..." });
  browser.tabs.sendMessage(tabId, { type: "SCRAPE_ORDER_LIST" });
}

function handleOrderList(orders) {
  if (!orders || orders.length === 0) {
    notifyPopup({ type: "STATUS_UPDATE", status: "No paid orders found." });
    state.running = false;
    return;
  }
  state.orders = orders;
  state.totalOrders = orders.length;
  state.currentIndex = 0;
  notifyPopup({ type: "STATUS_UPDATE", status: `Found ${orders.length} orders. Fetching addresses...`, total: orders.length, done: 0 });
  processNextOrder();
}

async function processNextOrder() {
  if (state.currentIndex >= state.orders.length) {
    state.running = false;
    // Save results to storage as backup so labels.html can always access them
    browser.storage.local.set({ cachedResults: state.results });
    notifyPopup({ type: "SCRAPING_DONE", total: state.results.length });
    return;
  }
  const order = state.orders[state.currentIndex];
  notifyPopup({
    type: "STATUS_UPDATE",
    status: `Fetching order ${state.currentIndex + 1} of ${state.totalOrders}: #${order.id}`,
    total: state.totalOrders,
    done: state.currentIndex
  });
  // Use configurable delay (default 800ms) to avoid rate-limiting
  const { scrapingDelay = 800 } = await browser.storage.local.get("scrapingDelay");
  await sleep(scrapingDelay);
  browser.tabs.update(state.tabId, { url: order.url });
}

function handleOrderDetail(data) {
  // Guard: ignore stale messages if scraping is no longer active
  if (!state.running) return;
  const order = state.orders[state.currentIndex];
  if (!order) { state.currentIndex++; processNextOrder(); return; }
  state.results.push({ ...order, ...data });
  state.currentIndex++;
  processNextOrder();
}

function openLabelPrintPage() {
  if (state.results.length === 0) {
    notifyPopup({ type: "STATUS_UPDATE", status: "No orders scraped yet. Run scraping first." });
    return;
  }
  // Save to storage first, then open the page
  browser.storage.local.set({ cachedResults: state.results }).then(() => {
    const url = browser.runtime.getURL("labels.html");
    browser.tabs.create({ url });
  });
}

function downloadCSV() {
  if (state.results.length === 0) {
    notifyPopup({ type: "STATUS_UPDATE", status: "No data to export yet." });
    return;
  }
  const headers = ["Order ID","Buyer Username","Last Name","Items","Total (€)","Paid Date","Full Name","Street","ZIP & City","Country","Shipping Method"];
  const rows = state.results.map(o =>
    [o.id,o.buyer,o.lastName,o.items,o.total,o.paidDate,o.fullName,o.street,o.zipCity,o.country,o.shippingMethod]
    .map(v => `"${(v||"").toString().replace(/"/g,'""')}"`)
  );
  const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  browser.downloads.download({ url, filename: `cardmarket_orders_${new Date().toISOString().slice(0,10)}.csv`, saveAs: true });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function notifyPopup(msg) { browser.runtime.sendMessage(msg).catch(() => {}); }
