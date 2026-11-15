// The Mongolian evaluation set for the MANAN assistant: how shoppers really
// write — Cyrillic, Latin-script Mongolian, informal and glued spellings, and
// multi-turn context — with what a correct answer must (and must not) contain,
// taken from the seeded catalogue. Run by tests/integration/assistant-eval.test.ts
// in catalogue mode (no model); ASSISTANT_EVAL_REPORT=1 writes docs/assistant/EVAL.md.

export type Category = 'cyrillic' | 'latin' | 'informal' | 'context' | 'handover' | 'ordering'

export interface EvalExpect {
  /** Every string must appear in the reply. */
  contains?: string[]
  /** At least one must appear. */
  any?: string[]
  /** None may appear. */
  not?: string[]
  match?: RegExp
  intent?: string | string[]
  notIntent?: string
  event?: string
  /** A hand-over with this reason. */
  handoff?: string
}

export interface EvalCase {
  id: string
  category: Category
  turns: { text: string; page?: string }[]
  expect: EvalExpect
}

const one = (id: string, category: Category, text: string, expect: EvalExpect, page?: string): EvalCase => ({ id, category, turns: [{ text, page }], expect })

export const CASES: EvalCase[] = [
  // ── Cyrillic: product facts ──
  one('cy-price', 'cyrillic', 'Оксфорд цамц хэд вэ?', { contains: ['139,000₮'] }),
  one('cy-colours', 'cyrillic', 'Оверсайз hoodie ямар өнгөтэй вэ?', { contains: ['Латте', 'Цайвар саарал', 'Хар'] }),
  one('cy-size-price', 'cyrillic', 'Ноосон пальто XL хэд вэ?', { contains: ['479,000₮'] }),
  one('cy-variant-in', 'cyrillic', 'Хар hoodie M байгаа юу?', { contains: ['Хар / M'], match: /4 ширхэг/ }),
  one('cy-variant-out', 'cyrillic', 'Хар hoodie S байгаа юу?', { contains: ['Хар / S', 'дууссан', 'M (4 ш)'], not: ['Тийм,'] }),
  one('cy-variant-out-2', 'cyrillic', 'Маалинган цамц XXL байгаа юу?', { contains: ['XXL', 'дууссан'] }),
  one('cy-waist', 'cyrillic', 'Шулуун жинс 32 размер бий юу?', { contains: ['Хар хөх / 32'], match: /6 ширхэг/ }),
  one('cy-waist-out', 'cyrillic', 'Өндөр бүсэлхийтэй жинс дунд цэнхэр 32 размер байгаа юу?', { contains: ['Дунд цэнхэр / 32', 'дууссан'] }),
  one('cy-colour-size', 'cyrillic', 'Ноолууран свитер саарал M байна уу?', { contains: ['Саарал / M'], match: /3 ширхэг/ }),
  one('cy-colour-missing', 'cyrillic', 'Дулаалгатай хантааз хар өнгөөр байгаа юу?', { contains: ['хар өнгөөр байхгүй', 'Хар хөх'] }),
  one('cy-sizes', 'cyrillic', 'Хөвөн спорт өмд ямар хэмжээтэй вэ?', { contains: ['S, M, L, XL'] }),
  one('cy-one-size', 'cyrillic', 'Ноосон кепи малгай хэд вэ?', { contains: ['69,000₮'] }),
  one('cy-belt', 'cyrillic', 'Арьсан бүс 95 размер бий юу?', { contains: ['/ 95'] }),
  one('cy-material', 'cyrillic', 'Ноолууран свитер ямар материалтай вэ?', { contains: ['Материал:'], any: ['ноолуур', 'Ноолуур'] }),
  one('cy-care', 'cyrillic', 'Оксфорд цамцыг яаж угаах вэ?', { contains: ['Арчилгаа:'] }),
  one('cy-fit', 'cyrillic', 'Оверсайз hoodie томдож өмсөгддөг үү?', { contains: ['Хэлбэр:'] }),
  one('cy-size-advice', 'cyrillic', 'Би 168 см, 60 кг. Оверсайз hoodie аль размер авах вэ?', { contains: ['Цээж (см)', 'таамаглаж хэлэхгүй'] }),
  one('cy-cheapest', 'cyrillic', 'Хамгийн хямд хүрэм аль нь вэ?', { contains: ['Хамгийн хямд', 'Дулаалгатай хантааз', '199,000₮'] }),
  one('cy-priciest', 'cyrillic', 'Хамгийн үнэтэй бараа аль нь вэ?', { contains: ['Урт арьсан пальто', '590,000₮'] }),
  one('cy-above', 'cyrillic', '300,000₮-өөс дээш ямар бараа байна?', { contains: ['Ноосон пальто'], not: ['Оксфорд цамц'] }),
  one('cy-below', 'cyrillic', '100 мянгаас доош юу байна?', { contains: ['Суурь хөвөн футболк'], not: ['Ноосон пальто'] }),
  one('cy-browse-jeans', 'cyrillic', 'Ямар жинс байна?', { contains: ['Шулуун жинс', 'Өндөр бүсэлхийтэй жинс'] }),
  one('cy-audience', 'cyrillic', 'Эмэгтэй ямар пальто байна?', { any: ['Ноосон пальто', 'Урт арьсан пальто'], not: ['Эрэгтэй ноосон пальто'] }),
  one('cy-winter', 'cyrillic', 'Өвөлд ямар хувцас тохирох вэ?', { event: 'search' }),
  one('cy-delivery-fee', 'cyrillic', 'Хүргэлтийн үнэ хэд вэ?', { contains: ['6,000₮', '200,000₮'] }),
  one('cy-countryside', 'cyrillic', 'Орон нутаг руу хүргэдэг үү?', { contains: ['Орон нутаг', '10,000₮'] }),
  one('cy-returns', 'cyrillic', 'Буцаах нөхцөл ямар вэ?', { contains: ['14 хоног'] }),
  one('cy-exchange', 'cyrillic', 'Хэмжээ солиулж болох уу?', { contains: ['Хэмжээ солих'] }),
  one('cy-payment', 'cyrillic', 'Яаж төлөх вэ?', { contains: ['QPay'] }),
  one('cy-size-guide', 'cyrillic', 'Хэмжээний хүснэгт байна уу?', { contains: ['Цээж (см)'] }),
  one('cy-not-sold', 'cyrillic', 'Танайд даашинз байна уу?', { contains: ['олдсонгүй'], not: ['₮'] }),
  one('cy-faq', 'cyrillic', 'Бэлгийн карт байдаг уу?', { contains: ['бэлгийн карт'], intent: 'faq' }),

  // ── Latin-script Mongolian ──
  one('la-price', 'latin', 'oksford tsamts hed ve', { contains: ['139,000₮'] }),
  one('la-variant', 'latin', 'har hoodie M bga yu', { contains: ['Хар / M'] }),
  one('la-type-price', 'latin', 'palito hed ve', { contains: ['Ноосон пальто'] }),
  one('la-this-price', 'latin', 'ene tsamts hed ve', { contains: ['Оксфорд цамц', '139,000₮'] }, 'oxford-shirt'),
  // Three colours and no colour named yet: L is shown for each colour.
  one('la-this-size', 'latin', 'L razmer bga yu', { contains: ['L хэмжээ', 'Латте:', 'Хар:'] }, 'oversized-hoodie'),
  one('la-this-colour', 'latin', 'har ungu bga yu', { contains: ['хар өнгөөр байхгүй', 'Цайвар цэнхэр'] }, 'oxford-shirt'),
  one('la-other-colour', 'latin', 'ene umdnii uur ungu bii yu', { contains: ['Түүхий цагаан', 'Цайвар саарал'] }, 'fleece-joggers'),
  one('la-below', 'latin', '200k-aas doosh tsamts bga yu', { contains: ['Оксфорд цамц'], not: ['Ноолууран свитер'] }),
  one('la-below-2', 'latin', '200 myangaas doosh ymar tsamts bga ve', { contains: ['Оксфорд цамц'] }),
  one('la-delivery-time', 'latin', 'hurgelt hed honog ve', { contains: ['Ажлын 1–2 өдөр'] }),
  one('la-delivery-fee', 'latin', 'hurgeltiin une hed ve', { contains: ['6,000₮'] }),
  one('la-how-order', 'latin', 'yaj zahialah ve', { contains: ['Сагсанд нэмэх'] }),
  one('la-tracking', 'latin', 'zahialgaa yaj shalgah ve', { contains: ['/orders'] }),
  one('la-returns', 'latin', 'butsaaj boloh uu', { contains: ['Буцаалт'] }),
  one('la-exchange', 'latin', 'hemjee soliulj boloh uu', { contains: ['Хэмжээ солих'] }),
  one('la-payment', 'latin', 'yaj tuluh ve', { contains: ['QPay'] }),
  one('la-cashmere', 'latin', 'noolooran sviter saaral M bnu', { contains: ['Саарал / M'] }),
  one('la-jeans-size', 'latin', 'jins 30 razmer bga yu', { contains: ['/ 30'] }),
  one('la-cheapest', 'latin', 'hamgiin hyamd hurem ali ve', { contains: ['Дулаалгатай хантааз'] }),
  one('la-winter', 'latin', 'uvliin huvtsas sanal bolgooch', { event: 'search' }),
  one('la-hoodie-page', 'latin', 'ene hoodie hed ve', { contains: ['219,000₮'] }, 'oversized-hoodie'),
  one('la-not-sold', 'latin', 'tanaid daashinz bii yu', { contains: ['олдсонгүй'] }),
  one('la-sizes', 'latin', 'ymar razmeruud bdag ve', { contains: ['XS, S, M, L, XL'] }, 'double-faced-wool-coat'),
  one('la-greeting', 'latin', 'sn bnuu', { intent: 'greeting' }),

  // ── Informal, glued, typos, capitals ──
  one('in-hudi', 'informal', 'хар худи L бну', { contains: ['Хар / L'] }),
  one('in-no-punct', 'informal', 'хар hoodie l байгаа юу', { contains: ['Хар / L'] }),
  one('in-caps', 'informal', 'ХАР HOODIE L БАЙГАА ЮУ', { contains: ['Хар / L'] }),
  one('in-vowels', 'informal', 'оксфорд цамц хэд вэээ', { contains: ['139,000₮'] }),
  one('in-genitive', 'informal', 'оксфорд цамцны үнэ', { contains: ['139,000₮'] }),
  one('in-suffix', 'informal', 'оверсайз худины хар L', { contains: ['Хар / L'] }),
  one('in-count', 'informal', 'оверсайз hoodie L хэдэн ширхэг үлдсэн бэ', { contains: ['L хэмжээ'] }),
  one('in-amount-space', 'informal', '200000 аас доош цамц', { contains: ['Оксфорд цамц'] }),
  one('in-men-jacket', 'informal', 'эрэгтэй арьсан хүрэм хэд вэ', { contains: ['520,000₮'] }),
  one('in-hello', 'informal', 'сайн байна уу', { intent: 'greeting' }),
  one('in-thanks', 'informal', 'баярлалаа', { intent: 'thanks' }),
  one('in-ok', 'informal', 'за', { intent: 'ack' }),
  one('in-hi', 'informal', 'hi', { intent: 'greeting' }),
  one('in-two-questions', 'informal', 'оксфорд цамц байгаа юу, хүргэлт хэд хоног вэ?', { contains: ['Оксфорд цамц', 'Ажлын 1–2 өдөр'] }),
  one('in-colour-first', 'informal', 'хар өнгийн ноосон пальто L', { contains: ['Хар / L'] }),
  one('in-navy', 'informal', 'шулуун жинс хар хөх 30 байна уу', { contains: ['Хар хөх / 30'] }),

  // ── Conversation context ──
  { id: 'cx-colour-then-size', category: 'context', turns: [{ text: 'Хар өнгө байгаа юу?', page: 'oversized-hoodie' }, { text: 'L размер бэлэн байгаа юу?', page: 'oversized-hoodie' }], expect: { contains: ['Хар / L'] } },
  { id: 'cx-product-colour-size', category: 'context', turns: [{ text: 'Оверсайз hoodie' }, { text: 'Хар нь байна уу?' }, { text: 'XL?' }], expect: { contains: ['Хар / XL'] } },
  { id: 'cx-pick-number', category: 'context', turns: [{ text: 'Ямар жинс байна?' }, { text: '2' }], expect: { contains: ['Өндөр бүсэлхийтэй жинс'] } },
  { id: 'cx-pick-first', category: 'context', turns: [{ text: 'Ямар жинс байна?' }, { text: 'эхнийх нь' }], expect: { contains: ['Шулуун жинс'] } },
  { id: 'cx-pick-with-question', category: 'context', turns: [{ text: 'Ямар жинс байна?' }, { text: '1 32 размер байгаа юу?' }], expect: { contains: ['Шулуун жинс', '/ 32'] } },
  { id: 'cx-compare-named', category: 'context', turns: [{ text: 'Оксфорд цамц, маалинган цамц хоёрын ялгаа юу вэ?' }], expect: { contains: ['Оксфорд цамц', 'Маалинган цамц', 'Материал'] } },
  { id: 'cx-list-then-variant', category: 'context', turns: [{ text: 'ymar hoodie bga ve' }, { text: 'har L bga yu' }], expect: { contains: ['Хар / L'] } },
  { id: 'cx-other-colour', category: 'context', turns: [{ text: 'Хөвөн спорт өмд' }, { text: 'Энэ өмдний өөр өнгө бий юу?' }], expect: { contains: ['Түүхий цагаан', 'Цайвар саарал'] } },
  { id: 'cx-follow-price', category: 'context', turns: [{ text: 'Ноосон пальто хэд вэ?' }, { text: 'XL нь хэд вэ?' }], expect: { contains: ['479,000₮'] } },
  { id: 'cx-follow-variant', category: 'context', turns: [{ text: 'Оверсайз hoodie хэд вэ?' }, { text: 'хар L байгаа юу?' }], expect: { contains: ['Хар / L'] } },
  { id: 'cx-follow-sizes', category: 'context', turns: [{ text: 'Оксфорд цамц' }, { text: 'хэмжээ ямар байдаг вэ?' }], expect: { contains: ['S, M, L, XL, XXL'] } },
  { id: 'cx-follow-material', category: 'context', turns: [{ text: 'Маалинган цамц' }, { text: 'материал нь юу вэ?' }], expect: { contains: ['Материал:'] } },
  { id: 'cx-follow-advice', category: 'context', turns: [{ text: 'Оверсайз hoodie' }, { text: 'аль размер авах вэ?' }], expect: { contains: ['Цээж (см)'] } },
  { id: 'cx-page-switch', category: 'context', turns: [{ text: 'Хэд вэ?', page: 'oxford-shirt' }, { text: 'Хэд вэ?', page: 'linen-camp-shirt' }], expect: { contains: ['Маалинган цамц', '159,000₮'], not: ['Оксфорд'] } },
  { id: 'cx-thanks-after', category: 'context', turns: [{ text: 'Оксфорд цамц байгаа юу?' }, { text: 'баярлалаа' }], expect: { intent: 'thanks' } },

  // ── Hand-over ──
  one('ho-request', 'handover', 'Ажилтантай холбогдмоор байна', { handoff: 'customer_request', contains: ['ажилтанд шилжүүллээ'] }),
  one('ho-latin', 'handover', 'hun bn uu', { handoff: 'customer_request' }),
  one('ho-operator', 'handover', 'Оператортой ярья', { handoff: 'customer_request' }),
  one('ho-payment', 'handover', 'Би мөнгөө шилжүүлсэн', { handoff: 'payment_claim', contains: ['баталгаажуулах боломжгүй'] }),
  one('ho-complaint', 'handover', 'Захиалсан цамц маань урагдсан ирсэн', { handoff: 'complaint' }),
  one('ho-frustrated', 'handover', 'chi buruu hariulj bn', { handoff: 'customer_request' }),
  one('ho-change-order', 'handover', 'Захиалгаа цуцалмаар байна', { event: 'policy:change_order', contains: ['ажилтан'] }),
  { id: 'ho-contact', category: 'handover', turns: [{ text: 'Ажилтантай холбогдмоор байна' }, { text: 'Бат 9911 2233' }], expect: { contains: ['ажилтанд дамжууллаа'], intent: 'contact_capture' } },

  // ── Ordering ──
  one('or-offer', 'ordering', 'Хар hoodie L авъя', { contains: ['Оверсайз hoodie — Хар / L', '219,000₮'], event: 'offer' }),
  one('or-quantity', 'ordering', 'Оксфорд цамц M 2 ширхэг авъя', { contains: ['2 ширхэг × 139,000₮ = **278,000₮**'] }),
  one('or-sold-out', 'ordering', 'Хар hoodie S авъя', { contains: ['дууссан'], not: ['Сагсанд нэмэх ·'] }),
  one('or-ask-variant', 'ordering', 'hoodie avya', { match: /ямар (?:өнгөөр|размер)/ }),
  one('or-cart', 'ordering', 'Оверсайз hoodie хар L сагсанд нэм', { contains: ['Сагсанд нэмлээ'], event: 'added_to_cart' }),
  one('or-status-needs-phone', 'ordering', 'MN-09001 захиалга хаана явна', { contains: ['утасны дугаараа'] }),
  one('or-pickup-not-buy', 'ordering', 'Очиж авч болох уу?', { notIntent: 'purchase' }),
]
