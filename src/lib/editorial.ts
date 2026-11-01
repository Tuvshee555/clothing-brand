// Editorial (campaign) photography used by the homepage and brand pages.
// Paths are logical: the image loader serves the right width of each file
// built by scripts/images/build.ts.
export const EDITORIAL = {
  heroLeft: { src: '/images/editorial/hero-latte.webp', alt: 'Латте өнгийн оверсайз hoodie өмссөн загвар өмсөгч цагаан студид' },
  heroRight: { src: '/images/editorial/hero-cream.webp', alt: 'Цөцгий өнгийн ноолууран свитер өмссөн загвар өмсөгч цонхны гэрэлд' },
  winterWide: { src: '/images/editorial/winter-woods.webp', alt: 'Хар ноосон пальто өмссөн эмэгтэй цастай ойд' },
  winterPortrait: { src: '/images/editorial/winter-snow.webp', alt: 'Хар пальто, тартан ороолттой эмэгтэй цасан дунд' },
  women: { src: '/images/editorial/tile-women.webp', alt: 'Арьсан хүрэм нөмөрсөн эмэгтэй загвар өмсөгч' },
  men: { src: '/images/editorial/tile-men.webp', alt: 'Дулаалгатай хантааз, саарал свитшот өмссөн эрэгтэй загвар өмсөгч' },
  story: { src: '/images/editorial/story-knit.webp', alt: 'Цөцгий өнгийн сүлжмэл свитерийн ойрын зураг' },
  essentials: { src: '/images/editorial/essentials.webp', alt: 'Саарал hoodie, спорт өмд өмссөн загвар өмсөгч' },
} as const
