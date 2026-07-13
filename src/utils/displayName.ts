export const DISPLAY_NAME_MAX_LENGTH = 20

const CJK_CHARACTER_PATTERN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

export function normalizeDisplayName(value: string) {
  return value.trim()
}

export function getDisplayNameLength(value: string) {
  return Array.from(value).reduce((total, char) => {
    return total + (CJK_CHARACTER_PATTERN.test(char) ? 2 : 1)
  }, 0)
}

export function isDisplayNameWithinLimit(value: string) {
  return getDisplayNameLength(value) <= DISPLAY_NAME_MAX_LENGTH
}
