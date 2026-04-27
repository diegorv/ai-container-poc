/**
 * Zod schemas for the JSON shapes the Docker daemon emits.
 *
 * `cli-docker.ts` parses raw JSON from `docker inspect` / `docker
 * volume inspect` and projects it into the `Docker` port's typed
 * surface (`ContainerInfo`, `VolumeInfo`). Until now those parses
 * relied on hand-written interfaces, which means a daemon version
 * that drops or renames a field surfaces as `undefined.something` at
 * the call site rather than a clear "the daemon returned a shape we
 * don't understand" error.
 *
 * The schemas below are deliberately permissive — every field on the
 * docker side is `.optional()` because the daemon really does omit
 * various fields depending on the container's lifecycle state — but
 * they reject obviously corrupt payloads (top-level non-array, null
 * `Id`, etc.). That's enough to give a useful error message at the
 * boundary, which is what `CLAUDE.md` § "zod at boundaries" asks for.
 */

import { z } from 'zod'

const StringRecord = z.record(z.string()).nullable().optional()

export const DockerInspectMountSchema = z
  .object({
    Type: z.string().optional(),
    Name: z.string().optional(),
    Source: z.string().optional(),
    Destination: z.string().optional(),
  })
  .passthrough()

export const DockerInspectContainerSchema = z
  .object({
    Id: z.string(),
    Name: z.string().optional(),
    Image: z.string().optional(),
    State: z.object({ Status: z.string().optional() }).passthrough().optional(),
    Config: z
      .object({
        Image: z.string().optional(),
        Labels: StringRecord,
        Env: z.array(z.string()).nullable().optional(),
        User: z.string().optional(),
      })
      .passthrough()
      .optional(),
    Mounts: z.array(DockerInspectMountSchema).optional(),
  })
  .passthrough()

export const DockerInspectContainerArraySchema = z.array(DockerInspectContainerSchema)

export const DockerInspectVolumeSchema = z
  .object({
    Name: z.string(),
    Labels: StringRecord,
  })
  .passthrough()

export const DockerInspectVolumeArraySchema = z.array(DockerInspectVolumeSchema)

export type DockerInspectContainer = z.infer<typeof DockerInspectContainerSchema>
export type DockerInspectVolume = z.infer<typeof DockerInspectVolumeSchema>
