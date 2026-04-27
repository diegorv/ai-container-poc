import { UID_IMAGE_SUFFIX } from '@/config'
import { computeProjectId } from '@/core/project/compute-project-id'
import { operatorPath } from '@/core/security/path'
import type { ContainerInfo, Docker } from '@/ports/docker'
import type { CommandDeps } from '../deps'

export interface DestroyArgs {
  cwd: string
  /** Skip the confirmation prompts. */
  force?: boolean
}

interface Resources {
  container: ContainerInfo | undefined
  volumes: string[]
  imageBase: string | undefined
  imageUid: string | undefined
}

async function discoverResources(docker: Docker, label: string): Promise<Resources> {
  const containers = await docker.listContainers({ label, all: true })
  const container = containers[0]
  if (!container) {
    return { container: undefined, volumes: [], imageBase: undefined, imageUid: undefined }
  }
  const volumes = container.mounts
    .filter((m) => m.type === 'volume' && typeof m.name === 'string')
    .map((m) => m.name as string)
  const baseImage = container.image.endsWith(UID_IMAGE_SUFFIX)
    ? container.image.slice(0, -UID_IMAGE_SUFFIX.length)
    : container.image
  const uidImage = `${baseImage}${UID_IMAGE_SUFFIX}`
  return { container, volumes, imageBase: baseImage, imageUid: uidImage }
}

/**
 * Ports `cmd_destroy` from install.sh — discovers the container,
 * volumes and base/`-uid` images attached to the workspace, prompts
 * before deleting (unless `force`), and removes them in safe order.
 */
export async function destroy(args: DestroyArgs, deps: CommandDeps): Promise<void> {
  const { docker, logger, prompt } = deps
  const project = computeProjectId(operatorPath(args.cwd))
  const res = await discoverResources(docker, project.containerLabel)

  if (!res.container) {
    logger.info(`No devcontainer found for ${args.cwd}`)
    return
  }

  logger.warn('The following resources will be permanently removed:')
  logger.info(`  Container:  ${res.container.name || res.container.id}`)
  if (res.container.state === 'running') {
    logger.info('              (currently running — will be force-stopped)')
  }
  if (res.volumes.length > 0) {
    logger.info('  Volumes:')
    for (const v of res.volumes) logger.info(`              ${v}`)
  }
  if (res.imageBase) {
    logger.info(`  Image:      ${res.imageBase}`)
    if (res.imageUid && (await docker.imageExists(res.imageUid))) {
      logger.info(`              ${res.imageUid}`)
    }
  }

  if (res.container.state === 'running' && !args.force) {
    if (!(await prompt.confirm('Force-stop the running container?'))) {
      logger.info('Aborted.')
      return
    }
  }

  if (!args.force) {
    if (!(await prompt.confirm('Destroy these resources?'))) {
      logger.info('Aborted.')
      return
    }
  }

  if (res.container.state === 'running') {
    logger.info('Stopping container…')
    try {
      await docker.stopContainer(res.container.id)
    } catch (err) {
      logger.warn(`could not stop container: ${(err as Error).message}`)
    }
  }

  logger.info('Removing container…')
  try {
    await docker.removeContainer(res.container.id, { force: true })
  } catch (err) {
    logger.warn(`could not remove container: ${(err as Error).message}`)
  }

  for (const v of res.volumes) {
    logger.info(`Removing volume: ${v}`)
    try {
      await docker.removeVolume(v, { force: true })
    } catch (err) {
      logger.warn(`could not remove volume ${v}: ${(err as Error).message}`)
    }
  }

  if (res.imageBase && (await docker.imageExists(res.imageBase))) {
    logger.info(`Removing image: ${res.imageBase}`)
    try {
      await docker.removeImage(res.imageBase, { force: true })
    } catch (err) {
      logger.warn(`could not remove image ${res.imageBase}: ${(err as Error).message}`)
    }
  }
  if (res.imageUid && (await docker.imageExists(res.imageUid))) {
    logger.info(`Removing image: ${res.imageUid}`)
    try {
      await docker.removeImage(res.imageUid, { force: true })
    } catch (err) {
      logger.warn(`could not remove image ${res.imageUid}: ${(err as Error).message}`)
    }
  }

  logger.success(`All resources destroyed for ${args.cwd}`)
}
