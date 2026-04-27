import { CONTAINER_LABEL_KEY } from '@/config'
import { devcontainerDirOf } from '@/core/paths'
import type { AbsolutePath } from '@/core/security/brand'
import { joinPath, safeFilename } from '@/core/security/path'
import type { Docker } from '@/ports/docker'
import type { FileSystem } from '@/ports/filesystem'
import type { Logger } from '@/ports/logger'

const FIREWALL_SCRIPT = '/opt/mydevc/setup-firewall.sh'
const ALLOWLIST_FILENAME = 'firewall-allowlist.txt'
const ALLOWLIST_FILENAME_SEG = safeFilename(ALLOWLIST_FILENAME)

export interface EnforceFirewallDeps {
  docker: Docker
  fs: FileSystem
  logger: Logger
}

/**
 * Re-runs setup-firewall.sh inside the project's container after the
 * devcontainer CLI brings it up. The point: the postStartCommand in
 * devcontainer.json could have been overridden (or could fail
 * silently), leaving the container with unrestricted network. This
 * pass re-asserts the firewall from the host and aborts the command
 * (stopping the container) if the script exits non-zero.
 *
 * No-op when `.devcontainer/firewall-allowlist.txt` is absent — that
 * is the documented signal for "no firewall, full network".
 */
export async function enforceFirewall(
  workspaceFolder: AbsolutePath,
  deps: EnforceFirewallDeps,
): Promise<void> {
  const allowlist = joinPath(devcontainerDirOf(workspaceFolder), ALLOWLIST_FILENAME_SEG)
  if (!(await deps.fs.exists(allowlist))) return

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

  const result = await deps.docker.exec(running.id, ['sudo', FIREWALL_SCRIPT])
  if (result.exitCode !== 0) {
    // Stop the container so the user does not get a half-isolated
    // sandbox they may forget about.
    await deps.docker.stopContainer(running.id).catch(() => {})
    throw new Error(
      `setup-firewall.sh failed (exit ${result.exitCode}): ${result.stderr.trim() || result.stdout.trim()}. Container stopped to avoid silent network exposure.`,
    )
  }
  deps.logger.info(result.stdout.trim() || 'Firewall verified.')
}
