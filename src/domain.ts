import Decimal from "decimal.js";
import type { Data, Entry, Item, Receipt, Year, Suggestion } from "./types";
export const money = (v: string | number) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(
    Number(v),
  );
export const amount = (v: string) =>
  new Decimal(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
export const itemTotal = (items: Item[]) =>
  items
    .reduce(
      (s, i) => s.plus(new Decimal(i.quantity || 0).mul(i.price || 0)),
      new Decimal(0),
    )
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toFixed(2);
export const periodIndex = (y: Year, date: string) =>
  y.periods.findIndex((p) => p.start <= date && date <= p.end);
export const isLocked = (d: Data, e: Entry) =>
  d.years.some((y) =>
    y.periods.some((p) => p.locked && p.start <= e.date && e.date <= p.end),
  );
export const updateEvidenceLinks = (
  receipts: Receipt[],
  entries: Entry[],
  affectedReceiptIds: string[],
) => {
  const affected = new Set(affectedReceiptIds);
  const linked = new Set(entries.flatMap((entry) => entry.receiptIds));
  return receipts.map((receipt) =>
    affected.has(receipt.id)
      ? {
          ...receipt,
          status: linked.has(receipt.id)
            ? ("ready" as const)
            : ("unlinked" as const),
        }
      : receipt,
  );
};
export const validDate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !Number.isNaN(Date.parse(s)) &&
  new Date(s + "T12:00:00Z").toISOString().slice(0, 10) === s;
export function validateYear(y: Year) {
  if (y.periods.length !== 6) throw Error("Define exactly six periods.");
  new Decimal(y.opening);
  y.periods.forEach((p, i) => {
    if (!validDate(p.start) || !validDate(p.end) || p.start > p.end)
      throw Error("Each period needs valid start and end dates.");
    if (
      i &&
      new Date(Date.parse(y.periods[i - 1].end) + 86400000)
        .toISOString()
        .slice(0, 10) !== p.start
    )
      throw Error("Periods must be consecutive, without gaps or overlaps.");
  });
}
export function validateEntry(d: Data, e: Entry) {
  if (!validDate(e.date)) throw Error("Enter a valid date.");
  if (!e.party.trim()) throw Error("Enter who paid or received the payment.");
  if (!d.categories.some((c) => c.id === e.categoryId))
    throw Error("Select a category.");
  if (!d.years.some((y) => periodIndex(y, e.date) >= 0))
    throw Error("Date must fall within a configured financial year.");
  if (new Decimal(e.total).lt(0))
    throw Error("Use a positive amount and choose income or expense.");
  amount(e.total);
  e.items.forEach((i) => {
    if (new Decimal(i.quantity).lt(0) || new Decimal(i.price).lt(0))
      throw Error("Units and prices must be non-negative.");
  });
  if (isLocked(d, e)) throw Error("This period is locked.");
}
export function totals(entries: Entry[]) {
  let income = new Decimal(0),
    expense = new Decimal(0);
  entries.forEach((e) => {
    if (e.kind === "income") income = income.plus(e.total);
    else expense = expense.plus(e.total);
  });
  return {
    income: income.toFixed(2),
    expense: expense.toFixed(2),
    net: income.minus(expense).toFixed(2),
  };
}
export function parseNumber(raw: string, decimal: "," | ".") {
  let s = raw.trim().replace(/[€\s]/g, "");
  if (/^\(.*\)$/.test(s)) s = "-" + s.slice(1, -1);
  s =
    decimal === ","
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw Error("Invalid amount: " + raw);
  return amount(s);
}
export function parseDate(raw: string, format: string) {
  if (validDate(raw)) return raw;
  const m = raw.trim().match(/^(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})$/);
  if (!m) throw Error("Invalid date: " + raw);
  const a = m.slice(1);
  let s =
    format === "MDY"
      ? `${a[2]}-${a[0].padStart(2, "0")}-${a[1].padStart(2, "0")}`
      : format === "YMD"
        ? `${a[0]}-${a[1].padStart(2, "0")}-${a[2].padStart(2, "0")}`
        : `${a[2]}-${a[1].padStart(2, "0")}-${a[0].padStart(2, "0")}`;
  if (!validDate(s)) throw Error("Invalid date: " + raw);
  return s;
}
const documentDatePattern =
  /(?<!\d)(\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})(?!\d)/g;

