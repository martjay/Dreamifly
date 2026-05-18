import { createScopedT } from '@/lib/strings'
interface TabNavigationProps {
  activeTab: 'generate' | 'video-generation';
  onTabChange: (tab: 'generate' | 'video-generation') => void;
}

const TabNavigation = ({ activeTab, onTabChange }: TabNavigationProps) => {
  const t = createScopedT('home.generate')

  return (
    <div className="mb-5 sm:mb-7 animate-fadeInUp">
      <div className="relative bg-gradient-to-br from-white/95 to-gray-50/95 backdrop-blur-md rounded-[22px] sm:rounded-3xl shadow-2xl p-1.5 sm:p-2 lg:p-5 border border-orange-400/30">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-400/10 to-amber-400/10 rounded-[22px] sm:rounded-3xl"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(251,146,60,0.2),rgba(255,255,255,0))]"></div>
        
        <div className="relative">
          {/* Tab Buttons */}
          <div className="flex space-x-1 mb-0 bg-gray-100/50 rounded-xl sm:rounded-2xl p-0.5 sm:p-1">
            <button
              onClick={() => onTabChange('generate')}
              className={`flex-1 px-2.5 py-1.5 text-[13px] sm:px-3 sm:py-2 sm:text-sm md:px-6 md:py-3 rounded-lg sm:rounded-xl font-medium transition-all duration-300 ${
                activeTab === 'generate'
                  ? 'bg-white text-gray-900 shadow-lg shadow-gray-300/20 border border-gray-200/30'
                  : 'text-gray-700 hover:text-gray-900 hover:bg-gray-200/50'
              }`}
            >
              {t('form.tabs.generate')}
            </button>
            <button
              onClick={() => onTabChange('video-generation')}
              className={`flex-1 px-2.5 py-1.5 text-[13px] sm:px-3 sm:py-2 sm:text-sm md:px-6 md:py-3 rounded-lg sm:rounded-xl font-medium transition-all duration-300 ${
                activeTab === 'video-generation'
                  ? 'bg-white text-gray-900 shadow-lg shadow-gray-300/20 border border-gray-200/30'
                  : 'text-gray-700 hover:text-gray-900 hover:bg-gray-200/50'
              }`}
            >
              {t('form.tabs.videoGeneration')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TabNavigation
