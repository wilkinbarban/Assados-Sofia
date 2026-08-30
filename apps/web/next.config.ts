import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  // pdf-parse loads its native canvas dynamically. Next cannot infer that
  // edge, so keep the package and native binaries for GNU host validation and
  // Alpine/musl production in the standalone server image.
  outputFileTracingIncludes: {
    "/*": [
      "../../node_modules/@napi-rs/canvas/**/*",
      "../../node_modules/@napi-rs/canvas-linux-*-gnu/**/*",
      "../../node_modules/@napi-rs/canvas-linux-*-musl/**/*",
      "../../node_modules/pdf-parse/**/*",
      "../../node_modules/pdfjs-dist/**/*",
      "src/lib/payment-proofs/render-worker.mjs",
    ],
  },
};

export default nextConfig;
