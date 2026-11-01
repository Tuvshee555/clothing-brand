// Side-effect import: loads .env.local before any app module reads process.env.
// Import it first in scripts that use modules which build connections on import.
import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())
