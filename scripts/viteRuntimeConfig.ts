// Electron locks files such as Network/Cookies inside the CLI session profile
// on Windows. Runtime state is never renderer source.
export const VITE_SERVER_WATCH_OPTIONS = {
  ignored: ['**/.podflow/**'],
}
