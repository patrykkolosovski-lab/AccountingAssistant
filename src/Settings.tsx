import { useState } from "react";
import { open, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import type { Data, Year } from "./types";
import { uid } from "./types";
import { validateYear, periodIndex } from "./domain";
export default function Settings({
  data,
  commit,
  reload,
  run,
}: {
  data: Data;
  commit: (d: Data, a: string) => Promise<void>;
  reload: () => Promise<void>;
  run: (fn: () => Promise<void>) => void;
}) {
  const [name, sn] = useState(""),
    [color, sc] = useState("#49775b"),
    [year, sy] = useState<Year>(),
    [changes, sch] = useState<number | null>(null);
  const saveYear = async () => {
    if (!year) return;
    validateYear(year);
    for (const y of data.years.filter((y) => y.id !== year.id))
      if (
        year.periods[0].start <= y.periods[5].end &&
        y.periods[0].start <= year.periods[5].end
      )
        throw Error("Financial years cannot overlap.");
    const old = data.years.find((y) => y.id === year.id);
    if (old)
      for (const e of data.entries) {
        const p = periodIndex(old, e.date);
        if (p >= 0 && periodIndex(year, e.date) < 0)
          throw Error("Year dates would exclude existing records.");
      }
    if (changes === null) {
      sch(
        data.entries.filter(
          (e) => old && periodIndex(old, e.date) !== periodIndex(year, e.date),
        ).length,
      );
      return;
    }
    await commit(
      { ...data, years: [...data.years.filter((y) => y.id !== year.id), year] },
      "Saved financial year and period configuration",
    );
    sy(undefined);
    sch(null);
  };
  return (
    <div className="settings-grid">
      <section className="panel">
        <h2>Categories</h2>
        <p>Create your own labels for income and expenses.</p>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              if (!name.trim()) return;
              if (
                data.categories.some(
                  (c) => c.name.toLowerCase() === name.trim().toLowerCase(),
                )
              )
                throw Error("Category already exists.");
              await commit(
                {
                  ...data,
                  categories: [
                    ...data.categories,
                    { id: uid(), name: name.trim(), color, archived: false },
                  ],
                },
                "Created category " + name,
              );
              sn("");
            });
          }}
        >
          <input
            placeholder="e.g. Events & activities"
            value={name}
            onChange={(e) => sn(e.target.value)}
          />
          <input
            type="color"
            value={color}
            onChange={(e) => sc(e.target.value)}
          />
          <button className="primary">Add</button>
        </form>
        {data.categories.map((c) => (
          <div className="category-row" key={c.id}>
            <input
              type="color"
              aria-label="Category colour"
              defaultValue={c.color}
              onBlur={(e) => {
                const value = e.target.value;
                if (value !== c.color)
                  run(() =>
                    commit(
                      {
                        ...data,
                        categories: data.categories.map((x) =>
                          x.id === c.id ? { ...x, color: value } : x,
                        ),
                      },
                      "Changed category colour",
                    ),
                  );
              }}
            />
            <input
              aria-label="Category name"
              defaultValue={c.name}
              onBlur={(e) => {
                const value = e.target.value.trim();
                if (value && value !== c.name)
                  run(async () => {
                    if (
                      data.categories.some(
                        (x) =>
                          x.id !== c.id &&
                          x.name.toLowerCase() === value.toLowerCase(),
                      )
                    )
                      throw Error("Category already exists");
                    await commit(
                      {
                        ...data,
                        categories: data.categories.map((x) =>
                          x.id === c.id ? { ...x, name: value } : x,
                        ),
                      },
                      "Renamed category",
                    );
                  });
              }}
            />
            <button
              onClick={() =>
                run(() =>
                  commit(
                    {
                      ...data,
                      categories: data.categories.map((x) =>
                        x.id === c.id ? { ...x, archived: !x.archived } : x,
                      ),
                    },
                    c.archived ? "Restored category" : "Archived category",
                  ),
                )
              }
            >
              {c.archived ? "Restore" : "Archive"}
            </button>
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>Financial years & periods</h2>
        <p>Six consecutive periods. Transaction dates determine the period.</p>
        {data.years.map((y) => (
          <div key={y.id}>
            <div className="row spread">
              <strong>{y.name}</strong>
              <button
                onClick={() => {
                  sy(structuredClone(y));
                  sch(null);
                }}
              >
                Edit dates / opening balance
              </button>
            </div>
            {y.periods.map((p, i) => (
              <div className="period-row" key={i}>
                <span>P{i + 1}</span>
                <small>
                  {p.start} → {p.end}
                </small>
                <button
                  onClick={() =>
                    run(() =>
                      commit(
                        {
                          ...data,
                          years: data.years.map((x) =>
                            x.id === y.id
                              ? {
                                  ...x,
                                  periods: x.periods.map((v, j) =>
                                    i === j ? { ...v, locked: !v.locked } : v,
                                  ),
                                }
                              : x,
                          ),
                        },
                        `${p.locked ? "Unlocked" : "Locked"} ${y.name} period ${i + 1}`,
                      ),
                    )
                  }
                >
                  {p.locked ? "Unlock" : "Lock"}
                </button>
              </div>
            ))}
          </div>
        ))}
        <button
          onClick={() => {
            const n = new Date().getFullYear();
            sy({
              id: uid(),
              name: String(n),
              opening: "0.00",
              periods: Array.from({ length: 6 }, (_, i) => ({
                start: `${n}-${String(i * 2 + 1).padStart(2, "0")}-01`,
                end: new Date(Date.UTC(n, i * 2 + 2, 0))
                  .toISOString()
                  .slice(0, 10),
                locked: false,
              })),
            });
            sch(null);
          }}
        >
          + Financial year
        </button>
        {year && (
          <div className="year-editor">
            <label>
              Year name
              <input
                value={year.name}
                onChange={(e) => {
                  sy({ ...year, name: e.target.value });
                  sch(null);
                }}
              />
            </label>
            <label>
              Opening balance (€)
              <input
                type="number"
                step="0.01"
                value={year.opening}
                onChange={(e) => {
                  sy({ ...year, opening: e.target.value });
                  sch(null);
                }}
              />
            </label>
            {year.periods.map((p, i) => (
              <div className="row" key={i}>
                <b>P{i + 1}</b>
                {(["start", "end"] as const).map((k) => (
                  <input
                    key={k}
                    aria-label={`Period ${i + 1} ${k}`}
                    type="date"
                    disabled={p.locked}
                    value={p[k]}
                    onChange={(e) => {
                      sy({
                        ...year,
                        periods: year.periods.map((v, j) =>
                          i === j ? { ...v, [k]: e.target.value } : v,
                        ),
                      });
                      sch(null);
                    }}
                  />
                ))}
              </div>
            ))}
            {changes !== null && (
              <p className="notice">
                {changes} records will be assigned a different period. Confirm
                to apply.
              </p>
            )}
            <button className="primary" onClick={() => run(saveYear)}>
              {changes === null ? "Preview changes" : "Confirm changes"}
            </button>
            <button onClick={() => sy(undefined)}>Cancel</button>
          </div>
        )}
      </section>
      <section className="panel">
        <h2>Receipt incoming folder</h2>
        <p>
          The folder is checked on launch and every 15 seconds while the app is
          open. Originals are copied into the library.
        </p>
        <code>{data.incoming || "No folder selected"}</code>
        <div className="row">
          <button
            onClick={() =>
              run(async () => {
                const path = await open({ directory: true, multiple: false });
                if (typeof path === "string")
                  await commit(
                    { ...data, incoming: path },
                    "Changed incoming folder",
                  );
              })
            }
          >
            Choose folder
          </button>
          <button
            onClick={() =>
              run(async () => {
                const errors = await invoke<string[]>("scan_folder");
                await reload();
                if (errors.length) throw Error(errors.join("\n"));
              })
            }
          >
            Scan now
          </button>
          <button
            onClick={() =>
              run(() =>
                commit(
                  { ...data, incoming: "" },
                  "Disconnected incoming folder",
                ),
              )
            }
          >
            Disconnect
          </button>
        </div>
      </section>
      <section className="panel">
        <h2>Backup & handover</h2>
        <p>
          Move one complete archive between Windows and Mac. Keep only one
          active copy.
        </p>
        <div className="row">
          <button
            className="primary"
            onClick={() =>
              run(async () => {
                const path = await saveDialog({
                  defaultPath: "Treasurer-backup.zip",
                  filters: [{ name: "Backup", extensions: ["zip"] }],
                });
                if (path) await invoke("create_backup", { path });
              })
            }
          >
            Create backup
          </button>
          <button
            onClick={() =>
              run(async () => {
                const path = await open({
                  multiple: false,
                  filters: [{ name: "Backup", extensions: ["zip"] }],
                });
                if (
                  typeof path === "string" &&
                  confirm(
                    "Replace current records with this backup? A safety backup will be created first.",
                  )
                ) {
                  await invoke("restore_backup", { path });
                  await reload();
                }
              })
            }
          >
            Restore backup
          </button>
        </div>
        <p className="muted">
          Backups contain financial and personal data. Store them somewhere you
          trust.
        </p>
      </section>
      <section className="panel full">
        <h2>Change history</h2>
        <div className="history">
          {data.audit
            .slice()
            .reverse()
            .map((a, i) => (
              <div className="row" key={i}>
                <time>{new Date(Number(a.at)).toLocaleString("nl-NL")}</time>
                <span>{a.action}</span>
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}
