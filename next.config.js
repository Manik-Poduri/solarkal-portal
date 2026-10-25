/** @type {import('next').NextConfig} */
module.exports = {
  poweredByHeader: false,
    experimental: {
    outputFileTracingIncludes: { '/api/onepager/generate': ['./lib/onepager/templates/**/*'] },
    serverComponentsExternalPackages: ['sharp', 'exceljs'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
}