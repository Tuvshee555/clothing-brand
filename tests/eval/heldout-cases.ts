// Held-out evaluation set (Lorentz discipline): written after the engine was
// tuned on mongolian-cases.ts and run once without tuning against it. Its score
// is reported as it is. A case that gets fixed later moves to the main set and is
// replaced here. Kept out of the default test run (ASSISTANT_EVAL_HELDOUT=1).
import type { EvalCase } from './mongolian-cases'

const one = (id: string, category: EvalCase['category'], text: string, expect: EvalCase['expect'], page?: string): EvalCase => ({ id, category, turns: [{ text, page }], expect })

export const HELDOUT: EvalCase[] = [
  one('h-cy-1', 'cyrillic', 'Зузаан свитшот хэдэн төгрөг вэ?', { contains: ['189,000₮'] }),
  one('h-cy-2', 'cyrillic', 'Ноосон тартан ороолт бий юу?', { contains: ['Ноосон тартан ороолт'], any: ['бэлэн', 'ширхэг'] }),
  one('h-cy-3', 'cyrillic', 'Арьсан тор цүнх ямар өнгөнүүдтэй вэ?', { contains: ['Хар', 'Цайвар цэнхэр'] }),
  one('h-cy-4', 'cyrillic', 'Өвлийн пуховик L размер үлдсэн үү?', { contains: ['Гичий шар / L'] }),
  one('h-cy-5', 'cyrillic', 'Эрэгтэй ноосон пальто хүрэн өнгөөр XXL байгаа юу?', { contains: ['Хүрэн / XXL'] }),
  one('h-cy-6', 'cyrillic', 'Судалтай сүлжмэл цамц угааж болох уу?', { contains: ['Арчилгаа:'] }),
  one('h-cy-7', 'cyrillic', 'Хөнгөн салхины хүрэм ямар хэмжээтэй байдаг вэ?', { contains: ['XS, S, M, L'] }),
  one('h-cy-8', 'cyrillic', '250 мянгаас доош ямар хүрэм байна?', { any: ['Дулаалгатай хантааз', 'Хөнгөн салхины хүрэм'], not: ['Ноосон пальто'] }),
  one('h-cy-9', 'cyrillic', 'Улаанбаатар дотор хүргэлт хэдэн өдөр болох вэ?', { contains: ['Ажлын 1–2 өдөр'] }),
  one('h-cy-10', 'cyrillic', 'Хэмжээ таараагүй бол яах вэ?', { any: ['Хэмжээ солих', 'солих'] }),
  one('h-la-1', 'latin', 'zuzaan svitshot hed ve', { contains: ['189,000₮'] }),
  one('h-la-2', 'latin', 'har futbolk M bnu', { contains: ['Хар / M'] }),
  one('h-la-3', 'latin', 'ugluunii hurgelt bga yu', { any: ['шуурхай', 'Шуурхай'] }),
  one('h-la-4', 'latin', 'arsan tsunh hed ve', { any: ['189,000₮', '229,000₮'] }),
  one('h-la-5', 'latin', 'ene palito ymar materialtai ve', { contains: ['Материал:'] }, 'double-faced-wool-coat'),
  one('h-la-6', 'latin', 'jins 28 razmer bga yu', { contains: ['/ 28'] }),
  one('h-la-7', 'latin', 'hamgiin unetei palito ali ve', { contains: ['Урт арьсан пальто'] }),
  one('h-la-8', 'latin', 'aimag ruu yvuuldag uu', { contains: ['Орон нутаг'] }),
  one('h-in-1', 'informal', 'свитшот хар L бнуу', { contains: ['Хар / L'] }),
  one('h-in-2', 'informal', 'тартан ороолт хэд', { contains: ['119,000₮'] }),
  one('h-in-3', 'informal', 'пуховик ямар өнгөтэй', { contains: ['Гичий шар'] }),
  one('h-in-4', 'informal', 'бүс 105 бий юу', { contains: ['/ 105'] }),
  one('h-in-5', 'informal', 'хамгийн хямд малгай', { contains: ['Хөвөн бейсболк', '49,000₮'] }),
  { id: 'h-cx-1', category: 'context', turns: [{ text: 'Арьсан тор цүнх хэд вэ?' }, { text: 'Хар нь байгаа юу?' }], expect: { contains: ['Хар'], any: ['ширхэг', 'бэлэн'] } },
  { id: 'h-cx-2', category: 'context', turns: [{ text: 'Ямар малгай байна?' }, { text: '2 хэд вэ?' }], expect: { any: ['49,000₮', '69,000₮'] } },
  { id: 'h-cx-3', category: 'context', turns: [{ text: 'Эрэгтэй ноосон пальто' }, { text: 'хүрэн нь ямар хэмжээтэй байна?' }], expect: { contains: ['Хүрэн'] } },
  one('h-ho-1', 'handover', 'Хариулт чинь буруу байна, хүнтэй ярья', { handoff: 'customer_request' }),
  one('h-ho-2', 'handover', 'Хүргэлт ирээгүй, гомдолтой байна', { handoff: 'complaint' }),
  one('h-or-1', 'ordering', 'Зузаан свитшот хар M нэгийг авъя', { contains: ['Зузаан свитшот — Хар / M', '189,000₮'] }),
  one('h-or-2', 'ordering', 'Ноосон кепи малгай 2 ширхэг захиалъя', { contains: ['2 ширхэг × 69,000₮'] }),
]
