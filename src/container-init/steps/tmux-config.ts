import type { Step } from './step'

const TMUX_CONFIG = `# 200k line scrollback history
set-option -g history-limit 200000

# Enable mouse support
set -g mouse on

# Use vi keys in copy mode
setw -g mode-keys vi

# Start windows and panes at 1, not 0
set -g base-index 1
setw -g pane-base-index 1

# Renumber windows when one is closed
set -g renumber-windows on

# Faster escape time for vim
set -sg escape-time 10

# True color support
set -g default-terminal "tmux-256color"
set -ag terminal-overrides ",xterm-256color:RGB"

# Terminal features (ghostty, cursor shape in vim)
set -as terminal-features ",xterm-ghostty:RGB"
set -as terminal-features ",xterm*:RGB"
set -ga terminal-overrides ",xterm*:colors=256"
set -ga terminal-overrides '*:Ss=\\E[%p1%d q:Se=\\E[ q'

# Status bar
set -g status-style 'bg=#333333 fg=#ffffff'
set -g status-left '[#S] '
set -g status-right '%Y-%m-%d %H:%M'
`

/**
 * Ports `setup_tmux_config` from post_install.py — writes `~/.tmux.conf`
 * with the canonical settings. Idempotent: if the file already exists it
 * is left untouched (so user customisations survive container rebuilds
 * when the home volume is preserved).
 */
export const tmuxConfigStep: Step = {
  name: 'tmux:config',
  async run({ fs, homeDir }) {
    const path = `${homeDir}/.tmux.conf`
    if (await fs.exists(path)) {
      return { ok: true, message: 'tmux config already present, skipping' }
    }
    await fs.writeFile(path, TMUX_CONFIG)
    return { ok: true, message: `tmux config written to ${path}` }
  },
}
