/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  async rewrites() {
    return [
      {
        source: '/tree',
        destination: 'https://monster-tree.vercel.app/tree',
      },
      {
        source: '/tree/:path*',
        destination: 'https://monster-tree.vercel.app/tree/:path*',
      },
    ];
  },
};

export default nextConfig;
