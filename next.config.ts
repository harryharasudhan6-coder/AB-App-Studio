/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        unoptimized: true,
        remotePatterns: [
            {
                protocol: "https",
                hostname: "placehold.co",
                port: "",
                pathname: "/**",
            },
        ],
    },
    // We removed the eslint and typescript blocks from here 
    // to satisfy the new Next.js 15 requirements.
};

export default nextConfig;
