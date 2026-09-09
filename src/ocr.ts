import { createWorker, type Worker } from "tesseract.js";
import * as pdf from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { suggest } from "./domain";
import { readFile } from "./api";
import type { Receipt } from "./types";
pdf.GlobalWorkerOptions.workerSrc = workerUrl;
let worker: Worker | undefined;
let aborted = false;
export async function cancelOcr() {
  aborted = true;
  await worker?.terminate();
  worker = undefined;
}
export async function extract(r: Receipt, progress: (n: number) => void) {
  aborted = false;
  const bytes = await readFile(r.id);
  let text = "";
  async function recognize(image: Blob) {
    if (aborted) throw Error("Recognition cancelled");
    if (!worker)
      worker = await createWorker("eng+nld", 1, {
        workerPath: new URL("/ocr/worker.min.js", location.href).href,
        langPath: new URL("/ocr", location.href).href,
        corePath: new URL("/ocr", location.href).href,
        logger: (m) => {
          if (m.status === "recognizing text")
            progress(Math.round(m.progress * 100));
        },
      });
    const result = await worker.recognize(image);
    return result.data.text;
  }
  if (r.mime === "application/pdf") {
    const doc = await pdf.getDocument({ data: bytes }).promise;
    try {
      for (let i = 1; i <= doc.numPages; i++) {
        if (aborted) throw Error("Recognition cancelled");
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        let t = content.items
          .map((it) =>
            "str" in it
              ? it.str + ("hasEOL" in it && it.hasEOL ? "\n" : " ")
              : "",
          )
          .join("");
        if (t.trim().length < 30) {
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({
            canvasContext: canvas.getContext("2d")!,
            viewport,
          }).promise;
          const blob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob((b) =>
              b ? resolve(b) : reject(Error("Cannot render PDF")),
            ),
          );
          t = await recognize(blob);
        }
        text += t + "\n";
        progress(Math.round((i / doc.numPages) * 100));
      }
    } finally {
      await doc.destroy();
    }
  } else
    text = await recognize(new Blob([bytes as BlobPart], { type: r.mime }));
  return { text, suggestions: suggest(text, r.name) };
}
export { pdf };
