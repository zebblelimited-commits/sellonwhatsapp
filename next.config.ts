/** @type {import('next').NextConfig} */
const nextConfig = {
  // In Next.js 15/16, this is a top-level key
  allowedDevOrigins: ['husband-flirt-payment.ngrok-free.dev'],

  // Add this line to fix the qr-code-styling module resolution
  transpilePackages: ['qr-code-styling'],

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "unsplash.com",
      },
      {
        protocol: "https",
        hostname: "randomuser.me",
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;