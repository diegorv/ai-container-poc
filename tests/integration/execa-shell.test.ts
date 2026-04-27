import { execaShell } from '@/adapters/shell/execa-shell'
import { shellContract } from './shell-contract'

shellContract('execa-shell', async () => execaShell)
