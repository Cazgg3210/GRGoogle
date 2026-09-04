import { config } from 'dotenv'
import path from 'node:path'

// Carga DATABASE_URL del .env raíz; si no existe, las suites de integración se omiten.
config({ path: path.resolve(__dirname, '../../.env') })
