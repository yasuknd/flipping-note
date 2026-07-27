/**
 * 全角英数・全角スペースを半角に変換
 */
export function toHalfWidthAlnum(input: string): string {
  return input
    .replace(/　/g, ' ')
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
}

/**
 * 英字を含むが日本語を含まない文字列を英語扱いにする
 */
export function isEnglishLike(input: string): boolean {
  const s = input.trim()
  if (!s) return false
  if (/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/.test(s)) return false
  return /[A-Za-z]/.test(s)
}

/**
 * 単語の頭文字のみ大文字（Title Case）
 * 例: "nike air max" → "Nike Air Max", "UNIQLO" → "Uniqlo"
 */
export function toTitleCase(input: string): string {
  return input
    .toLowerCase()
    .replace(/(^|[\s\-_/])([a-z])/g, (_, prefix: string, letter: string) => {
      return `${prefix}${letter.toUpperCase()}`
    })
}

/**
 * ブランド・商品名向けの表記正規化
 * - 半角英数へ統一
 * - 英語のみの場合は頭文字大文字に統一
 */
export function normalizeDisplayText(input: string): string {
  const half = toHalfWidthAlnum(input).replace(/\s+/g, ' ').trim()
  if (!half) return ''
  if (isEnglishLike(half)) return toTitleCase(half)
  return half
}

/** カラー向け: 半角英大文字に統一 */
export function normalizeColor(input: string): string {
  return toHalfWidthAlnum(input).replace(/\s+/g, ' ').trim().toUpperCase()
}

/** サイズ向け: 半角英大文字に統一 */
export function normalizeSize(input: string): string {
  return toHalfWidthAlnum(input).replace(/\s+/g, '').trim().toUpperCase()
}
