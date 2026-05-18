import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BASE_URL || "https://dreamifly.com",
  fetchOptions: {
    cache: 'no-store', // 禁用缓存
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  },
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  updateUser,
  changePassword,
  sendVerificationEmail,
  $fetch,
} = authClient;

/** better-auth 部分版本的客户端类型未包含密码重置 API，运行时仍可用 */
type AuthWithPasswordReset = typeof authClient & {
  forgetPassword: (input: { email: string; redirectTo?: string }) => Promise<{ error?: { message?: string } | null }>
  resetPassword: (input: { token: string; newPassword: string }) => Promise<{ error?: { message?: string } | null }>
}

const withPasswordReset = authClient as AuthWithPasswordReset

// 避免直接 bind Proxy 上的动态属性，防止触发异常的 fetch method 解析
export const forgetPassword = (input: { email: string; redirectTo?: string }) =>
  withPasswordReset.forgetPassword(input)

export const resetPassword = (input: { token: string; newPassword: string }) =>
  withPasswordReset.resetPassword(input)
