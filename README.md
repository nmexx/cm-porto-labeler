# Cardmarket Order Exporter — Firefox Addon (v1.3)

Automatically scrapes your paid (*Bezahlt*) orders on Cardmarket, exports buyer addresses to CSV, and generates print-ready **DK-11208 (38×90 mm)** address labels with Deutsche Post Internetmarke stamps spliced in.

---

## Installation (Developer / Temporary)

1. Open Firefox → `about:debugging`
2. Click **"This Firefox"** → **"Load Temporary Add-on…"**
3. Select `manifest.json` from this folder
4. The 🃏 icon appears in the toolbar

> Temporary addons are removed on Firefox restart. For permanent use, sign via [AMO](https://addons.mozilla.org/).

---

## How to Use

### 1 — Scrape Orders
1. Log in to **cardmarket.com** or **cardmarket.eu**
2. Go to **Verkaufen → Bestellungen → Bezahlt**
3. Click the 🃏 toolbar icon → **▶ Start Scraping**
4. The addon visits each order page, collects the shipping address, and shows a progress bar

### 2 — Export CSV
Click **⬇ Download CSV** to save a spreadsheet with all order details.

### 3 — Print Labels (DK-11208)
1. Click **🖨 Labels drucken**
2. Fill in your **return address** and click 💾 Speichern
3. Upload your **Deutsche Post Internetmarke PDF** (one stamp per page)  
   — The addon crops and places each stamp automatically
4. Adjust the **stamp offset** if some stamps are already used
5. Click **🖨 Alle drucken** — Firefox will open the print dialog set to 38×90 mm

---

## Buying Stamps (Deutsche Post Internetmarke)

Before printing labels you need to purchase digital stamps from Deutsche Post and download them as a PDF.

1. Go to **[shop.deutschepost.de/shop/stamps/internetmarke](https://shop.deutschepost.de/shop/stamps/internetmarke)** and log in or create a free account
2. Choose the correct postage for your shipping method (e.g. *Standardbrief*, *Kompaktbrief*, *Großbrief*)
3. In the **format / layout** settings select **DK-11208 (38×90 mm)** — one stamp per page
4. Buy as many stamps as you have open orders (you can buy in batches)
5. Download the generated **PDF** — each page contains exactly one stamp
6. Open the **Labels** page in the addon and upload this PDF via **📄 PDF hochladen…**

> **Tip:** If you already used some pages from a previous PDF, use the **🎯 Erste verwendete Marke** offset field to skip them and start at the correct stamp.

---

## CSV Columns

| Column | Description |
|---|---|
| Order ID | Cardmarket order number |
| Buyer Username | Cardmarket username |
| Last Name | Buyer's last name |
| Items | Number of items |
| Total (€) | Order total |
| Paid Date | When payment was received |
| Full Name | Buyer's full name (from shipping address) |
| Street | Street address |
| ZIP & City | Postal code and city |
| Country | Country |
| Shipping Method | e.g. Standardbrief |

---

## Development

### Prerequisites
```
node >= 18
npm install        # installs web-ext
```

### Commands
| Command | Description |
|---|---|
| `npm run dev` | Launch Firefox with the addon loaded in a dev profile |
| `npm run build` | Package addon as `.zip` into `web-ext-artifacts/` |
| `npm run lint` | Validate manifest + JS with web-ext linter |

### Project Structure
```
cm-porto-labeler/
├── manifest.json      Addon metadata, permissions, gecko ID
├── background.js      State machine: coordinates scraping, CSV export, label page
├── content.js         DOM scraper injected into cardmarket pages
├── popup.html/js      Toolbar popup UI
├── labels.html/js     Label renderer + PDF stamp extraction
├── icons/             icon16.png, icon48.png
├── .gitignore
└── package.json       web-ext dev tooling
```

---

## Troubleshooting

**"No order rows found"** — Make sure you are on the *Bezahlt* tab (paid orders).

**Addresses are empty** — Cardmarket may have updated their HTML. Open DevTools (F12) on an order detail page and update the selectors in `content.js`.

**Addon stops mid-way** — An individual order page had a parse error; the addon skips it and continues. Check the debug log in the Labels page.

**Stamps look wrong / cropped badly** — Edit the `CROP` constant in `labels.js` to adjust the crop rectangle percentages for your stamp PDF layout.

---

## Changelog

### v1.3
- Added `browser_specific_settings.gecko.id` for Firefox AMO signing
- Fixed DK-11208 label size references (was inconsistently DK-11209 in some places)
- Configurable scraping delay via storage (`scrapingDelay`, default 800 ms)
- Bug fix: `ORDER_DETAIL` messages from user-browsed order pages no longer corrupt state
- `autoDetect` in content.js now checks `GET_STATUS` before firing
- Modernized `labels.js`: `var` → `const`/`let`, template literals
- PDF.js CDN load guard with user-friendly error message
- Debug log box hidden by default with toggle button
- Added `package.json` with `web-ext` dev tooling
- Added `.gitignore`

### v1.2
- Initial release with CSV export and DK-11208 label printing
