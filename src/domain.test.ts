import { describe, it, expect } from "vitest";
import {
  amount,
  itemTotal,
  totals,
  parseNumber,
  parseDate,
  validateYear,
  validateEntry,
  periodIndex,
  suggest,
} from "./domain";
import { empty, type Year, type Entry } from "./types";
const year: Year = {
  id: "y",
  name: "2026",
  opening: "100",
  periods: Array.from({ length: 6 }, (_, i) => ({
    start: `2026-${String(i * 2 + 1).padStart(2, "0")}-01`,
    end: new Date(Date.UTC(2026, i * 2 + 2, 0)).toISOString().slice(0, 10),
    locked: false,
  })),
};
const entry: Entry = {
  id: "e",
  kind: "expense",
  date: "2026-02-28",
  party: "Shop",
  categoryId: "c",
  items: [],
  total: "10.20",
  comments: "",
  receiptIds: [],
};
const data = {
  ...empty,
  years: [year],
  categories: [{ id: "c", name: "Events", color: "#000000", archived: false }],
};
describe("financial arithmetic", () => {
  it("rounds half cents deterministically", () =>
    expect(amount("1.005")).toBe("1.01"));
  it("supports fractional units and multiple lines", () =>
    expect(
      itemTotal([
        { description: "a", quantity: "1.5", price: "2.35" },
        { description: "b", quantity: "2", price: ".10" },
      ]),
    ).toBe("3.73"));
  it("keeps income, expense and net separate", () =>
    expect(
      totals([entry, { ...entry, id: "f", kind: "income", total: "30.30" }]),
    ).toEqual({ income: "30.30", expense: "10.20", net: "20.10" }));
});
describe("periods and validation", () => {
  it("covers exact boundaries", () => {
    validateYear(year);
    expect(periodIndex(year, "2026-02-28")).toBe(0);
    expect(periodIndex(year, "2026-03-01")).toBe(1);
  });
  it("rejects gaps", () => {
    const y = structuredClone(year);
    y.periods[1].start = "2026-03-02";
    expect(() => validateYear(y)).toThrow();
  });
  it("allows missing evidence", () =>
    expect(() => validateEntry(data, entry)).not.toThrow());
  it("rejects invalid and outside dates", () => {
    expect(() =>
      validateEntry(data, { ...entry, date: "2026-02-30" }),
    ).toThrow();
    expect(() =>
      validateEntry(data, { ...entry, date: "2027-01-01" }),
    ).toThrow();
  });
  it("rejects locked periods", () => {
    const d = structuredClone(data);
    d.years[0].periods[0].locked = true;
    expect(() => validateEntry(d, entry)).toThrow("locked");
  });
});
describe("import formats", () => {
  it("parses European amounts", () =>
    expect(parseNumber("€ 1.234,56", ",")).toBe("1234.56"));
  it("parses signed bank amounts", () =>
    expect(parseNumber("-12,50", ",")).toBe("-12.50"));
  it("parses US amounts", () =>
    expect(parseNumber("1,234.56", ".")).toBe("1234.56"));
  it("rejects malformed amounts", () =>
    expect(() => parseNumber("unknown", ",")).toThrow());
  it("distinguishes date conventions", () => {
    expect(parseDate("03/04/2026", "DMY")).toBe("2026-04-03");
    expect(parseDate("03/04/2026", "MDY")).toBe("2026-03-04");
  });
});
describe("OCR suggestions", () => {
  it("extracts explicit Dutch labels", () =>
    expect(
      suggest("Leverancier: Boekhandel\n12-03-2026\nTotaal € 12,50"),
    ).toMatchObject({
      party: "Boekhandel",
      date: "2026-03-12",
      total: "12.50",
    }));
  it("uses a filename date before dates in the document", () =>
    expect(
      suggest(
        "Datum: 01-03-2026\nVervaldatum: 15-03-2026",
        "ING_2026-02-27_invoice.pdf",
      ).date,
    ).toBe("2026-02-27"));
  it("falls back to the date closest to a date label", () =>
    expect(
      suggest("Due 15-03-2026\nDatum: 01-03-2026", "invoice.pdf").date,
    ).toBe("2026-03-01"));
  it("falls back to the first valid date format", () =>
    expect(suggest("Purchase 04-03-2026", "invoice.pdf").date).toBe(
      "2026-03-04",
    ));
  it("supports compact dates in filenames", () =>
    expect(suggest("Datum: 01-03-2026", "receipt_20260227.jpg").date).toBe(
      "2026-02-27",
    ));
  it("uses the highest labelled total", () =>
    expect(suggest("Totaal 12,50\nGrand total 18,75").total).toBe("18.75"));
  it("uses the highest two-decimal number when no total is labelled", () =>
    expect(suggest("Item 12,50\nOther amount 25,99").total).toBe("25.99"));
  it("extracts an ING recipient between date and payment type", () =>
    expect(
      suggest(
        "ING Bankafschrift\n12-03-2026 STUDENTENVERENIGING ABC Overschrijving EUR 25,00",
        "statement.pdf",
      ).party,
    ).toBe("STUDENTENVERENIGING ABC"));
  it("does not fabricate party from an unlabeled first line", () =>
    expect(suggest("THANK YOU\nTotal amount 10.00").party).toBeUndefined());
  it("extracts balanced item rows", () =>
    expect(suggest("Notebooks 2 3,50 7,00").items).toEqual([
      { description: "Notebooks", quantity: "2", price: "3.50" },
    ]));
});
