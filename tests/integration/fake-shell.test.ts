import { createFakeShell } from '@/adapters/shell/fake-shell'
import { shellContract } from './shell-contract'

shellContract('fake-shell', async () =>
  createFakeShell({
    binaries: { sh: '/bin/sh' },
    responder: (command, args) => {
      if (command === 'echo') return { stdout: `${args.join(' ')}\n`, exitCode: 0 }
      if (command === 'sh' && args[0] === '-c' && args[1] === 'exit 3') {
        return { exitCode: 3 }
      }
      if (command === 'sh' && args[0] === '-c' && args[1] === 'echo oops 1>&2') {
        return { stderr: 'oops\n', exitCode: 0 }
      }
      return undefined
    },
  }),
)
