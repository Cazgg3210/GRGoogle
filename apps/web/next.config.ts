import path from 'node:path'
import { config as loadDotenv } from 'dotenv'
import type { NextConfig } from 'next'

// El .env vive en la raíz del monorepo; Next sólo lee el del directorio de la app.
loadDotenv({ path: path.resolve(process.cwd(), '../../.env'), override: false })

// `standalone` (Docker) copia node_modules con symlinks; en Windows sin privilegios falla con EPERM.
// Se activa en Linux/macOS (CI, Docker) o forzando NEXT_STANDALONE=1.
const standalone = process.platform !== 'win32' || process.env.NEXT_STANDALONE === '1'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(standalone ? { output: 'standalone' as const } : {}),
  transpilePackages: ['@smlxl/ui', '@smlxl/auth', '@smlxl/contracts', '@smlxl/domain', '@smlxl/config'],
  experimental: {
    optimizePackageImports: ['lucide-react', '@smlxl/ui'],
  },
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  outputFileTracingRoot: path.resolve(process.cwd(), '../../'),
  webpack: (config) => {
    // Los paquetes del workspace se consumen como fuente TS con imports ESM `./x.js`.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    }
    return config
  },
}

export default nextConfig
