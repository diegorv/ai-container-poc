# Claude Code Devcontainer
# Based on Microsoft devcontainer image for better devcontainer integration
FROM ghcr.io/astral-sh/uv:0.10@sha256:10902f58a1606787602f303954cea099626a4adb02acbac4c69920fe9d278f82 AS uv
FROM mcr.microsoft.com/devcontainers/base:ubuntu24.04@sha256:4bcb1b466771b1ba1ea110e2a27daea2f6093f9527fb75ee59703ec89b5561cb

ARG TZ
ENV TZ="$TZ"

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Install additional system packages (base image already includes git, curl, sudo, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
  # Sandboxing support for Claude Code
  bubblewrap \
  socat \
  # Modern CLI tools
  fd-find \
  ripgrep \
  tmux \
  zsh \
  # Build tools
  build-essential \
  # Utilities
  jq \
  nano \
  unzip \
  vim \
  # Network tools (for security testing)
  dnsutils \
  ipset \
  iptables \
  iproute2 \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install git-delta
# renovate: datasource=github-releases depName=dandavison/delta
ARG GIT_DELTA_VERSION=0.18.2
RUN ARCH=$(dpkg --print-architecture) && \
  curl -fsSL "https://github.com/dandavison/delta/releases/download/${GIT_DELTA_VERSION}/git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" -o /tmp/git-delta.deb && \
  dpkg -i /tmp/git-delta.deb && \
  rm /tmp/git-delta.deb

# Install uv (Python package manager) via multi-stage copy
COPY --from=uv /uv /usr/local/bin/uv

# Install fzf from GitHub releases (newer than apt, includes built-in shell integration)
# renovate: datasource=github-releases depName=junegunn/fzf
ARG FZF_VERSION=0.70.0
RUN ARCH=$(dpkg --print-architecture) && \
  case "${ARCH}" in \
    amd64) FZF_ARCH="linux_amd64" ;; \
    arm64) FZF_ARCH="linux_arm64" ;; \
    *) echo "Unsupported architecture: ${ARCH}" && exit 1 ;; \
  esac && \
  curl -fsSL "https://github.com/junegunn/fzf/releases/download/v${FZF_VERSION}/fzf-${FZF_VERSION}-${FZF_ARCH}.tar.gz" | tar -xz -C /usr/local/bin

# Create directories and set ownership (combined for fewer layers)
RUN mkdir -p /commandhistory /workspace /home/vscode/.claude /opt && \
  touch /commandhistory/.bash_history && \
  touch /commandhistory/.zsh_history && \
  chown -R vscode:vscode /commandhistory /workspace /home/vscode/.claude /opt

# Set environment variables
ENV DEVCONTAINER=true
ENV SHELL=/bin/zsh
ENV EDITOR=nano
ENV VISUAL=nano

WORKDIR /workspace

# Switch to non-root user for remaining setup
USER vscode

# Set PATH early so claude and other user-installed binaries are available
ENV PATH="/home/vscode/.local/bin:$PATH"

# Install Claude Code natively with marketplace plugins. The installer
# URL is unversioned, so we cannot pin a SHA256 here without forcing a
# rebuild on every Anthropic update. We at least force HTTPS + modern
# TLS, write the script to disk before running it (so the build log
# contains the exact source executed), and download once into a temp
# file so a network blip mid-script cannot truncate execution.
RUN curl --proto '=https' --tlsv1.2 -fsSL https://claude.ai/install.sh -o /tmp/claude-install.sh && \
  bash /tmp/claude-install.sh && \
  rm /tmp/claude-install.sh && \
  claude plugin marketplace add anthropics/skills && \
  claude plugin marketplace add trailofbits/skills && \
  claude plugin marketplace add trailofbits/skills-curated

# Install Python 3.13 via uv (fast binary download, not source compilation)
RUN uv python install 3.13 --default

# Install ast-grep (AST-based code search)
RUN uv tool install ast-grep-cli

