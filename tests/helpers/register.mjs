import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const EMPTY = new URL("./empty.mjs", import.meta.url).href;
const NEXT_SERVER_STUB = `data:text/javascript,${encodeURIComponent(
  [
    "export class NextResponse extends Response {",
    "  static json(body, init) {",
    "    const status = init?.status ?? 200;",
    "    return { __nextResponse: true, status, body, headers: init?.headers ?? {} };",
    "  }",
    "}",
  ].join("\n"),
)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: EMPTY, shortCircuit: true };
    }
    if (specifier === "next/server") {
      return { url: NEXT_SERVER_STUB, shortCircuit: true };
    }
    if (specifier.startsWith("@/")) {
      const base = path.join(ROOT, "src", specifier.slice(2));
      for (const ext of ["", ".ts", ".tsx"]) {
        if (fs.existsSync(base + ext) && fs.statSync(base + ext).isFile()) {
          return { url: pathToFileURL(base + ext).href, shortCircuit: true };
        }
      }
    }
    return nextResolve(specifier, context);
  },
});
