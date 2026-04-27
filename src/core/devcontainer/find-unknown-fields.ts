import type { DevcontainerConfig } from '@/schemas/devcontainer-config'

/**
 * Top-level fields that `DevcontainerConfigSchema` declares — and that
 * `findDangerousFields` / `checkNoSysAdmin` / `enforceFirewall` know how
 * to audit. Anything outside this set still passes the parser thanks to
 * `.passthrough()`, but is not security-reviewed.
 */
const KNOWN_TOP_LEVEL_FIELDS = new Set([
  'name',
  'build',
  'image',
  'features',
  'runArgs',
  'mounts',
  'containerEnv',
  'remoteEnv',
  'workspaceFolder',
  'workspaceMount',
  'remoteUser',
  'containerUser',
  'privileged',
  'securityOpt',
  'initializeCommand',
  'onCreateCommand',
  'updateContentCommand',
  'postCreateCommand',
  'postStartCommand',
  'postAttachCommand',
  'customizations',
  'init',
  'updateRemoteUserUID',
  // Common spec fields we don't audit but accept silently — listing them
  // here keeps the warning quiet for valid devcontainer.json files.
  'forwardPorts',
  'portsAttributes',
  'otherPortsAttributes',
  'shutdownAction',
  'overrideCommand',
  'hostRequirements',
  'waitFor',
  'userEnvProbe',
  '$schema',
])

/**
 * Returns top-level keys present in `config` that the security audit
 * does not understand. A malicious workspace-side `devcontainer.json`
 * could one day exploit a future spec field that weakens the sandbox;
 * surfacing these as a warning keeps operators aware of unaudited
 * surface even when no current rule fires.
 */
export function findUnknownTopLevelFields(config: DevcontainerConfig): string[] {
  return Object.keys(config).filter((k) => !KNOWN_TOP_LEVEL_FIELDS.has(k))
}
