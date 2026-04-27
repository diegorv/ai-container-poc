export interface FileStat {
  isDirectory: boolean
  isFile: boolean
  isSymlink: boolean
  uid: number
  gid: number
  mode: number
  size: number
  /** Last-modified time in milliseconds since epoch. */
  mtimeMs: number
}

export interface FileSystem {
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  exists(path: string): Promise<boolean>
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>
  readdir(path: string): Promise<string[]>
  copy(src: string, dest: string, options?: { recursive?: boolean }): Promise<void>
  remove(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>
  stat(path: string): Promise<FileStat>
  /** Like `stat` but does not follow symlinks. */
  lstat(path: string): Promise<FileStat>
  realpath(path: string): Promise<string>
  symlink(target: string, path: string): Promise<void>
  readlink(path: string): Promise<string>
  chmod(path: string, mode: number): Promise<void>
}
