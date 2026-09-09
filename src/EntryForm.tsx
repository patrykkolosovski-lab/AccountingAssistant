import { useState } from "react";
import type { Data, Entry } from "./types";
import { uid } from "./types";
import { itemTotal, money, validateEntry, amount, isLocked } from "./domain";
import Preview from "./Preview";
import { Trash2 } from "lucide-react";
export default function EntryForm({
  data,
  initial,
  onSave,
  onClose,
  onDelete,
}: {
  data: Data;
  initial: Entry;
  onSave: (e: Entry) => Promise<void>;
  onClose: () => void;
  onDelete?: (e: Entry) => Promise<void>;
}) {
  const [e, set] = useState<Entry>(structuredClone(initial)),
    [error, se] = useState(""),
    [busy, sb] = useState(false),
    [preview, sp] = useState(initial.receiptIds[0] || "");
  const field = (k: keyof Entry, v: unknown) => set({ ...e, [k]: v });
  let computed = "0.00";
  try {
    computed = itemTotal(e.items);
  } catch {}
  const locked = isLocked(data, initial);
  return (
    <div className="overlay">
      <section className="modal wide">
        <header>
          <div>
            <p className="eyebrow">FINANCIAL RECORD</p>
            <h2>
              {data.entries.some((x) => x.id === e.id)
                ? "Transaction details"
                : "New transaction"}
            </h2>
          </div>
          <button onClick={onClose}>Close</button>
        </header>
        <div className="split">
          <form
            onSubmit={async (ev) => {
              ev.preventDefault();
              try {
                se("");
                validateEntry(data, e);
                sb(true);
                await onSave({ ...e, total: amount(e.total) });
                onClose();
              } catch (x) {
                se(String(x));
              } finally {
                sb(false);
              }
            }}
          >
            <fieldset disabled={locked || busy}>
              <div className="segmented">
                <button
                  type="button"
                  className={e.kind === "expense" ? "selected" : ""}
                  onClick={() => field("kind", "expense")}
                >
                  Expense
                </button>
                <button
                  type="button"
                  className={e.kind === "income" ? "selected" : ""}
                  onClick={() => field("kind", "income")}
                >
                  Income
                </button>
              </div>
              <div className="form-grid">
                <label>
                  Date
                  <input
                    required
                    type="date"
                    value={e.date}
                    onChange={(v) => field("date", v.target.value)}
                  />
                </label>
                <label>
                  {e.kind === "income" ? "Received from" : "Paid to"}
                  <input
                    required
                    value={e.party}
                    onChange={(v) => field("party", v.target.value)}
                  />
                </label>
                <label>
                  Category
                  <select
                    required
                    value={e.categoryId}
                    onChange={(v) => field("categoryId", v.target.value)}
                  >
                    <option value="">Select manually…</option>
                    {data.categories
                      .filter((c) => !c.archived || c.id === e.categoryId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              <h3>Items</h3>
              {e.items.map((item, i) => (
                <div className="item-row" key={i}>
                  <input
                    aria-label="Description"
                    placeholder="Description"
                    value={item.description}
                    onChange={(v) =>
                      field(
                        "items",
                        e.items.map((x, j) =>
                          j === i ? { ...x, description: v.target.value } : x,
                        ),
                      )
                    }
                  />
                  <input
                    aria-label="Units"
                    type="number"
                    min="0"
                    step="any"
                    value={item.quantity}
                    onChange={(v) =>
                      field(
                        "items",
                        e.items.map((x, j) =>
                          j === i ? { ...x, quantity: v.target.value } : x,
                        ),
                      )
                    }
                  />
                  <input
                    aria-label="Unit price"
                    type="number"
                    min="0"
                    step="any"
                    value={item.price}
                    onChange={(v) =>
                      field(
                        "items",
                        e.items.map((x, j) =>
                          j === i ? { ...x, price: v.target.value } : x,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    onClick={() =>
                      field(
                        "items",
                        e.items.filter((_, j) => j !== i),
                      )
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  field("items", [
                    ...e.items,
                    { description: "", quantity: "1", price: "0.00" },
                  ])
                }
              >
                + Add item
              </button>
              <div className="row spread">
                <span>Item total: {money(computed)}</span>
                <button type="button" onClick={() => field("total", computed)}>
                  Use item total
                </button>
              </div>
              <label>
                Recorded payment total (€)
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={e.total}
                  onChange={(v) => field("total", v.target.value)}
                />
              </label>
              {e.items.length > 0 && Number(computed) !== Number(e.total) && (
                <p className="notice">
                  Item total differs from payment. Check tax, discounts, or
                  rounding; explain the difference in comments.
                </p>
              )}
              <label>
                Comments
                <textarea
                  value={e.comments}
                  onChange={(v) => field("comments", v.target.value)}
                />
              </label>
              <h3>Evidence</h3>
              <div className="attachment-list">
                {data.receipts.map((r) => (
                  <div className="row" key={r.id}>
                    <input
                      type="checkbox"
                      checked={e.receiptIds.includes(r.id)}
                      onChange={(v) =>
                        field(
                          "receiptIds",
                          v.target.checked
                            ? [...e.receiptIds, r.id]
                            : e.receiptIds.filter((id) => id !== r.id),
                        )
                      }
                    />
                    <button type="button" onClick={() => sp(r.id)}>
                      {r.name}
                    </button>
                  </div>
                ))}
              </div>
              {!e.receiptIds.length && (
                <p className="notice">
                  Missing evidence — you can still save this record.
                </p>
              )}
            </fieldset>
            {locked && (
              <p className="notice">
                This period is locked. Unlock it in Settings before editing.
              </p>
            )}
            {error && <p className="error">{error}</p>}
            <div className="row spread form-actions">
              {onDelete && (
                <button
                  type="button"
                  className="danger"
                  disabled={locked || busy}
                  onClick={async () => {
                    if (
                      !window.confirm(
                        "Delete this transaction? This cannot be undone.",
                      )
                    )
                      return;
                    try {
                      se("");
                      sb(true);
                      await onDelete(initial);
                      onClose();
                    } catch (x) {
                      se(String(x));
                    } finally {
                      sb(false);
                    }
                  }}
                >
                  <Trash2 size={16} /> Delete transaction
                </button>
              )}
              <button className="primary" disabled={locked || busy}>
                {busy ? "Saving…" : "Save transaction"}
              </button>
            </div>
          </form>
          <Preview receipt={data.receipts.find((r) => r.id === preview)} />
        </div>
      </section>
    </div>
  );
}
export const newEntry = (): Entry => ({
  id: uid(),
  kind: "expense",
  date: "",
  categoryId: "",
  party: "",
  items: [],
  total: "0.00",
  comments: "",
  receiptIds: [],
});