# Install fnm (Fast Node Manager) and Node 22. fnm.vercel.app/install
# is a redirector to the latest GitHub release script; same caveat as
# claude.ai/install.sh — no stable SHA to pin against. Same hardening
# (HTTPS-only, written to disk before exec).
ARG NODE_VERSION=22
ENV FNM_DIR="/home/vscode/.fnm"
RUN curl --proto '=https' --tlsv1.2 -fsSL https://fnm.vercel.app/install -o /tmp/fnm-install.sh && \
  bash /tmp/fnm-install.sh --install-dir "$FNM_DIR" --skip-shell && \
  rm /tmp/fnm-install.sh && \
  export PATH="$FNM_DIR:$PATH" && \
  eval "$(fnm env)" && \
  fnm install ${NODE_VERSION} && \
  fnm default ${NODE_VERSION} && \
  corepack enable

# Install Oh My Zsh. zsh-in-docker.sh is fetched from a tag-pinned
# release URL; pass ZSH_IN_DOCKER_SHA256 to verify the script before
# executing. Defaults to "" (no verification) so contributors don't
# have to round-trip a hash for unrelated changes — Renovate updates
# both the version and the hash together. Pin a non-empty value in
# CI / production builds.
# renovate: datasource=github-releases depName=deluan/zsh-in-docker
ARG ZSH_IN_DOCKER_VERSION=1.2.1
ARG ZSH_IN_DOCKER_SHA256=""
RUN curl --proto '=https' --tlsv1.2 -fsSL \
    "https://github.com/deluan/zsh-in-docker/releases/download/v${ZSH_IN_DOCKER_VERSION}/zsh-in-docker.sh" \
    -o /tmp/zsh-in-docker.sh && \
  if [ -n "${ZSH_IN_DOCKER_SHA256}" ]; then \
    echo "${ZSH_IN_DOCKER_SHA256}  /tmp/zsh-in-docker.sh" | sha256sum -c -; \
  else \
    echo "[mydevc] WARNING: building without ZSH_IN_DOCKER_SHA256 pinned" >&2; \
  fi && \
  sh /tmp/zsh-in-docker.sh -p git -x && \
  rm /tmp/zsh-in-docker.sh

# Copy zsh configuration
COPY --chown=vscode:vscode .zshrc /home/vscode/.zshrc.custom

# Append custom zshrc to the main one
RUN echo 'source ~/.zshrc.custom' >> /home/vscode/.zshrc

# Copy mydevc-init bundle, bootstrap script, firewall setup, and chown
# wrapper. The bundle is built by `pnpm build` and includes the
# dist/container-init/ entry along with the templates/ directory.
COPY --chown=vscode:vscode dist/container-init/index.js /opt/mydevc/container-init.js
COPY --chown=vscode:vscode post-install-bootstrap.sh /opt/mydevc/post-install-bootstrap.sh
# These two scripts are root-owned and read-only for non-root users:
# vscode invokes them via sudo, but cannot edit them.
COPY setup-firewall.sh /opt/mydevc/setup-firewall.sh
COPY chown-managed.sh /opt/mydevc/chown-managed.sh
COPY sudoers.mydevc /etc/sudoers.d/00-mydevc

# Expose mydevc-init on PATH so postCreateCommand can call it directly.
# Replace Microsoft's broad `vscode ALL=(root) NOPASSWD:ALL` with our
# narrow allowlist (sudoers.mydevc).
USER root
RUN ln -sf /opt/mydevc/container-init.js /usr/local/bin/mydevc-init && \
  chmod +x /opt/mydevc/post-install-bootstrap.sh /opt/mydevc/container-init.js && \
  chmod 0500 /opt/mydevc/setup-firewall.sh /opt/mydevc/chown-managed.sh && \
  chown root:root /opt/mydevc/setup-firewall.sh /opt/mydevc/chown-managed.sh && \
  chmod 0440 /etc/sudoers.d/00-mydevc && \
  chown root:root /etc/sudoers.d/00-mydevc && \
  rm -f /etc/sudoers.d/vscode && \
  visudo -cf /etc/sudoers.d/00-mydevc
USER vscode
