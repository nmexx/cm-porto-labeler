// content.js - Runs on Cardmarket pages, scrapes data and reports back

// ── Listen for instructions from background script ───────────────────────────

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === "SCRAPE_ORDER_LIST") {
    scrapeOrderList();
  } else if (msg.type === "SCRAPE_ORDER_DETAIL") {
    scrapeOrderDetail();
  }
});

// ── Detect which page we're on and auto-scrape if navigated here by addon ────

(function autoDetect() {
  if (!isOrderDetailPage()) return;
  // Check if the addon is actively scraping before firing detail scrape.
  // This prevents accidental messages when the user manually browses order pages.
  browser.runtime.sendMessage({ type: "GET_STATUS" }).then(s => {
    if (s && s.running) {
      // Small wait for dynamic content to settle
      setTimeout(scrapeOrderDetail, 600);
    }
  }).catch(() => {
    // Extension context not ready; ignore
  });
})();

// ── Scrape the order LIST (Bezahlt page) ─────────────────────────────────────

function scrapeOrderList() {
  try {
    // Cardmarket renders orders as divs with data-url, NOT a traditional <table>
    // Each row: div.row.g-8.flex-nowrap.set-as-link[data-url="/de/Magic/Orders/XXXXXXX"]
    const rows = document.querySelectorAll("div[data-url*='/Orders/']");

    if (rows.length === 0) {
      browser.runtime.sendMessage({
        type: "PAGE_ERROR",
        error: "No order rows found. Make sure you are on the Bezahlt orders page."
      });
      return;
    }

    const orders = [];

    rows.forEach(row => {
      // Get the order URL from data-url attribute
      const relativeUrl = row.getAttribute("data-url");
      if (!relativeUrl) return;

      const url = window.location.origin + relativeUrl;

      // Extract order ID from the URL (last numeric segment)
      const idMatch = relativeUrl.match(/\/Orders\/(\d+)/i);
      const id = idMatch ? idMatch[1] : "";
      if (!id) return;

      // Buyer username: inside span.d-flex.text-nowrap (the span directly wrapping the username text)
      // From the inspector: <span class="d-flex text-nowrap ms-lg-auto"></span> wraps
      // <span>wayne123</span>
      const buyerSpan = row.querySelector("span.d-flex.text-nowrap");
      const buyer = buyerSpan ? buyerSpan.textContent.trim() : "";

      // Last name: div.col-sm-6.col-4.col-lg.text-start > div
      const lastNameDiv = row.querySelector("div.col-sm-6.col-4.col-lg.text-start div, div.col-sm-6.col-4.text-start div");
      const lastName = lastNameDiv ? lastNameDiv.textContent.trim() : "";

      // Number of items: div.col-smallnumber or similar small numeric col
      const itemsDiv = row.querySelector("div.col-smallnumber");
      const items = itemsDiv ? itemsDiv.textContent.trim() : "";

      // Total price: div.col-md-auto — contains the price
      const totalDiv = row.querySelector("div.col-md-auto");
      const total = totalDiv ? totalDiv.textContent.trim().replace(/\s+/g, " ") : "";

      // Paid date: col-icons area or last text col — grab all text from the row
      // and find something matching a date pattern DD.MM.YYYY HH:MM
      const rowText = row.innerText || "";
      const dateMatch = rowText.match(/\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}/);
      const paidDate = dateMatch ? dateMatch[0] : "";

      orders.push({ id, url, buyer, lastName, items, total, paidDate });
    });

    browser.runtime.sendMessage({
      type: "ORDER_LIST",
      orders: orders
    });

  } catch (e) {
    browser.runtime.sendMessage({
      type: "PAGE_ERROR",
      error: e.message
    });
  }
}

// ── Scrape an individual ORDER DETAIL page ────────────────────────────────────

function scrapeOrderDetail() {
  try {
    // ── Shipping address ──────────────────────────────────────────────────────
    // Structure confirmed via DevTools:
    // #collapsibleShippingAddress > .shipping-address > .text-break > .Name / .Street / .city / .Country

    const addressBlock = document.querySelector("#collapsibleShippingAddress .shipping-address");

    const fullName    = addressBlock ? (addressBlock.querySelector(".Name")?.textContent.trim()    || "") : "";
    const street      = addressBlock ? (addressBlock.querySelector(".Street")?.textContent.trim()  || "") : "";
    const zipCity     = addressBlock ? (addressBlock.querySelector(".City")?.textContent.trim()    || "") : "";
    const country     = addressBlock ? (addressBlock.querySelector(".Country")?.textContent.trim() || "") : "";

    // ── Shipping method ───────────────────────────────────────────────────────
    // Visible on page as e.g. "Standardbrief (max. 20g)"
    // Lives inside a span or label near "Versandmethode"
    let shippingMethod = "";
    const shippingSection = document.querySelector("#ShippingInfo, #shippingInfo, .shipment-block");
    if (shippingSection) {
      // Look for the first text that mentions a letter/shipping type
      const spans = shippingSection.querySelectorAll("span, label, div");
      for (const el of spans) {
        const t = el.childNodes[0]?.textContent?.trim() || "";
        if (t && (t.includes("brief") || t.includes("Letter") || t.includes("Einschreiben") || t.includes("Registered"))) {
          shippingMethod = t;
          break;
        }
      }
    }
    // Broad fallback if section not found
    if (!shippingMethod) {
      const allSpans = document.querySelectorAll("span, div");
      for (const el of allSpans) {
        const t = el.childNodes[0]?.textContent?.trim() || "";
        if (t && (t.startsWith("Standardbrief") || t.startsWith("Einschreiben") || t.startsWith("Standard Letter"))) {
          shippingMethod = t;
          break;
        }
      }
    }

    browser.runtime.sendMessage({
      type: "ORDER_DETAIL",
      data: { fullName, street, zipCity, country, shippingMethod }
    });

  } catch (e) {
    browser.runtime.sendMessage({
      type: "PAGE_ERROR",
      error: e.message
    });
  }
}

// ── Helper: detect if current page is an order detail page ───────────────────

function isOrderDetailPage() {
  const url = window.location.href;
  // Cardmarket order detail URLs contain /Orders/ followed by a numeric ID
  // Cardmarket order detail URLs: /de/Magic/Orders/1258533269
  return /\/Orders\/\d+/i.test(url);
}
