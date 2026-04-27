import { describe, expect, it } from 'vitest'
import { findDangerousMountPath } from './dangerous-mount-paths'

describe('findDangerousMountPath', () => {
  it('flags the Docker socket', () => {
    expect(findDangerousMountPath('/var/run/docker.sock', '/home/alice')).toBeDefined()
    expect(findDangerousMountPath('/run/docker.sock', '/home/alice')).toBeDefined()
  })

  it('flags host root', () => {
    expect(findDangerousMountPath('/', '/home/alice')).toBeDefined()
  })

  it('flags /etc, /proc, /sys, /dev, /usr, /boot, /root', () => {
    for (const p of ['/etc', '/proc', '/sys', '/dev', '/usr', '/boot', '/root']) {
      expect(findDangerousMountPath(p, '/home/alice'), `${p} should be flagged`).toBeDefined()
    }
  })

  it('flags subpaths of the dangerous prefixes', () => {
    expect(findDangerousMountPath('/etc/cron.d', '/home/alice')).toBeDefined()
    expect(findDangerousMountPath('/usr/local/bin', '/home/alice')).toBeDefined()
  })

  it('flags the user home and its credential dirs', () => {
    expect(findDangerousMountPath('/home/alice', '/home/alice')).toBeDefined()
    expect(findDangerousMountPath('/home/alice/.ssh', '/home/alice')).toBeDefined()
    expect(findDangerousMountPath('/home/alice/.aws/credentials', '/home/alice')).toBeDefined()
    expect(findDangerousMountPath('/home/alice/.kube', '/home/alice')).toBeDefined()
    expect(findDangerousMountPath('/home/alice/.docker', '/home/alice')).toBeDefined()
  })

  it('passes for safe paths', () => {
    expect(findDangerousMountPath('/home/alice/notes', '/home/alice')).toBeUndefined()
    expect(findDangerousMountPath('/tmp/data', '/home/alice')).toBeUndefined()
    expect(findDangerousMountPath('/opt/datasets', '/home/alice')).toBeUndefined()
  })

  it('does not match a longer dir whose name starts with a dangerous prefix', () => {
    expect(findDangerousMountPath('/devops/data', '/home/alice')).toBeUndefined()
    expect(findDangerousMountPath('/etcetera', '/home/alice')).toBeUndefined()
  })

  it('handles undefined homeDir without flagging arbitrary user paths', () => {
    expect(findDangerousMountPath('/home/somebody/notes', undefined)).toBeUndefined()
  })
})
