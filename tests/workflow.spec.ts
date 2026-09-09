import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const year = {
      id: "year",
      name: "2026",
      opening: "100.00",
      periods: Array.from({ length: 6 }, (_, i) => ({
        start: `2026-${String(i * 2 + 1).padStart(2, "0")}-01`,
        end: new Date(Date.UTC(2026, i * 2 + 2, 0)).toISOString().slice(0, 10),
        locked: false,
      })),
    };
    let data = {
      revision: 0,
      categories: [
        { id: "events", name: "Events", color: "#49775b", archived: false },
      ],
      years: [year],
      entries: [],
      receipts: [],
      audit: [],
      incoming: "",
    };
    data = JSON.parse(sessionStorage.getItem("seed") || "null") || data;
    (window as any).isTauri = true;
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args: any) => {
          if (cmd === "load_data") return structuredClone(data);
          if (cmd === "save_data") {
            data = {
              ...args.data,
              revision: data.revision + 1,
              audit: [
                ...data.audit,
                { at: String(Date.now()), action: args.action },
              ],
            };
            sessionStorage.setItem("seed", JSON.stringify(data));
            return structuredClone(data);
          }
          if (cmd === "read_evidence") return sessionStorage.getItem("fixture");
          throw Error("Unhandled test command " + cmd);
        },
      },
    });
    (window as any).__seed = (d: any) => {
      data = { ...data, ...d };
      sessionStorage.setItem("seed", JSON.stringify(data));
    };
  });
});
test("record income and expense, filter, edit, and lock period", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Financial overview" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Up to date" }).click();
  await expect(page.getByText(/Last confirmed/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Last confirmed/)).toBeVisible();
  await page
    .getByRole("button", { name: "New transaction", exact: true })
    .click();
  let form = page.locator(".modal");
  await form.getByLabel("Date", { exact: true }).fill("2026-03-12");
  await expect(form.getByLabel("Units")).toHaveCount(0);
  await form.getByLabel("Paid to", { exact: true }).fill("Campus Catering");
  await form.locator("select").selectOption("events");
  await form.getByLabel("Recorded payment total").fill("25.50");
  await form.getByRole("button", { name: "Save transaction" }).click();
  await expect(
    page.getByRole("cell", { name: "Campus Catering Expense" }),
  ).toBeVisible();
  await expect(page.locator(".stats")).toContainText("25,50");
  await page
    .getByRole("button", { name: "New transaction", exact: true })
    .click();
  form = page.locator(".modal");
  await form.getByRole("button", { name: "Income", exact: true }).click();
  await form.getByLabel("Date", { exact: true }).fill("2026-04-01");
  await form
    .getByLabel("Received from", { exact: true })
    .fill("Member contribution");
  await form.locator("select").selectOption("events");
  await form.getByLabel("Recorded payment total").fill("50");
  await form.getByRole("button", { name: "Save transaction" }).click();
  await expect(page.locator(".stats .net")).toContainText("24,50");
  await page.getByPlaceholder("Search transactions…").fill("Campus");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByPlaceholder("Search transactions…").clear();
  await page
    .getByRole("button", { name: "Categories & Settings", exact: true })
    .click();
  await page
    .locator(".period-row")
    .nth(1)
    .getByRole("button", { name: "Lock", exact: true })
    .click();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("cell", { name: "Campus Catering Expense" }).click();
  await expect(
    page.locator(".modal").getByRole("button", { name: "Save transaction" }),
  ).toBeDisabled();
  await page
    .locator(".modal")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page.screenshot({ path: "artifacts/home.png", fullPage: true });
  expect(errors).toEqual([]);
});
test("offline OCR runs with bundled assets and requires review", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1000;
    canvas.height = 500;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 1000, 500);
    ctx.fillStyle = "black";
    ctx.font = "32px Arial";
    [
      "Leverancier: Campus Shop",
      "12-03-2026",
      "Notebooks 2 3,50 7,00",
      "Totaal EUR 7,00",
    ].forEach((s, i) => ctx.fillText(s, 50, 80 + i * 70));
    sessionStorage.setItem(
      "fixture",
      canvas.toDataURL("image/png").split(",")[1],
    );
    (window as any).__seed({
      receipts: [
        {
          id: "a".repeat(64),
          name: "Dutch receipt.png",
          mime: "image/png",
          categoryId: "",
          status: "unlinked",
        },
      ],
    });
  });
  await page
    .getByRole("button", { name: "Receipt Library", exact: true })
    .click();
  await page.reload();
  await page
    .getByRole("button", { name: "Receipt Library", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Dutch receipt.png", exact: true })
    .click();
  const external: string[] = [];
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.startsWith("http") && !url.startsWith("http://127.0.0.1:1420")) {
      external.push(url);
      await route.abort();
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Extract / retry text recognition" })
    .click();
  await expect(page.locator(".ocr-text")).toContainText("Campus", {
    timeout: 90000,
  });
  await expect(page.locator(".ocr-text")).toContainText("7,00");
  expect(external).toEqual([]);
  await page
    .getByRole("button", { name: "Create transaction for review" })
    .click();
  const form = page.locator(".modal");
  await expect(form.getByLabel("Date", { exact: true })).toHaveValue(
    "2026-03-12",
  );
  await expect(form.locator("select")).toHaveValue("");
  await expect(form.getByLabel("Units")).toHaveValue("2");
  await form.locator("select").selectOption("events");
  await form.getByRole("button", { name: "Save transaction" }).click();
  await page
    .getByRole("button", { name: "Receipt Library", exact: true })
    .click();
  await expect(page.locator(".receipt-card .badge")).toHaveText("Linked");
});
