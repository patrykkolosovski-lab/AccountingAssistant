import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  Files,
  Settings2,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  Upload,
  Download,
  FolderOpen,
  Wallet,
  FileText,
  CheckCircle2,
} from "lucide-react";
import { open, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import Decimal from "decimal.js";
import * as XLSX from "xlsx";
import * as api from "./api";
import { empty, type Data, type Entry, type Receipt } from "./types";
import { money, totals, periodIndex } from "./domain";
import EntryForm, { newEntry } from "./EntryForm";
import ImportDialog from "./ImportDialog";
import Settings from "./Settings";
import Preview from "./Preview";
import { extract, cancelOcr } from "./ocr";
export default function App() {
  const [data, sd] = useState<Data>(empty),
    [tab, st] = useState("Home"),
    [error, se] = useState(""),
    [notice, sn] = useState(""),
    [query, sq] = useState(""),
    [yearId, sy] = useState(""),
    [period, sp] = useState(""),
    [cat, sc] = useState(""),
    [kind, sk] = useState(""),
    [missing, sm] = useState(false),
    [from, sf] = useState(""),
    [to, sto] = useState(""),
    [sort, ss] = useState("date"),
    [ascending, sa] = useState(false),
    [entry, setEntry] = useState<Entry>(),
    [importing, si] = useState(false),
    [selected, sselected] = useState<string[]>([]),
    [receipt, sreceipt] = useState<Receipt>(),
    [view, sv] = useState("grid"),
    [status, sstatus] = useState(""),
    [ocr, so] = useState(""),
    [progress, sprogress] = useState(0),
    [busy, sbusy] = useState(false);
  const ref = useRef(data);
  ref.current = data;
  const editorOpen = useRef(false);
  editorOpen.current = !!entry || importing || busy;
  const cancelled = useRef(false);
  const reload = async () => {
    const d = await api.load();
    sd(d);
  };
  useEffect(() => {
    reload().catch((e) => se(String(e)));
  }, []);
  useEffect(() => {
    if (!yearId && data.years.length) sy(data.years[data.years.length - 1].id);
  }, [data.years, yearId]);
  useEffect(() => {
    if (!api.desktop || !data.incoming) return;
    let running = false,
      disposed = false;
    const scan = async () => {
      if (running || editorOpen.current) return;
      running = true;
      try {
        const errors = await invoke<string[]>("scan_folder");
        if (!disposed) {
          await reload();
          if (errors.length) se(errors.join("\n"));
        }
      } catch (e) {
        if (!disposed) se("Incoming folder: " + String(e));
      } finally {
        running = false;
      }
    };
    void scan();
    const interval = setInterval(scan, 15000);
    return () => {
      disposed = true;
      clearInterval(interval);
    };
  }, [data.incoming]);
  const run = (fn: () => Promise<void>) => {
    se("");
    sbusy(true);
    void fn()
      .catch((e) => se(String(e)))
      .finally(() => sbusy(false));
  };
  const commit = async (d: Data, action: string) => {
    const next = await api.save(d, action);
    sd(next);
    sn(action);
  };
  const year = data.years.find((y) => y.id === yearId);
  const allYear = data.entries.filter(
    (e) => year && periodIndex(year, e.date) >= 0,
  );
  const filtered = allYear
    .filter(
      (e) =>
        (!query ||
          `${e.party} ${e.comments}`
            .toLowerCase()
            .includes(query.toLowerCase())) &&
        (!cat || e.categoryId === cat) &&
        (!kind || e.kind === kind) &&
        (!period || periodIndex(year!, e.date) === Number(period) - 1) &&
        (!missing || !e.receiptIds.length) &&
        (!from || e.date >= from) &&
        (!to || e.date <= to),
    )
    .sort((a, b) => {
      const x =
        sort === "total"
          ? Number(a.total) - Number(b.total)
          : String(a[sort as keyof Entry]).localeCompare(
              String(b[sort as keyof Entry]),
            );
      return ascending ? x : -x;
    });
  const sums = totals(filtered),
    yearSums = totals(allYear);
  const linked = (id: string) =>
    data.entries.some((e) => e.receiptIds.includes(id));
  const receipts = data.receipts.filter(
    (r) =>
      (!query ||
        `${r.name} ${r.text || ""}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (!cat || r.categoryId === cat) &&
      (!status ||
        (status === "linked"
          ? linked(r.id)
          : status === "unlinked"
            ? !linked(r.id)
            : r.status === "review")),
  );
  async function addFiles() {
    const paths = await open({
      multiple: true,
      filters: [
        { name: "Evidence", extensions: ["pdf", "png", "jpg", "jpeg"] },
      ],
    });
    if (paths) {
      await api.importPaths(Array.isArray(paths) ? paths : [paths]);
      await reload();
      sn("Evidence added to your library");
    }
  }
  async function recognize(ids: string[]) {
    cancelled.current = false;
    for (const id of ids) {
      if (cancelled.current) break;
      const r = ref.current.receipts.find((r) => r.id === id);
      if (!r) continue;
      so(r.name);
      sprogress(0);
      try {
        const result = await extract(r, sprogress);
        if (cancelled.current) break;
        const d = await api.load();
        await commit(
          {
            ...d,
            receipts: d.receipts.map((x) =>
              x.id === id ? { ...x, ...result, status: "review" } : x,
            ),
          },
          "Extracted text from " + r.name,
        );
      } catch (e) {
        se(String(e));
        if (cancelled.current) break;
      }
    }
    so("");
  }
  async function exportRows(format: "csv" | "xlsx") {
    const rows = filtered.map((e) => ({
      Type: e.kind,
      Date: e.date,
      Category: data.categories.find((c) => c.id === e.categoryId)?.name || "",
      "Paid to / received from": e.party,
      Units: e.items.length === 1 ? e.items[0].quantity : "",
      "Unit price": e.items.length === 1 ? e.items[0].price : "",
      Total: e.total,
      Period: periodIndex(year!, e.date) + 1,
      Comments: e.comments,
      Evidence: e.receiptIds
        .map((id) => data.receipts.find((r) => r.id === id)?.name)
        .join("; "),
      Items: JSON.stringify(e.items),
      Source: e.source || "",
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Transactions");
    const bytes =
      format === "csv"
        ? new TextEncoder().encode("\uFEFF" + XLSX.utils.sheet_to_csv(sheet))
        : new Uint8Array(XLSX.write(book, { type: "array", bookType: "xlsx" }));
    const path = await saveDialog({
      defaultPath: `Treasurer-${year?.name || "records"}.${format}`,
    });
    if (path) await api.writeExport(path, bytes);
  }
  return (
    <div className="shell">
      <aside>
        <a className="brand">
          <span className="brand-icon">
            <Wallet size={23} />
          </span>
          Treasurer<span className="brand-dot">.</span>
        </a>
        <p className="workspace-label">YOUR ASSOCIATION</p>
        <nav>
          {[
            { name: "Home", icon: LayoutDashboard },
            { name: "Receipt Library", icon: Files },
            { name: "Categories & Settings", icon: Settings2 },
          ].map((n) => (
            <button
              className={tab === n.name ? "active" : ""}
              key={n.name}
              onClick={() => {
                st(n.name);
                sq("");
                sc("");
              }}
            >
              <n.icon size={19} />
              {n.name}
            </button>
          ))}
        </nav>
        <div className="local-note">
          <span className="status-dot" />
          Stored on this computer<p>Private, offline, and yours.</p>
        </div>
        <div className="profile">
          <div className="avatar">T</div>
          <div>
            <strong>Association treasurer</strong>
            <small>Local workspace</small>
          </div>
        </div>
      </aside>
      <main>
        <div className="topbar">
          <span>
            Workspace <span className="slash">/</span> {tab}
          </span>
          <span className="local-pill">
            <span className="status-dot" /> Offline ready
          </span>
        </div>
        {!api.desktop && (
          <div className="notice">
            Browser preview — saving and receipt access require the desktop app.
          </div>
        )}
        {error && (
          <div role="alert" className="error dismiss">
            {error}
            <button onClick={() => se("")}>Dismiss</button>
          </div>
        )}
        {notice && (
          <div role="status" className="toast" onClick={() => sn("")}>
            {notice} <span>×</span>
          </div>
        )}
        <header className="page-heading">
          <div>
            <p className="eyebrow">
              {tab === "Home"
                ? "A CLEAR VIEW OF YOUR FINANCES"
                : tab === "Receipt Library"
                  ? "EVERY DOCUMENT, IN ONE PLACE"
                  : "MAKE IT YOUR OWN"}
            </p>
            <h1>{tab === "Home" ? "Financial overview" : tab}</h1>
            <p>
              {tab === "Home"
                ? "Keep track of what comes in, what goes out, and the details behind it."
                : tab === "Receipt Library"
                  ? "Organise your evidence and turn receipts into reviewed records."
                  : "Manage categories, financial periods, and your local workspace."}
            </p>
          </div>
          {tab === "Home" ? (
            <button className="primary" onClick={() => setEntry(newEntry())}>
              <Plus size={17} />
              New transaction
            </button>
          ) : tab === "Receipt Library" ? (
            <button className="primary" onClick={() => run(addFiles)}>
              <Upload size={17} />
              Add evidence
            </button>
          ) : null}
        </header>
        {tab === "Home" && (
          <>
            <div className="row spread">
              <div className="row">
                <span className="muted">Financial year</span>
                <select value={yearId} onChange={(e) => sy(e.target.value)}>
                  <option value="">Select year</option>
                  {data.years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="accounting-status">
                <div>
                  <strong>Accounting up to date</strong>
                  <small>
                    {data.accountingUpdatedAt
                      ? `Last confirmed ${new Date(data.accountingUpdatedAt).toLocaleString("nl-NL")}`
                      : "Not confirmed yet"}
                  </small>
                </div>
                <button
                  className="up-to-date"
                  onClick={() =>
                    run(() =>
                      commit(
                        {
                          ...data,
                          accountingUpdatedAt: new Date().toISOString(),
                        },
                        "Confirmed accounting is up to date",
                      ),
                    )
                  }
                >
                  <CheckCircle2 size={17} /> Up to date
                </button>
              </div>
            </div>
            <div className="stats">
              <article>
                <div className="row spread">
                  <span>Total income</span>
                  <ArrowDownLeft className="green" size={20} />
                </div>
                <h2 className="green">{money(sums.income)}</h2>
                <small>Money received · current filters</small>
              </article>
              <article>
                <div className="row spread">
                  <span>Total expenses</span>
                  <ArrowUpRight size={20} />
                </div>
                <h2>{money(sums.expense)}</h2>
                <small>Money spent · current filters</small>
              </article>
              <article className="net">
                <div className="row spread">
                  <span>Net movement</span>
                  <Wallet size={19} />
                </div>
                <h2>{money(sums.net)}</h2>
                <small>Income minus expenses · current filters</small>
              </article>
            </div>
            <div className="balance-strip">
              <span>
                Recorded closing balance{" "}
                <strong>
                  {money(
                    new Decimal(year?.opening || 0)
                      .plus(yearSums.net)
                      .toFixed(2),
                  )}
                </strong>
              </span>
              <small>
                Opening {money(year?.opening || 0)} + all movements in this year
              </small>
            </div>
            <section className="panel transactions">
              <div className="row spread">
                <h2>
                  Transactions <span className="count">{filtered.length}</span>
                </h2>
                <div className="row">
                  <button onClick={() => si(true)}>
                    <Upload size={15} />
                    Import
                  </button>
                  <button onClick={() => run(() => exportRows("csv"))}>
                    <Download size={15} />
                    CSV
                  </button>
                  <button onClick={() => run(() => exportRows("xlsx"))}>
                    Excel
                  </button>
                </div>
              </div>
              <div className="filters">
                <div className="search">
                  <Search size={17} />
                  <input
                    placeholder="Search transactions…"
                    value={query}
                    onChange={(e) => sq(e.target.value)}
                  />
                </div>
                <select value={period} onChange={(e) => sp(e.target.value)}>
                  <option value="">All periods</option>
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      Period {n}
                    </option>
                  ))}
                </select>
                <select value={cat} onChange={(e) => sc(e.target.value)}>
                  <option value="">All categories</option>
                  {data.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select value={kind} onChange={(e) => sk(e.target.value)}>
                  <option value="">Income & expenses</option>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={missing}
                    onChange={(e) => sm(e.target.checked)}
                  />
                  Missing evidence
                </label>
              </div>
              <div className="row date-filters">
                <label>
                  From{" "}
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => sf(e.target.value)}
                  />
                </label>
                <label>
                  To{" "}
                  <input
                    type="date"
                    value={to}
                    onChange={(e) => sto(e.target.value)}
                  />
                </label>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {[
                        ["date", "Date"],
                        ["party", "Paid to / received from"],
                        ["categoryId", "Category"],
                      ].map(([key, label]) => (
                        <th key={key}>
                          <button
                            onClick={() => {
                              ss(key);
                              sa(sort === key ? !ascending : true);
                            }}
                          >
                            {label} ↕
                          </button>
                        </th>
                      ))}
                      <th>Evidence</th>
                      <th>Units</th>
                      <th>Unit price</th>
                      <th>
                        <button
                          onClick={() => {
                            ss("total");
                            sa(sort === "total" ? !ascending : false);
                          }}
                        >
                          Total ↕
                        </button>
                      </th>
                      <th>Period</th>
                      <th>Comments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((e) => {
                      const c = data.categories.find(
                        (c) => c.id === e.categoryId,
                      );
                      return (
                        <tr
                          key={e.id}
                          onClick={() => setEntry(e)}
                          tabIndex={0}
                          onKeyDown={(v) => {
                            if (v.key === "Enter") setEntry(e);
                          }}
                        >
                          <td>
                            {new Date(e.date + "T12:00:00").toLocaleDateString(
                              "nl-NL",
                            )}
                          </td>
                          <td>
                            <strong>{e.party}</strong>
                            <small>
                              {e.kind === "income" ? "Income" : "Expense"}
                            </small>
                          </td>
                          <td>
                            <span
                              className="category-tag"
                              style={{ borderLeftColor: c?.color }}
                            >
                              {c?.name}
                            </span>
                          </td>
                          <td>
                            {e.receiptIds.length ? (
                              <span className="evidence">
                                <FileText size={14} />
                                {e.receiptIds.length}
                              </span>
                            ) : (
                              <span className="badge">Missing</span>
                            )}
                          </td>
                          <td>
                            {e.items.length === 1
                              ? e.items[0].quantity
                              : e.items.length
                                ? `${e.items.length} items`
                                : "—"}
                          </td>
                          <td>
                            {e.items.length === 1
                              ? money(e.items[0].price)
                              : "—"}
                          </td>
                          <td
                            className={e.kind === "income" ? "green" : "amount"}
                          >
                            {e.kind === "income" ? "+" : "−"}
                            {money(e.total)}
                          </td>
                          <td>P{periodIndex(year!, e.date) + 1}</td>
                          <td className="comments">{e.comments || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!filtered.length && (
                <div className="empty">
                  <div className="empty-icon">
                    <Wallet size={27} />
                  </div>
                  <h3>
                    {data.years.length
                      ? "Your records start here"
                      : "Let’s set up your financial year"}
                  </h3>
                  <p>
                    {data.years.length
                      ? "Add a transaction or import your existing spreadsheet."
                      : "Create your categories and six periods before recording transactions."}
                  </p>
                  <button
                    onClick={() =>
                      data.years.length
                        ? setEntry(newEntry())
                        : st("Categories & Settings")
                    }
                  >
                    {data.years.length
                      ? "Add first transaction"
                      : "Set up workspace"}{" "}
                    →
                  </button>
                </div>
              )}
            </section>
          </>
        )}
        {tab === "Receipt Library" && (
          <>
            <div
              className="dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const files = Array.from(e.dataTransfer.files);
                run(async () => {
                  for (const f of files) await api.importBytes(f);
                  await reload();
                });
              }}
            >
              <FolderOpen size={28} />
              <div>
                <strong>Drop receipts, invoices, or screenshots here</strong>
                <p>
                  PDF, PNG, JPG · Original files stay safely in your library
                </p>
              </div>
              <button onClick={() => run(addFiles)}>Browse files</button>
            </div>
            <div className="filters">
              <div className="search">
                <Search size={17} />
                <input
                  placeholder="Search files or recognised text…"
                  value={query}
                  onChange={(e) => sq(e.target.value)}
                />
              </div>
              <select value={cat} onChange={(e) => sc(e.target.value)}>
                <option value="">All categories</option>
                {data.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select value={status} onChange={(e) => sstatus(e.target.value)}>
                <option value="">All statuses</option>
                <option value="linked">Linked</option>
                <option value="unlinked">Unlinked</option>
                <option value="review">Needs review</option>
              </select>
              <button onClick={() => sv(view === "grid" ? "list" : "grid")}>
                {view === "grid" ? "List view" : "Grid view"}
              </button>
            </div>
            {selected.length > 0 && (
              <div className="row bulk">
                <strong>{selected.length} selected</strong>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const id = e.target.value;
                    if (id)
                      run(() =>
                        commit(
                          {
                            ...data,
                            receipts: data.receipts.map((r) =>
                              selected.includes(r.id)
                                ? { ...r, categoryId: id }
                                : r,
                            ),
                          },
                          "Categorised selected evidence",
                        ),
                      );
                  }}
                >
                  <option value="">Assign category…</option>
                  {data.categories
                    .filter((c) => !c.archived)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
                <button
                  disabled={!!ocr}
                  onClick={() => run(() => recognize(selected))}
                >
                  Extract text
                </button>
                <button onClick={() => sselected([])}>Clear selection</button>
              </div>
            )}
            {ocr && (
              <div className="notice row">
                Reading {ocr} · {progress}%
                <progress value={progress} max={100} />
                <button
                  onClick={() => {
                    cancelled.current = true;
                    void cancelOcr();
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
            <div className={view === "grid" ? "receipt-grid" : "receipt-list"}>
              {receipts.map((r) => (
                <article key={r.id} className="receipt-card">
                  <div className="row spread">
                    <input
                      aria-label={"Select " + r.name}
                      type="checkbox"
                      checked={selected.includes(r.id)}
                      onChange={(e) =>
                        sselected(
                          e.target.checked
                            ? [...selected, r.id]
                            : selected.filter((id) => id !== r.id),
                        )
                      }
                    />
                    <span className="badge">
                      {linked(r.id)
                        ? "Linked"
                        : r.status === "review"
                          ? "Needs review"
                          : "Unlinked"}
                    </span>
                  </div>
                  <button className="document-tile" onClick={() => sreceipt(r)}>
                    <FileText size={43} />
                    <span>
                      {r.mime === "application/pdf" ? "PDF" : "IMAGE"}
                    </span>
                  </button>
                  <button className="file-title" onClick={() => sreceipt(r)}>
                    {r.name}
                  </button>
                  <small>
                    {data.categories.find((c) => c.id === r.categoryId)?.name ||
                      "Uncategorised"}
                  </small>
                </article>
              ))}
            </div>
            {!receipts.length && (
              <div className="empty">
                <Files size={34} />
                <h3>A home for your evidence</h3>
                <p>Add your first receipt to get started.</p>
              </div>
            )}
          </>
        )}
        {tab === "Categories & Settings" && (
          <Settings data={data} commit={commit} reload={reload} run={run} />
        )}
        <footer>
          <CheckCircle2 size={14} />
          Local records. No subscriptions. No cloud uploads.
          <span>Treasurer / 0.1</span>
        </footer>
      </main>
      {entry && (
        <EntryForm
          data={data}
          initial={entry}
          onClose={() => setEntry(undefined)}
          onSave={async (e) => {
            const d = await api.load();
            await commit(
              {
                ...d,
                entries: [...d.entries.filter((x) => x.id !== e.id), e],
                receipts: d.receipts.map((receipt) =>
                  e.receiptIds.includes(receipt.id)
                    ? { ...receipt, status: "ready" }
                    : receipt,
                ),
              },
              "Saved transaction " + e.party,
            );
          }}
        />
      )}
      {importing && (
        <ImportDialog
          data={data}
          onClose={() => si(false)}
          onSave={async (entries) => {
            const d = await api.load();
            await commit(
              { ...d, entries: [...d.entries, ...entries] },
              `Imported ${entries.length} transactions`,
            );
          }}
        />
      )}
      {receipt && (
        <div className="overlay">
          <section className="modal wide">
            <header>
              <h2>Review evidence</h2>
              <button onClick={() => sreceipt(undefined)}>Close</button>
            </header>
            <div className="split">
              <Preview receipt={receipt} />
              <div>
                <h3>{receipt.name}</h3>
                <label>
                  Category
                  <select
                    value={
                      data.receipts.find((r) => r.id === receipt.id)
                        ?.categoryId || ""
                    }
                    onChange={(e) => {
                      const id = e.target.value;
                      run(() =>
                        commit(
                          {
                            ...data,
                            receipts: data.receipts.map((r) =>
                              r.id === receipt.id
                                ? { ...r, categoryId: id }
                                : r,
                            ),
                          },
                          "Categorised evidence",
                        ),
                      );
                    }}
                  >
                    <option value="">Select manually…</option>
                    {data.categories
                      .filter((c) => !c.archived)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  disabled={!!ocr}
                  onClick={() => run(() => recognize([receipt.id]))}
                >
                  Extract / retry text recognition
                </button>
                {ocr && (
                  <p>
                    {progress}% — {ocr}
                  </p>
                )}
                <h3>Extracted suggestions</h3>
                <p className="muted">
                  Review these against the original. The date is inferred;
                  category and period remain under your control.
                </p>
                {(() => {
                  const r = data.receipts.find((r) => r.id === receipt.id)!;
                  return (
                    <>
                      <dl>
                        {Object.entries(r.suggestions || {})
                          .filter(([k]) => k !== "items")
                          .map(([k, v]) => (
                            <div key={k}>
                              <dt>{k}</dt>
                              <dd>{String(v)}</dd>
                            </div>
                          ))}
                      </dl>
                      <button
                        className="primary"
                        onClick={() => {
                          const e = newEntry();
                          e.receiptIds = [r.id];
                          e.date = r.suggestions?.date || "";
                          e.party = r.suggestions?.party || "";
                          e.total = r.suggestions?.total || "0.00";
                          if (r.suggestions?.items?.length) {
                            e.items = r.suggestions.items;
                          }
                          setEntry(e);
                          sreceipt(undefined);
                        }}
                      >
                        Create transaction for review
                      </button>
                      <button
                        onClick={() =>
                          run(() =>
                            commit(
                              {
                                ...data,
                                receipts: data.receipts.map((x) =>
                                  x.id === r.id ? { ...x, status: "ready" } : x,
                                ),
                              },
                              "Marked evidence reviewed",
                            ),
                          )
                        }
                      >
                        Mark reviewed
                      </button>
                      <h3>Recognised text</h3>
                      <pre className="ocr-text">
                        {r.text || "No text extracted yet."}
                      </pre>
                      <h3>Linked transactions</h3>
                      {data.entries
                        .filter((e) => e.receiptIds.includes(r.id))
                        .map((e) => (
                          <button
                            key={e.id}
                            onClick={() => {
                              setEntry(e);
                              sreceipt(undefined);
                            }}
                          >
                            {e.date} · {e.party} · {money(e.total)}
                          </button>
                        ))}
                    </>
                  );
                })()}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
