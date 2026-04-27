import { describe, expect, it } from 'vitest'
import { createFakeDocker } from './fake-docker'

describe('fake-docker', () => {
  it('filters listContainers by label expression', async () => {
    const docker = createFakeDocker({
      containers: [
        { id: 'a', labels: { 'devcontainer.local_folder': '/foo' } },
        { id: 'b', labels: { 'devcontainer.local_folder': '/bar' } },
      ],
    })
    const list = await docker.listContainers({
      label: 'devcontainer.local_folder=/foo',
    })
    expect(list.map((c) => c.id)).toEqual(['a'])
  })

  it('records cp invocations without doing anything', async () => {
    const docker = createFakeDocker()
    await docker.cp({ source: 'abc:/x', dest: '/host/y' })
    expect(docker.cpCalls).toEqual([{ source: 'abc:/x', dest: '/host/y' }])
  })

  it('removeVolume tracks removed names and updates listVolumes', async () => {
    const docker = createFakeDocker({
      volumes: [{ name: 'commandhistory' }, { name: 'claude' }],
    })
    await docker.removeVolume('claude')
    expect(docker.removedVolumes()).toEqual(['claude'])
    expect((await docker.listVolumes()).map((v) => v.name)).toEqual(['commandhistory'])
  })

  it('imageExists reflects added/removed images', async () => {
    const docker = createFakeDocker({ images: ['img:1'] })
    expect(await docker.imageExists('img:1')).toBe(true)
    expect(await docker.imageExists('img:2')).toBe(false)
    docker.addImage('img:2')
    expect(await docker.imageExists('img:2')).toBe(true)
    await docker.removeImage('img:1')
    expect(await docker.imageExists('img:1')).toBe(false)
  })
})
