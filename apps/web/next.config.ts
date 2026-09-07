import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  serverExternalPackages: ["mammoth"],
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
      "src/lib/payment-proofs/render-worker.mjs",
    ],
  },
};

export default nextConfig;
