// next/image loader (configured in next.config.ts).
//
// Catalogue photos are pre-optimised by scripts/images/build.ts into fixed
// widths: /images/catalog/<name>.webp is served as <name>-480.webp, -960, -1440;
// editorial photos also have -2000. Admin uploads live on Cloudinary and are
// resized on the fly. Anything else is returned unchanged.

const CATALOG_WIDTHS = [480, 960, 1440]
const EDITORIAL_WIDTHS = [960, 1440, 2000]

export default function imageLoader({ src, width }: { src: string; width: number; quality?: number }): string {
  if (src.startsWith('https://res.cloudinary.com/')) {
    return src.replace('/image/upload/', `/image/upload/f_auto,q_auto,c_limit,w_${width}/`)
  }
  const match = /^(\/images\/(catalog|editorial)\/[\w-]+)\.webp$/.exec(src)
  if (match) {
    const widths = match[2] === 'editorial' ? EDITORIAL_WIDTHS : CATALOG_WIDTHS
    const chosen = widths.find((w) => w >= width) ?? widths[widths.length - 1]
    return `${match[1]}-${chosen}.webp`
  }
  return src
}
