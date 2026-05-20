export const HTML_LIVE_FENCE_LANGS = new Set(["html", "htm", "html-live"])

export function isHtmlLiveFence(lang: string | undefined): boolean {
  if (!lang) return false
  return HTML_LIVE_FENCE_LANGS.has(lang)
}
