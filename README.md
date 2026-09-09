# Treasurer

A local desktop workspace for a Dutch student association. Windows 10/11 x64 and macOS 12+ (Intel and Apple Silicon) are the intended targets. No cloud account, subscription, telemetry, or paid OCR service is used.

## Run and build

Install Node.js 22+, Rust stable, and the [Tauri platform prerequisites](https://tauri.app/start/prerequisites/). macOS requires working Xcode command-line tools. Windows requires the MSVC C++ build tools and WebView2.

```sh
npm ci
npm run assets
npm test
npm run desktop
```

`npm run bundle` downloads missing English/Dutch OCR resources at build time and creates the native installer on the host platform. Runtime recognition uses bundled assets without a network connection. `npm run dev` opens a visual browser preview; it intentionally cannot persist records or access desktop evidence.

Build Windows installers on Windows. On macOS, install the relevant Rust target and use `npm run tauri -- build --target aarch64-apple-darwin` or `--target x86_64-apple-darwin` after preparing assets. A GitHub Actions build matrix is provided; running it is optional and subject to your account's free CI allowance. No workflow publishes releases automatically.

Unsigned Windows installers may show SmartScreen warnings. macOS builds are not notarised and downloaded copies may be blocked by Gatekeeper; use the OS's per-app approval flow for a trusted build or build locally. The project does not disable system security. Paid store distribution/signing is not part of this app.

## First use

1. Open Categories & Settings, create categories and a financial year. Six two-month calendar periods are offered as editable defaults; preview and confirm your dates.
2. Set the opening bank balance for the beginning of that year.
3. Add evidence in Receipt Library, or select an incoming folder in Settings. The app scans on launch and polls every 15 seconds while running. It imports supported files directly in that folder, not nested directories.
4. Select receipts and run extraction. OCR suggests the transaction date and other recognised values; review them against the source and manually select a category.
5. Record or import bank movements. Receipt upload itself never creates financial movement.
6. Export reports and make a full backup regularly. Restore on another computer for handover; stop editing the old copy.

Use the green **Up to date** button on Home after reconciling the records. The app saves and displays the most recent confirmation date whenever it opens.

## Imports and exports

CSV and XLSX import provides sheet selection, column mapping, decimal/date conventions, explicit category mapping, row errors, and opt-in inclusion of likely duplicates. Signed amounts use positive=income and negative=expense. Alternatively map separate non-negative income and expense columns. Create missing categories in Settings first. Only selected valid rows are committed, in one database transaction.

Export reflects the currently filtered Home list. CSV and XLSX include original source references, evidence filenames, and item detail. Full backups, not report spreadsheets, preserve original files and all application state.

## Data and backups

The application stores a SQLite database and content-addressed original files in the OS app-data directory for `nl.association.treasurer`. SQLite stores a versioned, revision-controlled workspace document, plus an evidence index; item lines, links, periods, extraction results, and history live within that document. The backend serialises access and rejects stale saves and modifications to locked records.

Backups contain a consistent SQLite snapshot, originals, a format version, and SHA-256 checksums. Restore validates content before committing, makes a `safety-<timestamp>.zip` in app data, and clears the incoming folder setting because paths differ between computers. Backups are not encrypted. They should be kept on trusted storage. Never synchronise a live SQLite database between concurrently active computers.

## Recognition limitations

PDF.js reads embedded text and renders scanned pages. Tesseract.js runs Dutch/English recognition locally. Conservative parsing suggests labelled parties, unambiguous dates/totals, and simple balanced item rows. Complex tables, handwriting, poor photos, and mixed tax/discount layouts need manual input. Extraction never changes a saved transaction. JPEG/PNG/PDF are supported; HEIC must be converted before import.

## Verification

`npm test` checks financial rounding, totals, period boundaries, validation, decimal/date parsing, and conservative OCR parsing. `npm run build` checks TypeScript and builds the frontend. Native Rust tests cover evidence deduplication and backup checksums/roundtrip. Run `cargo test --manifest-path src-tauri/Cargo.toml` and build each native target.

Manual release acceptance: offline PDF/photo recognition, multi-page preview, folder ingestion, lock/edit rejection, CSV/XLSX mapping, restart persistence, archive corruption rejection, and transfer of a backup between Windows and macOS. A successful frontend build alone is not proof of native platform compatibility.
