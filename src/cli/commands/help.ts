/**
 * The `help` command's text. Kept as an exported constant so the
 * dispatcher can write it directly to stdout and tests can assert on
 * its presence.
 */
export const HELP_TEXT = `Usage: mydevc <command> [options]

Commands:
    .                      Install template + start container in current dir
    template [dir]         Copy devcontainer template into directory
    up [dir]               Start the devcontainer
    rebuild [dir]          Rebuild the devcontainer (preserves volumes)
    down [dir]             Stop the devcontainer
    shell                  Open zsh in the running container
    exec <cmd> [args...]   Run a command in the running container
    upgrade                Upgrade Claude Code inside the container
    mount <host> <ct>      Add a host→container bind mount
    sync [filter]          Sync Claude sessions from devcontainers to host
    cp <ct> <host>         Copy a path from the container to the host
    destroy [-f]           Remove container, volumes and images
    self-install           Symlink mydevc into ~/.local/bin
    update                 Pull the latest mydevc from git
    help                   Show this help message

Examples:
    mydevc .                       Install template and start container
    mydevc up                      Start container in current directory
    mydevc rebuild                 Clean rebuild (preserves volumes)
    mydevc shell                   Open interactive shell
    mydevc exec ls -la             Run a command in the container
    mydevc upgrade                 Upgrade Claude Code inside the container
    mydevc mount ~/data /data      Add a bind mount
    mydevc sync                    Sync sessions from all devcontainers
    mydevc sync crypto             Sync only matching devcontainers
    mydevc cp /workspace/foo .     Copy a path from container to host
    mydevc destroy                 Remove container, volumes and images
    mydevc destroy -f              Skip confirmation prompts
`
