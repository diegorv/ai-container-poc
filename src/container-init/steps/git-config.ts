import type { AbsolutePath } from '@/core/security/brand'
import { joinPath, safeFilename } from '@/core/security/path'
import type { Step } from './step'

const GITIGNORE_SEG = safeFilename('.gitignore_global')
const GITCONFIG_LOCAL_SEG = safeFilename('.gitconfig.local')
const GITCONFIG_SEG = safeFilename('.gitconfig')

const GLOBAL_GITIGNORE = `# Claude Code
.claude/

# macOS
.DS_Store
.AppleDouble
.LSOverride
._*

# Python
*.pyc
*.pyo
__pycache__/
*.egg-info/
.eggs/
*.egg
.venv/
venv/
.mypy_cache/
.ruff_cache/

# Node
node_modules/
.npm/

# Editors
*.swp
*.swo
*~
.idea/
.vscode/
*.sublime-*

# Misc
*.log
.env.local
.env.*.local
`

function buildLocalGitConfig(homeDir: AbsolutePath, gitignorePath: AbsolutePath): string {
  const hostGitconfig = joinPath(homeDir, GITCONFIG_SEG)
  return `# Container-local git config
# Includes host config (mounted read-only) and adds container settings

[include]
    path = ${hostGitconfig}

[core]
    excludesfile = ${gitignorePath}
    pager = delta

[interactive]
    diffFilter = delta --color-only

[delta]
    navigate = true
    light = false
    line-numbers = true
    side-by-side = false

[merge]
    conflictstyle = diff3

[diff]
    colorMoved = default

[gpg "ssh"]
    program = /usr/bin/ssh-keygen
`
}

/**
 * Ports `setup_global_gitignore` from post_install.py — writes
 * `~/.gitignore_global` with the standard pattern set and
 * `~/.gitconfig.local` (container-only "global" config that includes the
 * read-only host config and adds delta + excludesfile).
 */
export const gitConfigStep: Step = {
  name: 'git:config',
  async run({ fs, homeDir }) {
    const gitignorePath = joinPath(homeDir, GITIGNORE_SEG)
    const localGitconfigPath = joinPath(homeDir, GITCONFIG_LOCAL_SEG)

    await fs.writeFile(gitignorePath, GLOBAL_GITIGNORE)
    await fs.writeFile(localGitconfigPath, buildLocalGitConfig(homeDir, gitignorePath))

    return {
      ok: true,
      message: `global gitignore + local git config written to ${homeDir}`,
    }
  },
}
