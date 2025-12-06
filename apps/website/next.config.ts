import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  redirects: async () => [
    { source: "/docs", destination: "/docs/welcome/introduction", permanent: false },
  ],
};

const withMDX = createMDX();

export default withMDX(nextConfig);
