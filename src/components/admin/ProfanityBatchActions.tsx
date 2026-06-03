'use client'

interface ProfanityBatchActionsProps {
  selectionMode: boolean
  totalCount: number
  selectedCount: number
  allSelected: boolean
  loading: boolean
  onToggleSelectAll: () => void
  onBatchDisable: () => void
  onBatchEnable: () => void
  onToggleSelectionMode: () => void
  onAdd: () => void
}

export default function ProfanityBatchActions({
  selectionMode,
  totalCount,
  selectedCount,
  allSelected,
  loading,
  onToggleSelectAll,
  onBatchDisable,
  onBatchEnable,
  onToggleSelectionMode,
  onAdd,
}: ProfanityBatchActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {selectionMode && (
        <>
          <button
            onClick={onToggleSelectAll}
            disabled={totalCount === 0 || loading}
            className="px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {allSelected ? '取消全选' : '选择全部'}
          </button>
          <button
            onClick={onBatchDisable}
            disabled={selectedCount === 0 || loading}
            className="px-4 py-2 bg-yellow-100 text-yellow-800 font-medium rounded-lg hover:bg-yellow-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            批量禁用
          </button>
          <button
            onClick={onBatchEnable}
            disabled={selectedCount === 0 || loading}
            className="px-4 py-2 bg-green-100 text-green-800 font-medium rounded-lg hover:bg-green-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            批量启用
          </button>
        </>
      )}
      <button
        onClick={onToggleSelectionMode}
        disabled={loading}
        className={`px-4 py-2 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          selectionMode
            ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            : 'bg-orange-100 text-orange-800 hover:bg-orange-200'
        }`}
      >
        {selectionMode ? '退出批量选择' : '批量选择'}
      </button>
      <button
        onClick={onAdd}
        className="px-4 py-2 bg-gradient-to-r from-orange-400 to-amber-400 text-white font-semibold rounded-lg hover:from-orange-500 hover:to-amber-500 transition-all flex items-center gap-2"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        添加违禁词
      </button>
    </div>
  )
}
