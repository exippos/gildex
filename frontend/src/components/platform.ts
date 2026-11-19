// Human label for the "reveal in file manager" action, matching the server's
// OS so the wording is native (Explorer / Finder / generic folder).
export function revealLabel(platform: string): string {
  switch (platform) {
    case 'windows':
      return 'Open in Explorer'
    case 'darwin':
      return 'Show in Finder'
    default:
      return 'Show in folder'
  }
}