function normaliseRecognisedDate(raw: string) {
  return parseDate(raw, /^\d{4}/.test(raw) ? "YMD" : "DMY");
}

export function dateFromFilename(filename: string) {
  const stem = filename.replace(/\.[^.]+$/, "");
  for (const match of stem.matchAll(documentDatePattern)) {
    try {
      return normaliseRecognisedDate(match[1]);
    } catch {
      // Try the next date-shaped part of the filename.
    }
  }
  for (const match of stem.matchAll(/(?<!\d)(\d{4})(\d{2})(\d{2})(?!\d)/g)) {
    try {
      return parseDate(`${match[1]}-${match[2]}-${match[3]}`, "YMD");
    } catch {
      // Try the next compact date.
    }
  }
  for (const match of stem.matchAll(/(?<!\d)(\d{2})(\d{2})(\d{4})(?!\d)/g)) {
    try {
      return parseDate(`${match[1]}-${match[2]}-${match[3]}`, "DMY");
    } catch {
      // Try the next compact date.
    }
  }
}

function dateFromText(text: string) {
  const matches = [...text.matchAll(documentDatePattern)];
  const labelled = matches.filter((match) => {
    const context = text.slice(Math.max(0, match.index - 40), match.index);
    return /(?:^|\b)(date|datum)\s*[:\-]?\s*$/i.test(context);
  });
  for (const match of [...labelled, ...matches]) {
    try {
      return normaliseRecognisedDate(match[1]);
    } catch {
      // Ignore invalid OCR dates.
    }
  }
}

function monetaryValues(text: string) {
  const matches = text.match(
    /(?<!\d)(?:\d{1,3}(?:[., ]\d{3})+|\d+)[.,]\d{2}(?!\d)/g,
  );
  return (matches || []).flatMap((raw) => {
    try {
      const decimal = raw.lastIndexOf(",") > raw.lastIndexOf(".") ? "," : ".";
      return [parseNumber(raw.replace(/ /g, ""), decimal)];
    } catch {
      return [];
    }
  });
}

function largest(values: string[]) {
  return values.reduce<string | undefined>(
    (best, value) =>
      best === undefined || new Decimal(value).gt(best) ? value : best,
    undefined,
  );
}

function ingRecipient(text: string, filename: string) {
  if (!/\bING\b/i.test(`${filename} ${text}`)) return;
  const paymentType =
    "Betaalautomaat|Overschrijving|Incasso|SEPA[ -]?incasso|iDEAL|Geldautomaat|Online bankieren|Verzamelbetaling|Acceptgiro|Transfer|Kosten";
  const date =
    "(?:\\d{1,2}[./-]\\d{1,2}[./-]\\d{4}|\\d{4}[./-]\\d{1,2}[./-]\\d{1,2})";
  const match = text
    .replace(/\s+/g, " ")
    .match(new RegExp(`${date}\\s+(.+?)\\s+(?:${paymentType})\\b`, "i"));
  return match?.[1].replace(/\s+/g, " ").trim();
}

export function suggest(text: string, filename = ""): Suggestion {
  const lines = text
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  const out: Suggestion = {};
  out.date = dateFromFilename(filename) || dateFromText(text);
  const totalLines = lines.filter(
    (l) =>
      /\b(grand total|invoice total|totaal|total amount|amount due|te betalen)\b/i.test(
        l,
      ) && !/subtotal|subtotaal|excl/i.test(l),
  );
  out.total = largest(
    totalLines.length
      ? totalLines.flatMap(monetaryValues)
      : monetaryValues(text),
  );
  const ingParty = ingRecipient(text, filename);
  const party = lines.find((l) =>
    /^(supplier|vendor|leverancier|customer|klant)\s*:/i.test(l),
  );
  if (ingParty) out.party = ingParty;
  else if (party) out.party = party.replace(/^[^:]+:\s*/, "");
  const items: Item[] = [];
  for (const l of lines) {
    const m = l.match(
      /^(.+?)\s+(\d+(?:[.,]\d+)?)\s+(\d+[.,]\d{2})\s+(\d+[.,]\d{2})$/,
    );
    if (m) {
      const quantity = m[2].replace(",", "."),
        price = m[3].replace(",", ".");
      if (
        itemTotal([{ description: m[1], quantity, price }]) ===
        amount(m[4].replace(",", "."))
      )
        items.push({ description: m[1], quantity, price });
    }
  }
  if (items.length) out.items = items;
  return out;
}
