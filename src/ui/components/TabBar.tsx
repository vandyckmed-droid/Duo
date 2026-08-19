export type Tab = 'ranking' | 'watchlist' | 'basket'

/** Bottom navigation: three destinations, counts where they orient. */
export function TabBar({
  tab,
  watchCount,
  basketCount,
  onChange,
}: {
  tab: Tab
  watchCount: number
  basketCount: number
  onChange: (tab: Tab) => void
}) {
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'ranking', label: 'Ranking' },
    { id: 'watchlist', label: 'Watchlist', count: watchCount },
    { id: 'basket', label: 'Basket', count: basketCount },
  ]
  return (
    <nav className="tabbar">
      {tabs.map(({ id, label, count }) => (
        <button
          key={id}
          type="button"
          className={tab === id ? 'is-active' : ''}
          aria-current={tab === id ? 'page' : undefined}
          onClick={() => onChange(id)}
        >
          {label}
          {count !== undefined && count > 0 && <span className="tab-count">{count}</span>}
        </button>
      ))}
    </nav>
  )
}
