export type ThemePreference = 'light' | 'dark'
export const themeEndpoint =
  'https://us-central1-cerms-7af24.cloudfunctions.net/saveThemePreference'
export function isThemeRequest(body?: string): boolean {
  try {
    const p = JSON.parse(body ?? '')
    return (
      Object.keys(p).join() === 'data' &&
      !!p.data &&
      !Array.isArray(p.data) &&
      Object.keys(p.data).join() === 'theme' &&
      ['light', 'dark'].includes(p.data.theme)
    )
  } catch {
    return false
  }
}
