import { useState } from "react";
import * as XLSX from "xlsx";
import type { Data, Entry } from "./types";
import { uid } from "./types";
import { parseNumber, parseDate, validateEntry, money } from "./domain";
const fields = [
  "date",
  "party",
  "amount",
  "income",
  "expense",
  "category",
  "comments",
  "units",
  "unitPrice",
] as const;
export default function ImportDialog({
  data,
  onSave,
  onClose,
}: {
  data: Data;
  onSave: (e: Entry[]) => Promise<void>;
  onClose: () => void;
}) {
  const [book, sbook] = useState<XLSX.WorkBook>(),
    [sheet, ss] = useState(""),
    [name, sn] = useState(""),
    [map, sm] = useState<Record<string, string>>({}),
    [decimal, sd] = useState<"," | ".">(","),
    [format, sf] = useState("DMY"),
    [category, sc] = useState(""),
    [catMap, scm] = useState<Record<string, string>>({}),
    [rows, sr] = useState<
      {
        entry?: Entry;
        error?: string;
        duplicate: boolean;
        accept: boolean;
        row: number;
      }[]
    >([]),
    [error, se] = useState(""),
    [busy, sb] = useState(false);
  const table =
    book && sheet
      ? XLSX.utils.sheet_to_json<string[]>(book.Sheets[sheet], {
          header: 1,
          raw: false,
          defval: "",
        })
      : [];
  const headers = table[0] || [];
  const sourceCategories = map.category
    ? [
        ...new Set(
          table
            .slice(1)
            .map((r) => String(r[Number(map.category) - 1] || ""))
            .filter(Boolean),
        ),
      ]
    : [];
  function preview() {
    try {
      if (
        !map.date ||
        !map.party ||
        (!map.amount && (!map.income || !map.expense))
      )
        throw Error(
          "Map date, counterparty, and signed amount or both income and expense.",
        );
      const seen = new Set(
        data.entries.map(
          (e) => `${e.date}|${e.party.toLowerCase()}|${e.kind}|${e.total}`,
        ),
      );
      sr(
        table
          .slice(1)
          .filter((r) => r.some((v) => String(v).trim()))
          .map((r, i) => {
            try {
              const get = (k: string) =>
                map[k] ? String(r[Number(map[k]) - 1] || "") : "";
              let val: string, kind: "income" | "expense";
              if (map.amount) {
                val = parseNumber(get("amount"), decimal);
                kind = Number(val) < 0 ? "expense" : "income";
                val = val.replace("-", "");
              } else {
                const inc = parseNumber(get("income") || "0", decimal),
                  exp = parseNumber(get("expense") || "0", decimal);
                if (
                  Number(inc) < 0 ||
                  Number(exp) < 0 ||
                  (Number(inc) > 0 && Number(exp) > 0)
                )
                  throw Error("Use one non-negative income or expense amount.");
                kind = Number(inc) > 0 ? "income" : "expense";
                val = kind === "income" ? inc : exp;
              }
              const e: Entry = {
                id: uid(),
                kind,
                date: parseDate(get("date"), format),
                party: get("party"),
                categoryId: map.category
                  ? catMap[get("category")] || category
                  : category,
                total: val,
                items:
                  get("units") && get("unitPrice")
                    ? [
                        {
                          description: "Imported item",
                          quantity: get("units").replace(",", "."),
                          price: parseNumber(get("unitPrice"), decimal),
                        },
                      ]
                    : [],
                comments: get("comments"),
                receiptIds: [],
                source: `${name} / ${sheet} / row ${i + 2}`,
              };
              validateEntry(data, e);
              const key = `${e.date}|${e.party.toLowerCase()}|${e.kind}|${e.total}`;
              const duplicate = seen.has(key);
              seen.add(key);
              return { entry: e, duplicate, accept: !duplicate, row: i + 2 };
            } catch (e) {
              return {
                error: String(e),
                duplicate: false,
                accept: false,
                row: i + 2,
              };
            }
          }),
      );
      se("");
    } catch (e) {
      se(String(e));
    }
  }
  return (
    <div className="overlay">
      <section className="modal">
        <header>
          <h2>Import records</h2>
          <button onClick={onClose}>Cancel</button>
        </header>
        <p>
          Review mapped rows before anything is saved. Receipts are linked
          separately.
        </p>
        <input
          type="file"
          accept=".xlsx,.csv"
          onChange={async (e) => {
            try {
              const f = e.target.files?.[0];
              if (!f) return;
              const b = XLSX.read(await f.arrayBuffer(), {
                type: "array",
                cellDates: true,
              });
              sbook(b);
              ss(b.SheetNames[0]);
              sn(f.name);
              sr([]);
              sm({});
            } catch (e) {
              se(String(e));
            }
          }}
        />
        {book && (
          <>
            <div className="form-grid">
              <label>
                Sheet
                <select
                  value={sheet}
                  onChange={(e) => {
                    ss(e.target.value);
                    sm({});
                    sr([]);
                  }}
                >
                  {book.SheetNames.map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label>
                Decimal separator
                <select
                  value={decimal}
                  onChange={(e) => {
                    sd(e.target.value as "," | ".");
                    sr([]);
                  }}
                >
                  <option value=",">Comma: 1.234,56</option>
                  <option value=".">Point: 1,234.56</option>
                </select>
              </label>
              <label>
                Date format
                <select
                  value={format}
                  onChange={(e) => {
                    sf(e.target.value);
                    sr([]);
                  }}
                >
                  <option value="DMY">Day / month / year</option>
                  <option value="MDY">Month / day / year</option>
                  <option value="YMD">Year / month / day</option>
                </select>
              </label>
              <label>
                Default category
                <select
                  value={category}
                  onChange={(e) => {
                    sc(e.target.value);
                    sr([]);
                  }}
                >
                  <option value="">Select category…</option>
                  {data.categories
                    .filter((c) => !c.archived)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <div className="mapping">
              {fields.map((f) => (
                <label key={f}>
                  {f}
                  <select
                    value={map[f] || ""}
                    onChange={(e) => {
                      sm({ ...map, [f]: e.target.value });
                      sr([]);
                    }}
                  >
                    <option value="">Not mapped</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i + 1}>
                        {h || `Column ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {sourceCategories.map((c) => (
              <label key={c}>
                Map category “{c}”
                <select
                  value={catMap[c] || ""}
                  onChange={(e) => {
                    scm({ ...catMap, [c]: e.target.value });
                    sr([]);
                  }}
                >
                  <option value="">Use selected default</option>
                  {data.categories
                    .filter((c) => !c.archived)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
            ))}
            <button onClick={preview}>Validate & preview</button>
            <div className="import-preview">
              {rows.map((r, i) => (
                <div className="row" key={i}>
                  <input
                    type="checkbox"
                    disabled={!r.entry}
                    checked={r.accept}
                    onChange={(e) =>
                      sr(
                        rows.map((x, j) =>
                          i === j ? { ...x, accept: e.target.checked } : x,
                        ),
                      )
                    }
                  />
                  <span>
                    Row {r.row}:{" "}
                    {r.error ||
                      `${r.entry!.date} · ${r.entry!.party} · ${money(r.entry!.total)}`}
                  </span>
                  {r.duplicate && <b className="badge">Possible duplicate</b>}
                </div>
              ))}
            </div>
            <button
              className="primary"
              disabled={busy || !rows.some((r) => r.accept)}
              onClick={async () => {
                sb(true);
                try {
                  await onSave(
                    rows
                      .filter((r) => r.accept && r.entry)
                      .map((r) => r.entry!),
                  );
                  onClose();
                } catch (e) {
                  se(String(e));
                } finally {
                  sb(false);
                }
              }}
            >
              Import {rows.filter((r) => r.accept).length} selected records
            </button>
          </>
        )}
        {error && <p className="error">{error}</p>}
      </section>
    </div>
  );
}
