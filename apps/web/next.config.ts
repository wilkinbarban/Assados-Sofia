import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  // pdf-parse loads its native canvas dynamically and the knowledge action
  // loads mammoth at runtime. Next cannot infer either edge, so keep these
  // packages and their runtime dependencies in the standalone server image.
  outputFileTracingIncludes: {
    "/*": [
      "../../node_modules/@napi-rs/canvas/**/*",
      "../../node_modules/@napi-rs/canvas-linux-*-gnu/**/*",
      "../../node_modules/@napi-rs/canvas-linux-*-musl/**/*",
      "../../node_modules/pdf-parse/**/*",
      "../../node_modules/pdfjs-dist/**/*",
      "node_modules/mammoth/**/*",
      "node_modules/@xmldom/xmldom/**/*",
      "node_modules/argparse/**/*",
      "node_modules/base64-js/**/*",
      "node_modules/bluebird/**/*",
      "node_modules/dingbat-to-unicode/**/*",
      "node_modules/jszip/**/*",
      "node_modules/lop/**/*",
      "node_modules/path-is-absolute/**/*",
      "node_modules/underscore/**/*",
      "node_modules/xmlbuilder/**/*",
      "src/lib/payment-proofs/render-worker.mjs",
    ],
  },
};

export default nextConfig;
