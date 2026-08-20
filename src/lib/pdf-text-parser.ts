import { createRequire } from "node:module";

type PdfTextParser = {
  getText(): Promise<{ text: string }>;
  destroy(): Promise<void>;
};

type PdfTextParserConstructor = new (options: { data: Buffer }) => PdfTextParser;

type CanvasRuntime = Record<"DOMMatrix" | "DOMPoint" | "DOMRect" | "ImageData" | "Path2D", unknown>;

// PDF.js expects these browser geometry primitives to exist while its module
// is evaluated. Vercel's Node runtime does not provide them, so install the
// implementations bundled with pdf-parse before requiring pdf-parse itself.
const requireNodeModule = createRequire(import.meta.url);

function installPdfJsNodeGlobals() {
  const canvas = requireNodeModule("@napi-rs/canvas") as CanvasRuntime;
  const runtimeGlobals = globalThis as typeof globalThis & Record<string, unknown>;

  for (const name of ["DOMMatrix", "DOMPoint", "DOMRect", "ImageData", "Path2D"] as const) {
    if (typeof runtimeGlobals[name] === "undefined") {
      Object.defineProperty(runtimeGlobals, name, {
        configurable: true,
        writable: true,
        value: canvas[name],
      });
    }
  }
}

export function createPdfTextParser(data: Buffer): PdfTextParser {
  installPdfJsNodeGlobals();
  const { PDFParse } = requireNodeModule("pdf-parse") as { PDFParse: PdfTextParserConstructor };
  return new PDFParse({ data });
}
