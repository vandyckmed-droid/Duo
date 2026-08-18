import { useState } from 'react'
import { logoUrl } from '../data/index.ts'

/**
 * A stock's mark: its logo over a monogram.
 *
 * The monogram is the base layer and the logo is painted on top only once it
 * has actually decoded. Logos come from a third party, so a ticker without
 * one — or a phone on a slow connection — shows a readable monogram instead
 * of a blank box, and the row never reflows when an image arrives late.
 *
 * Images are lazy, so scrolling the full index does not fetch 400 files.
 */
export function CompanyMark({ ticker }: { readonly ticker: string }) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  return (
    <span className="mark" aria-hidden="true">
      <span className="mark-monogram">{ticker.slice(0, 2)}</span>
      {!failed && (
        <img
          className={loaded ? 'mark-image mark-image-loaded' : 'mark-image'}
          src={logoUrl(ticker)}
          alt=""
          loading="lazy"
          decoding="async"
          width={28}
          height={28}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  )
}
