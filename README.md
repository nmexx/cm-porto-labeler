# Cardmarket Order Exporter — Firefox Addon (v3.4.1)

Automatically scrapes your paid (*Bezahlt*) orders on Cardmarket, exports buyer addresses to CSV, and generates print-ready **DK-11208 (38×90 mm)** address labels with Deutsche Post Internetmarke stamps spliced in.

---

## Installation

### Temporary (Developer Mode)
1. Open Firefox → `about:debugging`
2. Click **"This Firefox"** → **"Load Temporary Add-on…"**
3. Select `manifest.json` from this folder
4. The 🃏 icon appears in the toolbar

> Temporary addons are removed on Firefox restart.

### Permanent (Signed .xpi)
Install the signed `.xpi` from `web-ext-artifacts/` directly into Firefox via **File → Open File** or drag-and-drop.  
Alternatively submit to [AMO Unlisted](https://addons.mozilla.org/en-US/developers/) for self-distribution signing.

---

## How to Use

### 1 — Scrape Orders
1. Log in to **cardmarket.com**
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
5. Optionally use the **filter** to select a subset of labels to print
6. Click **🖨 Alle drucken** — Firefox opens the print dialog set to 38×90 mm

---

## Features

### A4 Grid Print Mode
Toggle **📄 A4-Raster (4/Seite)** to print 4 labels per A4 page in a centred 2×2 grid instead of one per DK-11208 tape strip.

### Label Selection Filter
Use the filter bar to print only specific labels:

| Input | Effect |
|---|---|
| `1-3, 5` | Print labels 1, 2, 3 and 5 |
| `-2, -5` | Print all labels except 2 and 5 |
| `1-5, -3` | Print labels 1, 2, 4, 5 (include range minus exclusion) |
| *(empty)* | Print all labels |

### Stamp Usage Tracker
The stamp strip below the PDF upload shows each stamp's state:
- **Grey + ✓** — already used
- **Green border + ▶** — next to be printed
- **Dimmed** — available

Click any thumbnail to manually set it as the next stamp. The offset advances automatically after printing. State persists across browser restarts via `storage.local`.

### Priority / Einschreiben Stamps
A second stamp row (**⚡ Priorität-Marken**) accepts a separate PDF for priority or registered (Einschreiben) shipments.

- Click the **⚡** button on any label to mark it as priority — it then draws from the priority stamp pool
- Both stamp offsets advance independently after printing
- The priority stamp uses a wider image crop (`x: 3 %, w: 82 %`) to capture the full "R / EINSCHREIBEN EINWURF" emblem
- The stamp column is wider for priority labels (60 mm print / 310 px screen) so the QR code remains readable

### Tracking Number Clipboard
When a priority PDF is loaded the text layer of each page is read automatically. The Deutsche Post hex tracking number (e.g. `A0 05F4 BF82  00 0000 137D`) is extracted by regex and shown as a 📋 button on each priority stamp thumbnail. Click to copy to clipboard.

---

## Buying Stamps (Deutsche Post Internetmarke)

1. Go to **[shop.deutschepost.de/shop/stamps/internetmarke](https://shop.deutschepost.de/shop/stamps/internetmarke)** and log in
2. Choose the correct postage (e.g. *Standardbrief*, *Großbrief*, *Einschreiben*)
3. In the format / layout settings select **DK-11208 (38×90 mm)** — one stamp per page
4. Buy as many stamps as you have open orders
5. Download the PDF — each page contains exactly one stamp
6. In the Labels page upload the PDF via **📄 PDF hochladen…**

> **Tip:** Use the **🎯 Erste verwendete Marke** offset to skip already-used pages from a previous batch.

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
├── manifest.json          Addon metadata, permissions, gecko ID
├── background.js          State machine: scraping, CSV export, label page
├── content.js             DOM scraper injected into cardmarket pages
├── popup.html/js          Toolbar popup UI
├── labels.html/js         Label renderer + PDF stamp extraction
├── lib/
│   ├── pdf.min.js         Bundled Mozilla PDF.js (unmodified)
│   └── pdf.worker.min.js  PDF.js worker
├── icons/                 icon16.png, icon48.png
├── web-ext-artifacts/     Build output (.zip ignored, .xpi tracked in git)
├── .gitignore
└── package.json           web-ext dev tooling
```

### Notes on AMO Linting
`lib/pdf.min.js` and `lib/pdf.worker.min.js` are unmodified copies of Mozilla's own PDF.js library. The `new Function` linter warning originates exclusively within these files — no eval-equivalent code exists in the extension's own source. Pass `--ignore-files lib/pdf.min.js lib/pdf.worker.min.js` when running `web-ext lint`.

---

## Troubleshooting

**"No order rows found"** — Make sure you are on the *Bezahlt* tab (paid orders).

**Addresses are empty** — Cardmarket may have updated their HTML. Open DevTools (F12) on an order detail page and update the selectors in `content.js`.

**Addon stops mid-way** — An individual order page had a parse error; the addon skips it and continues. Check the debug log in the Labels page (🐛 Log anzeigen).

**Stamps look wrong / cropped badly** — Edit `CROP_STD` or `CROP_PRI` in `labels.js` to nudge the crop rectangle percentages for your PDF layout.

**Tracking number not detected** — The regex expects the Deutsche Post format `XX XXXX XXXX  XX XXXX XXXX`. If your PDF uses a different layout the match may fail silently — check the debug log.

---

## Changelog

### v3.4.1
- Fixed `DK-11209` typo in popup button label (now correctly `DK-11208`)

### v3.4.0
- Sender address moved from `.label-left` to a full-width header strip spanning the entire label — prevents cut-off on priority labels where the stamp column takes up most of the width

### v3.3.0
- Increased left/right padding on DK-11208 print output (`3.5 mm` left, `2.5 mm` right) for cleaner tape edges
- Priority stamp column widened further to `60 mm` in print (was `54 mm`) for a more readable QR code

### v3.2.0
- Version bump / housekeeping

### v3.1.0
- Priority stamp uses a wider crop region (`x: 3 %, w: 82 %`, `h: 70 %`) to capture the full "R / EINSCHREIBEN EINWURF" emblem without clipping
- Tracking number automatically extracted from priority PDF text layer and shown as a 📋 copy-to-clipboard button on each priority stamp thumbnail; persisted in `storage.local`

### v3.0.0
- **Priority / Einschreiben stamp support**: second PDF upload row for priority stamps; ⚡ per-label toggle; independent offset tracking for each stamp type; all state persisted across reloads
- **Sender overflow fix**: sender address rendered as a single `nowrap` line with `text-overflow: ellipsis` instead of wrapping and pushing the recipient off the label
- Recipient font size/line-height tightened slightly in print to handle long street names

### v2.1.2
- Label filter supports exclusion syntax: `-2` excludes label 2, `-1-3` excludes a range, `1-5, -3` includes a range minus exclusions, `-2, -5` alone means all except those two
- Updated filter input placeholder to document the syntax

### v2.1.1
- Replaced two `innerHTML` assignments in `updateStampTrack()` with safe DOM methods (`createElement`, `textContent`, `replaceChildren`) — resolves AMO automated review warning

### v2.1.0
- **Stamp usage tracker**: visual strip showing used (grey+✓), next (green▶), and available stamps
- Click any thumbnail to manually set the next stamp
- Offset auto-advances after printing by the exact number of labels printed
- Resets when a new PDF is loaded or stamps are cleared
- Summary line: "✓ X verbraucht · Y verbleibend" with "PDF aufgebraucht!" warning
- All state persisted via `storage.local`

### v2.0.0
- **A4 4-up grid print mode**: toggle to print 4 labels per A4 page in a centred 2×2 grid
- **Label selection filter**: type ranges like `1-3, 5` to print only specific labels; print button updates to show the count

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
