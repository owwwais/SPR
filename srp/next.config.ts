import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // CV uploads are capped at 5MB (D8); leave headroom for multipart
      // overhead. The server action re-validates size and mime itself.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
