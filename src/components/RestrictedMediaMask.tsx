'use client'

import { getVisualRiskLevelLabel, type VisualRiskLevel } from '@/utils/visualModeration'

interface RestrictedMediaMaskProps {
  level: Exclude<VisualRiskLevel, 'low'>
  warning: string
  revealed?: boolean
  canReveal?: boolean
  onReveal?: () => void
}

export default function RestrictedMediaMask({
  level,
  warning,
  revealed = false,
  canReveal = false,
  onReveal,
}: RestrictedMediaMaskProps) {
  const levelLabel = getVisualRiskLevelLabel(level)
  const badgeClassName =
    level === 'high'
      ? 'border-red-200/80 bg-red-50/90 text-red-700'
      : 'border-amber-200/80 bg-amber-50/90 text-amber-700'

  if (revealed) {
    return (
      <div className="pointer-events-none absolute left-2 top-2 z-20">
        <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/70 bg-white/55 px-2 py-1 text-[10px] font-medium text-gray-600 shadow-sm backdrop-blur-sm">
          <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${badgeClassName}`}>
            {levelLabel}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/28 backdrop-blur-md px-4">
      <div className="max-w-sm rounded-2xl border border-white/40 bg-white/78 p-4 text-center shadow-xl backdrop-blur-md">
        <div className={`mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full ${
          level === 'high' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
        }`}>
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-7.938 4h15.876c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L2.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div className="mb-3 flex justify-center">
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badgeClassName}`}>
            危险等级：{levelLabel}
          </span>
        </div>
        <p className="text-sm font-semibold text-gray-900">{warning}</p>
        {canReveal && onReveal && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onReveal()
            }}
            className="mt-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:from-orange-600 hover:to-amber-600"
          >
            查看内容
          </button>
        )}
      </div>
    </div>
  )
}
