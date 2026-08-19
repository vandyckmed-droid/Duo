import type { Manifest } from '../domain/dataset.ts'
import { SEGMENTS } from '../domain/segments.ts'
import { METRICS } from '../domain/metrics.ts'
import { BETA_LOOKBACK, RANK_CHANGE_OFFSET } from '../domain/windows.ts'
import { isoToDisplay, percent, percentPlain } from '../domain/format.ts'
import { describeRegime } from '../domain/regime.ts'

/**
 * Settings, and what that means here.
 *
 * No ranking control lives on this screen. Metric, segment, sector, direction
 * and search all belong on the list they change, and moving any of them here
 * would put the product's central act two navigations away.
 *
 * What is left is provenance: where the numbers came from, how each one is
 * defined, and how fresh the dataset is. That is the honest content of a
 * settings screen for something that promises transparent rankings.
 */

interface Props {
  readonly manifest: Manifest
  readonly watchlistSize: number
  readonly onClearWatchlist: () => void
}

export function SettingsView({ manifest, watchlistSize, onClearWatchlist }: Props) {
  return (
    <div className="scroll">
      <div className="section">
        <h2 className="section-title">Dataset</h2>
        <Row label="As of" value={isoToDisplay(manifest.asOf)} />
        <Row label="Refreshed" value={new Date(manifest.generatedAt).toUTCString().slice(0, 22)} />
        <Row label="Securities" value={String(manifest.counts.total)} />
        <Row label="Trading days" value={String(manifest.calendarDays)} />
        <Row label="Provider" value={manifest.provider} />
      </div>

      {manifest.market && (
        <div className="section">
          <h2 className="section-title">Market regime</h2>
          <p className="prose">{describeRegime(manifest.market)}.</p>
          <Row
            label="Below 52-week high"
            hint="SPY close vs its highest close of the trailing 252 trading days"
            value={percentPlain((1 - manifest.market.fromHigh))}
          />
          <Row label="Return 6M" hint="SPY, 126 trading days" value={percent(manifest.market.return6M)} />
          <Row label="Return 1M" hint="SPY, 21 trading days" value={percent(manifest.market.return1M)} />
          <p className="prose">
            The states, from fixed thresholds: <strong>Normal</strong> — within 10% of the
            high and non-negative over six months. <strong>Caution</strong> — more than 10%
            below the high, or negative over six months. <strong>Reversal risk</strong> —
            more than 10% below the high <em>and</em> up over 5% in a month, the setup in
            which momentum rankings have historically inverted. In a 2007–2026
            walk-forward study of this universe, momentum rankings carried forward
            information in Normal states and ran negative in the others; the same
            structure is documented in the academic literature (Cooper–Gutierrez–Hameed
            2004; Daniel–Moskowitz 2016). The meter on the ranked list marks the 10%
            line; the dot is the market. Context only — rankings are never altered.
          </p>
        </div>
      )}

      <div className="section">
        <h2 className="section-title">Segments and benchmarks</h2>
        {SEGMENTS.map((s) => (
          <Row
            key={s.id}
            label={s.indexName}
            hint={`β and residual return vs ${s.benchmark} — ${s.benchmarkName}`}
            value={`${manifest.counts[s.id] ?? 0} · ${s.benchmark}`}
          />
        ))}
        <p className="prose" style={{ padding: '10px 0 0' }}>
          Every security is measured against the benchmark for its own index. A MidCap
          400 name is never regressed against SPY: doing so would report the mid-cap
          size premium as if it were stock-specific return.
        </p>
      </div>

      <div className="section">
        <h2 className="section-title">Where membership came from</h2>
        {manifest.membership.map((m) => (
          <Row key={m.segment} label={`Segment ${m.segment}`} hint={m.detail} value={m.source} />
        ))}
      </div>

      <div className="section">
        <h2 className="section-title">Metric definitions</h2>
        {METRICS.map((m) => (
          <div className="stat-row" key={m.id} style={{ display: 'block' }}>
            <div style={{ fontWeight: 640, paddingBottom: 3 }}>{m.label}</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.45 }}>
              {m.definition}
            </div>
          </div>
        ))}
      </div>

      <div className="section">
        <h2 className="section-title">Windows</h2>
        {Object.entries(manifest.windows).map(([id, w]) => (
          <Row
            key={id}
            label={id}
            hint="trading days, not calendar months"
            value={w.skip > 0 ? `${w.formation} formation, ${w.skip} skip` : `${w.formation} formation`}
          />
        ))}
        <Row label="Beta lookback" value={`${manifest.betaLookback || BETA_LOOKBACK} days`} />
        <Row
          label="Rank change"
          value={`${manifest.rankChangeOffset || RANK_CHANGE_OFFSET} days`}
        />
      </div>

      {manifest.excluded.length > 0 && (
        <div className="section">
          <h2 className="section-title">Excluded this refresh · {manifest.excluded.length}</h2>
          {manifest.excluded.slice(0, 40).map((e) => (
            <Row key={`${e.ticker}-${e.reason}`} label={e.ticker} value={e.reason} />
          ))}
        </div>
      )}

      <div className="section">
        <h2 className="section-title">Watchlist</h2>
        <Row label="Names" value={String(watchlistSize)} />
        <div className="choices" style={{ padding: '12px 0 0' }}>
          <button onClick={onClearWatchlist} disabled={watchlistSize === 0}>
            Clear watchlist
          </button>
        </div>
      </div>

      <p className="prose" style={{ padding: '22px 16px 48px' }}>
        Prices are dividend-adjusted end-of-day closes. Nothing is fetched from a
        market data provider by this page: the dataset is built in GitHub Actions,
        where the API key lives, and published as static JSON. Browsing never issues a
        provider request, and no credential is present in this bundle.
      </p>
    </div>
  )
}

function Row({ label, hint, value }: { label: string; hint?: string; value: string }) {
  return (
    <div className="stat-row">
      <span className="stat-label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <span className="stat-value num">{value}</span>
    </div>
  )
}
