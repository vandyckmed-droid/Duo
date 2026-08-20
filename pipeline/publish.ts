import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  DATASET_VERSION,
  type DiversifiedList,
  type Manifest,
  type SecurityRecord,
  type UniverseFile,
} from '../src/domain/dataset.ts'

/**
 * Publishing.
 *
 * Written to a staging directory and moved into place in one rename, so a
 * build that copies the output can never pick up a half-written dataset. If
 * anything throws part-way through, the previous publication is still sitting
 * there intact.
 *
 * Two files only. `universe.json` holds every number the app needs and is the
 * single request made at startup; `manifest.json` is provenance for
 * operations and the forward prediction record.
 */

export interface PublishResult {
  readonly directory: string
  readonly bytes: number
}

export async function publish(
  target: string,
  manifest: Manifest,
  securities: readonly SecurityRecord[],
  diversified: DiversifiedList,
): Promise<PublishResult> {
  const staging = `${target}.staging`
  await rm(staging, { recursive: true, force: true })
  await mkdir(staging, { recursive: true })

  let bytes = 0
  const write = async (name: string, body: string) => {
    await writeFile(join(staging, name), body)
    bytes += Buffer.byteLength(body)
  }

  await write('manifest.json', JSON.stringify(manifest))

  const universe: UniverseFile = {
    version: DATASET_VERSION,
    asOf: manifest.asOf,
    securities,
    diversified,
  }
  // Six decimals on every published number. A signal carries about four
  // meaningful digits and the interface shows two; the seventeen digits a
  // float serialises to are transfer size spent on precision nobody can see.
  await write(
    'universe.json',
    JSON.stringify(universe, (_key, value: unknown) =>
      typeof value === 'number' && Number.isFinite(value)
        ? Math.round(value * 1e6) / 1e6
        : value,
    ),
  )

  // One rename: either the whole dataset is live or none of it is.
  await rm(target, { recursive: true, force: true })
  await rename(staging, target)

  return { directory: target, bytes }
}
