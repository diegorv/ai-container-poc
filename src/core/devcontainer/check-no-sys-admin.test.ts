import { describe, expect, it } from 'vitest'
import { checkNoSysAdmin } from './check-no-sys-admin'

describe('checkNoSysAdmin', () => {
  it('passes when runArgs is missing', () => {
    expect(checkNoSysAdmin({})).toEqual({ ok: true })
  })

  it('passes when runArgs has no dangerous entry', () => {
    expect(
      checkNoSysAdmin({ runArgs: ['--cap-add=NET_ADMIN', '--cap-add', 'NET_RAW', '--init'] }),
    ).toEqual({ ok: true })
  })

  describe('SYS_ADMIN', () => {
    it('flags --cap-add=SYS_ADMIN', () => {
      const result = checkNoSysAdmin({ runArgs: ['--cap-add=SYS_ADMIN'] })
      expect(result.ok).toBe(false)
      expect(result.offendingArg).toBe('--cap-add=SYS_ADMIN')
    })

    it('flags --cap-add SYS_ADMIN (split form)', () => {
      const result = checkNoSysAdmin({ runArgs: ['--cap-add', 'SYS_ADMIN'] })
      expect(result.ok).toBe(false)
      expect(result.offendingArg).toBe('--cap-add SYS_ADMIN')
    })

    it('flags any arg containing SYS_ADMIN', () => {
      const result = checkNoSysAdmin({ runArgs: ['--security-opt=apparmor:unconfined,SYS_ADMIN'] })
      expect(result.ok).toBe(false)
    })
  })

  describe('privileged / cap-add=ALL', () => {
    it('flags --privileged', () => {
      const result = checkNoSysAdmin({ runArgs: ['--privileged'] })
      expect(result.ok).toBe(false)
      expect(result.offendingArg).toBe('--privileged')
    })

    it('flags --cap-add=ALL (case-insensitive)', () => {
      expect(checkNoSysAdmin({ runArgs: ['--cap-add=ALL'] }).ok).toBe(false)
      expect(checkNoSysAdmin({ runArgs: ['--cap-add=all'] }).ok).toBe(false)
      expect(checkNoSysAdmin({ runArgs: ['--cap-add', 'all'] }).ok).toBe(false)
    })
  })

  describe('other escape-enabling capabilities', () => {
    it.each([
      'SYS_PTRACE',
      'SYS_MODULE',
      'SYS_BOOT',
      'SYS_RAWIO',
      'SYS_TIME',
      'MKNOD',
      'DAC_READ_SEARCH',
      'DAC_OVERRIDE',
      'LINUX_IMMUTABLE',
      'BPF',
      'PERFMON',
      'AUDIT_CONTROL',
      'AUDIT_READ',
      'SYSLOG',
    ])('flags --cap-add=%s', (cap) => {
      expect(checkNoSysAdmin({ runArgs: [`--cap-add=${cap}`] }).ok).toBe(false)
    })

    it('flags --cap-add with comma-separated list', () => {
      const result = checkNoSysAdmin({ runArgs: ['--cap-add=NET_ADMIN,SYS_PTRACE'] })
      expect(result.ok).toBe(false)
    })

    it('flags --cap-add with CAP_ prefix', () => {
      expect(checkNoSysAdmin({ runArgs: ['--cap-add=CAP_SYS_PTRACE'] }).ok).toBe(false)
    })
  })

  describe('security-opt unconfined', () => {
    it('flags seccomp=unconfined', () => {
      const result = checkNoSysAdmin({ runArgs: ['--security-opt=seccomp=unconfined'] })
      expect(result.ok).toBe(false)
    })

    it('flags apparmor=unconfined', () => {
      const result = checkNoSysAdmin({ runArgs: ['--security-opt', 'apparmor=unconfined'] })
      expect(result.ok).toBe(false)
    })
  })

  describe('host namespaces', () => {
    it.each([
      '--pid=host',
      '--ipc=host',
      '--uts=host',
      '--userns=host',
      '--cgroupns=host',
      '--network=host',
      '--net=host',
    ])('flags %s', (arg) => {
      expect(checkNoSysAdmin({ runArgs: [arg] }).ok).toBe(false)
    })
  })

  describe('dangerous devices', () => {
    it('flags --device=/dev/kmsg', () => {
      expect(checkNoSysAdmin({ runArgs: ['--device=/dev/kmsg'] }).ok).toBe(false)
    })
    it('flags --device /dev/mem', () => {
      expect(checkNoSysAdmin({ runArgs: ['--device', '/dev/mem'] }).ok).toBe(false)
    })
    it.each([
      '/dev/sda',
      '/dev/sda1',
      '/dev/nvme0n1',
      '/dev/nvme0n1p2',
      '/dev/loop0',
      '/dev/dm-0',
      '/dev/mapper/cryptroot',
      '/dev/disk/by-uuid/abc',
      '/dev/vda',
      '/dev/xvda1',
      '/dev/sg0',
    ])('flags --device=%s (block / raw storage)', (dev) => {
      expect(checkNoSysAdmin({ runArgs: [`--device=${dev}`] }).ok).toBe(false)
    })
    it('flags --device with host:container:perms form', () => {
      expect(checkNoSysAdmin({ runArgs: ['--device=/dev/sda:/dev/inner:rw'] }).ok).toBe(false)
    })
  })

  describe('--device-cgroup-rule', () => {
    it('rejects any --device-cgroup-rule', () => {
      const result = checkNoSysAdmin({ runArgs: ['--device-cgroup-rule', 'a *:* rwm'] })
      expect(result.ok).toBe(false)
      expect(result.reason).toMatch(/device-cgroup-rule/)
    })
    it('rejects --device-cgroup-rule= form', () => {
      expect(checkNoSysAdmin({ runArgs: ['--device-cgroup-rule=c 1:5 rw'] }).ok).toBe(false)
    })
  })

  describe('docker-socket / host-root mounts via runArgs', () => {
    it('flags -v /var/run/docker.sock:/var/run/docker.sock', () => {
      const result = checkNoSysAdmin({
        runArgs: ['-v', '/var/run/docker.sock:/var/run/docker.sock'],
      })
      expect(result.ok).toBe(false)
    })

    it('flags --volume=/run/docker.sock:/sock', () => {
      expect(checkNoSysAdmin({ runArgs: ['--volume=/run/docker.sock:/sock'] }).ok).toBe(false)
    })

    it('flags --mount with docker.sock source', () => {
      const result = checkNoSysAdmin({
        runArgs: ['--mount', 'type=bind,source=/var/run/docker.sock,target=/sock'],
      })
      expect(result.ok).toBe(false)
    })

    it('flags -v /:/host (host root mount)', () => {
      expect(checkNoSysAdmin({ runArgs: ['-v', '/:/host'] }).ok).toBe(false)
    })
  })
})
