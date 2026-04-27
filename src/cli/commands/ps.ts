import { CONTAINER_LABEL_KEY } from '@/config'
import type { CommandDeps } from '../deps'

interface Row {
  project: string
  status: string
  container: string
  image: string
}

function formatTable(rows: Row[]): string[] {
  const headers: Row = {
    project: 'PROJECT',
    status: 'STATUS',
    container: 'CONTAINER',
    image: 'IMAGE',
  }
  const all = [headers, ...rows]
  const widths = {
    project: Math.max(...all.map((r) => r.project.length)),
    status: Math.max(...all.map((r) => r.status.length)),
    container: Math.max(...all.map((r) => r.container.length)),
    image: Math.max(...all.map((r) => r.image.length)),
  }
  return all.map(
    (r) =>
      `${r.project.padEnd(widths.project)}  ${r.status.padEnd(widths.status)}  ${r.container.padEnd(widths.container)}  ${r.image}`,
  )
}

/**
 * Lists every container labelled with `devcontainer.local_folder` across
 * the host, regardless of which workspace `mydevc` was invoked from.
 * Useful when juggling several projects.
 */
export async function ps(_args: Record<string, never>, deps: CommandDeps): Promise<void> {
  const { docker, logger } = deps
  const containers = await docker.listContainers({ label: CONTAINER_LABEL_KEY, all: true })
  if (containers.length === 0) {
    logger.info('No devcontainers found.')
    return
  }
  const rows: Row[] = containers.map((c) => {
    const folder = c.labels[CONTAINER_LABEL_KEY] ?? ''
    const project = folder.split('/').pop() || folder || c.id.slice(0, 12)
    return {
      project,
      status: c.state,
      container: c.id.slice(0, 12),
      image: c.image,
    }
  })
  for (const line of formatTable(rows)) logger.info(line)
}
