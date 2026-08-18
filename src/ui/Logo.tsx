import { useState } from 'react'
import type { LogoRef } from '../data/index.ts'

/**
 * Resolves a logo reference to an image source.
 *
 * The dataset stores a company domain, not a URL, so this is the single
 * place that decides where marks come from. Pointing it at a different
 * provider — or at assets bundled with the app — touches nothing else.
 */
function toLogoSrc(logo: LogoRef): string {
  return `https://icons.duckduckgo.com/ip3/${logo}.ico`
}

/** First character of a ticker, used when no mark can be loaded. */
function toMonogram(ticker: string): string {
  return ticker.slice(0, 1)
}

interface LogoProps {
  readonly logo: LogoRef
  readonly name: string
  readonly ticker: string
}

/**
 * A company mark, desaturated to hold the black-and-white palette.
 *
 * Marks come from a third party, so all three outcomes are designed for
 * rather than just the happy one:
 *
 * - Loaded: shown on a white plate, because most marks are dark artwork on
 *   transparency and would otherwise be invisible against black.
 * - Still loading: an empty outlined circle. The plate is withheld until
 *   there is something on it — fifty white discs is what a slow network
 *   would otherwise look like.
 * - Failed: a ticker monogram, so a blocked or missing image degrades to
 *   something legible rather than to a gap in the row.
 *
 * The company name is the accessible label throughout — it is the one field
 * a card gives a screen reader but not the eye.
 */
export function Logo({ logo, name, ticker }: LogoProps) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>(
    'loading',
  )

  if (status === 'failed') {
    return (
      <span className="logo logo-monogram" role="img" aria-label={name}>
        {toMonogram(ticker)}
      </span>
    )
  }

  return (
    <img
      className={status === 'loaded' ? 'logo logo-loaded' : 'logo'}
      src={toLogoSrc(logo)}
      alt={name}
      width={28}
      height={28}
      loading="lazy"
      decoding="async"
      onLoad={() => setStatus('loaded')}
      onError={() => setStatus('failed')}
    />
  )
}
