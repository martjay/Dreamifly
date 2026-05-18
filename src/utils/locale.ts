/** 站内路径（无前缀 locale） */
export function transferUrl(path: string): string {
  return path.startsWith('/') ? path : `/${path}`
}
