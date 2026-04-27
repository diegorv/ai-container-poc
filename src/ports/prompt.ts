export interface Prompt {
  /**
   * Asks the user a yes/no question. Returns the chosen value.
   * Equivalent to bash's `read -p "...? [y/N] "` flow in install.sh.
   */
  confirm(message: string, options?: { defaultValue?: boolean }): Promise<boolean>
}
