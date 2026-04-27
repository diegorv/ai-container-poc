import { CONTAINER_LABEL_KEY } from '@/config'
import type { AbsolutePath } from '@/core/security/brand'
import { literalPath } from '@/core/security/path'
import type { Docker } from '@/ports/docker'
import type { FileSystem } from '@/ports/filesystem'
import type { Logger } from '@/ports/logger'
import {
  CONTAINER_ALLOWLIST_PATH,
  snapshotAndPushFirewallAllowlist,
  workspaceAllowlistPath,
} from './firewall-snapshot'

const FIREWALL_SCRIPT = literalPath('/opt/mydevc/setup-firewall.sh')

export interface EnforceFirewallDeps {
  docker: Docker
  fs: FileSystem
  logger: Logger
  /** Operator's home — anchors the host-side allowlist snapshot. */
  home: AbsolutePath
}

/**
 * Re-runs setup-firewall.sh inside the project's container after the
 * devcontainer CLI brings it up. The point: the postStartCommand in
 * devcontainer.json could have been overridden (or could fail
 * silently), leaving the container with unrestricted network. This
 * pass re-asserts the firewall from the host and aborts the command
 * (stopping the container) if the script exits non-zero.
 *
 * Before re-running, the workspace allowlist
 * (`.devcontainer/firewall-allowlist.txt`) is parsed and validated on
 * the host, then pushed into the container at
 * `/etc/mydevc/firewall-allowlist.txt` under root ownership. The
 * script reads from there in preference to the workspace path, so the
 * version that actually controls iptables came through host-side
 * validation — never raw bytes the container could have edited.
 *
 * No-op when `.devcontainer/firewall-allowlist.txt` is absent — that
 * is the documented signal for "no firewall, full network".
 */
export async function enforceFirewall(
  workspaceFolder: AbsolutePath,
  deps: EnforceFirewallDeps,
): Promise<void> {
  const allowlist = workspaceAllowlistPath(workspaceFolder)
  if (!(await deps.fs.exists(allowlist))) return

  const snapshot = await snapshotAndPushFirewallAllowlist(workspaceFolder, deps)

  const containers = await deps.docker.listContainers({
    label: `${CONTAINER_LABEL_KEY}=${workspaceFolder}`,
    all: true,
  })
  const running = containers.find((c) => c.state === 'running') ?? containers[0]
  if (!running) {
    throw new Error(
      'Refusing to continue: --secure firewall allowlist is present but no container was found.',
    )
  }

  const result = await deps.docker.exec(running.id, [
    'sudo',
    FIREWALL_SCRIPT,
    CONTAINER_ALLOWLIST_PATH,
  ])
  if (result.exitCode !== 0) {
    // Stop the container so the user does not get a half-isolated
    // sandbox they may forget about.
    await deps.docker.stopContainer(running.id).catch(() => {})
    throw new Error(
      `setup-firewall.sh failed (exit ${result.exitCode}): ${result.stderr.trim() || result.stdout.trim()}. Container stopped to avoid silent network exposure.`,
    )
  }
  if (snapshot && snapshot.entryCount > 0) {
    deps.logger.debug(
      `Firewall snapshot written to ${snapshot.snapshotPath} (${snapshot.entryCount} entries).`,
    )
  }
  deps.logger.info(result.stdout.trim() || 'Firewall verified.')
}
