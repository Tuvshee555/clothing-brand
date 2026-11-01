// Builds the store's optimised photos from scripts/images/manifest.json.
//
//   npm run images:build            # download (cached) + crop + encode everything
//   npm run images:build -- --only hoodie-latte-1
//
// Every photo comes from Burst (Shopify's free stock photo library) under the
// Burst licence (free commercial use, modification allowed, no attribution
// required — credits are kept anyway) or CC0. Originals are cached in
// scripts/images/.cache (git-ignored); only the optimised WebP files and the
// licence record are committed.
import fs from 'node:fs'
import path from 'node:path'
import sharp, { type Sharp } from 'sharp'

interface ManifestEntry {
  key: string
  slug: string
  kind: 'catalog' | 'editorial'
  /** Crop anchor: sharp position ("attention", "north", "centre"…) or explicit offsets as fractions. */
  focus?: string | { x: number; y: number }
  /** Editorial aspect (width/height); catalogue is always 4:5. */
  aspect?: number
  /** Extra zoom before cropping (1 = none), e.g. 1.25 to crop tighter. */
  zoom?: number
  title: string
  author: string
  license: 'burst' | 'cc0'
}

const ROOT = process.cwd()
const MANIFEST = path.join(ROOT, 'scripts', 'images', 'manifest.json')
const CACHE = path.join(ROOT, 'scripts', 'images', '.cache')
const OUT = path.join(ROOT, 'public', 'images')
const CATALOG_WIDTHS = [480, 960, 1440]
const EDITORIAL_WIDTHS = [960, 1440, 2000]
const LICENSES = {
  burst: { name: 'Burst licence (Shopify) — free commercial use, no attribution required', url: 'https://www.shopify.com/stock-photos/licenses/shopify-some-rights-reserved' },
  cc0: { name: 'Creative Commons Zero (CC0)', url: 'https://www.shopify.com/stock-photos/licenses/creative-commons' },
}

async function original(slug: string): Promise<Buffer> {
  const file = path.join(CACHE, `${slug}.jpg`)
  if (fs.existsSync(file)) return fs.readFileSync(file)
  const url = `https://burst.shopifycdn.com/photos/${slug}.jpg?width=2600&format=pjpg&exif=0&iptc=0`
  const res = await fetch(url, { headers: { 'User-Agent': 'manan-store-image-build/1.0' } })
  if (!res.ok) throw new Error(`${res.status} for ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.mkdirSync(CACHE, { recursive: true })
  fs.writeFileSync(file, buf)
  return buf
}

async function cropped(entry: ManifestEntry, buf: Buffer): Promise<Sharp> {
  const aspect = entry.kind === 'catalog' ? 4 / 5 : (entry.aspect ?? 16 / 9)
  const img = sharp(buf).rotate()
  const meta = await img.metadata()
  const w = meta.width ?? 2000
  const h = meta.height ?? 2000
  const zoom = Math.max(1, entry.zoom ?? 1)
  // Largest box of the target aspect that fits, shrunk by the zoom factor.
  let cw = Math.min(w, h * aspect) / zoom
  let ch = cw / aspect
  if (ch > h) {
    ch = h
    cw = ch * aspect
  }
  if (typeof entry.focus === 'object') {
    const left = Math.round(Math.min(Math.max(entry.focus.x * w - cw / 2, 0), w - cw))
    const top = Math.round(Math.min(Math.max(entry.focus.y * h - ch / 2, 0), h - ch))
    return sharp(buf).rotate().extract({ left, top, width: Math.round(cw), height: Math.round(ch) })
  }
  const position = entry.focus ?? 'attention'
  if (zoom > 1) {
    // Zoom: first crop with the strategy at full size, then trim evenly around the centre.
    const first = await sharp(buf)
      .rotate()
      .resize({ width: Math.round(cw * zoom), height: Math.round(ch * zoom), fit: 'cover', position })
      .toBuffer()
    const left = Math.round((cw * zoom - cw) / 2)
    const top = Math.round((ch * zoom - ch) / 2)
    return sharp(first).extract({ left, top, width: Math.round(cw), height: Math.round(ch) })
  }
  return sharp(buf).rotate().resize({ width: Math.round(cw), height: Math.round(ch), fit: 'cover', position })
}

async function main() {
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as ManifestEntry[]
  const credits: Record<string, unknown>[] = []
  for (const entry of manifest) {
    credits.push({
      key: entry.key,
      title: entry.title,
      photographer: entry.author,
      source: `https://burst.shopify.com/photos/${entry.slug}`,
      license: LICENSES[entry.license].name,
      licenseUrl: LICENSES[entry.license].url,
      used: entry.kind,
      modified: 'Cropped, resized and re-encoded as WebP',
    })
    if (only && entry.key !== only) continue
    const dir = path.join(OUT, entry.kind)
    const widths = entry.kind === 'catalog' ? CATALOG_WIDTHS : EDITORIAL_WIDTHS
    const done = widths.every((w) => fs.existsSync(path.join(dir, `${entry.key}-${w}.webp`)))
    if (done && !only) continue
    const buf = await original(entry.slug)
    const base = await (await cropped(entry, buf)).toBuffer()
    fs.mkdirSync(dir, { recursive: true })
    for (const w of widths) {
      const h = Math.round(w / (entry.kind === 'catalog' ? 4 / 5 : (entry.aspect ?? 16 / 9)))
      await sharp(base)
        .resize({ width: w, height: h, fit: 'cover' })
        .webp({ quality: w >= 1440 ? 70 : 74, effort: 5 })
        .toFile(path.join(dir, `${entry.key}-${w}.webp`))
    }
    // Plain path (960px) for places that bypass the image loader (Open Graph, JSON-LD).
    fs.copyFileSync(path.join(dir, `${entry.key}-960.webp`), path.join(dir, `${entry.key}.webp`))
    console.log(`✓ ${entry.kind}/${entry.key}`)
  }
  fs.writeFileSync(path.join(OUT, 'credits.json'), JSON.stringify(credits, null, 2))
  console.log(`credits: ${credits.length} photos`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
