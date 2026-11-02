// Mongolian text bridge for the chat engine, ported from the Lorentz commerce
// chatbot (src/chatbot/textNorm.ts at 69e4110) without its cosmetics vocabulary.
// Customers type Cyrillic, Latin letters ("une hed ve"), glued words
// ("unehedve"), slang ("bga yu", "bn uu") and typos. normText() maps all of
// that to one Cyrillic spelling, so every intent pattern and the product
// matcher see the same words. Shop vocabulary (garments, colours) is passed in
// by the business adapter as extra aliases; nothing here knows the catalogue.

export type Alias = [RegExp, string]

/**
 * Latin spellings of everyday Mongolian words, mapped to the Cyrillic word the
 * intent patterns use. Multi-word and glued forms come first, so "hedve" becomes
 * "хэд вэ" before "hed" is touched.
 */
const GENERIC_ALIASES: Alias[] = [
  // Before "bn uu", which would otherwise turn the greeting into "байгаа юу".
  [/\b(?:(?:sain|sn)\s*(?:baina|bn|bna)\s*uu|sn\s*bnuu|sain\s*uu|sainuu)\b/gi, 'сайн байна уу'],
  [/\b(?:une\s*hed\s*(?:ve|we)|unehedve|unehedwe)\b/gi, 'үнэ хэд вэ'],
  [/\b(?:hed\s*(?:ve|we)|hedve|hedwe|hedvee|hedwee)\b/gi, 'хэд вэ'],
  [/\b(?:bga\s*yu|bgaa\s*yu|bgaayu|baigaayu|bn\s*uu|bnuu|bnu|bainuu|baina\s*uu|baigaa\s*yu|bga\s*uu|bgaa\s*uu)\b/gi, 'байгаа юу'],
  [/\b(?:bolh\s*uu|bolhuu|bolohuu|boloh\s*uu|bolno\s*uu|bolnuu)\b/gi, 'болох уу'],
  [/\b(?:bii\s*(?:yu|yuu|uu)|biiyu|bij\s*yu)\b/gi, 'бий юу'],
  [/\b(?:boloh|bolh)\b/gi, 'болох'],
  [/\b(?:bolohgui|bolhgui)\b/gi, 'болохгүй'],
  [/\b(?:yamar|ymar|ymr|yamr)\b/gi, 'ямар'],
  [/\b(?:ali|alin|aliniig|alinih)\b/gi, 'аль'],
  [/\b(?:zardag|zardg|zarna|zardaguu)\b/gi, 'зардаг'],
  [/\b(?:honog|honogiin|hongiin|honogt|hnog|honogin)\b/gi, 'хоног'],
  [/\b(?:dotor|dotr)\b/gi, 'дотор'],
  [/\b(?:ireh|irh|irhe|irne|irnee|irehve|irev|irhve)\b/gi, 'ирэх'],
  [/\b(?:irsen|irsn|irchihsen)\b/gi, 'ирсэн'],
  [/\b(?:evdersen|evdersn|evderchihsen|evdertei|uragdsan|uragdsn)\b/gi, 'эвдэрсэн'],
  [/\b(?:baraa|baraag|baraanii)\b/gi, 'бараа'],
  [/\b(?:heregtei|hergtei|heregtai|hergtai)\b/gi, 'хэрэгтэй'],
  [/\b(?:deer)\b/gi, 'дээр'],
  [/\b(?:yvuulah|yavuulah|yvuulj|yavuulj|yvuulna|yavuulna|yvuul|yavuul|ilgeeh|ilgeej|ilgeene|ilgeedeg)\b/gi, 'явуулах'],
  [/\b(?:ruu|luu|ruugaa)\b/gi, 'руу'],
  [/\b(?:negiig)\b/gi, 'нэгийг'],
  [/\b(?:neg)\b/gi, 'нэг'],
  [/\b(?:hoyor|hoer|hoyr)\b/gi, 'хоёр'],
  [/\b(?:gurav|gurvan)\b/gi, 'гурав'],
  [/\b(?:iig|ig)\b/gi, 'ийг'],
  [/\b(?:oper[ae]tor|operatortoi|operatortai)\b/gi, 'оператор'],
  [/\b(?:manager|menejer|menejertei)\b/gi, 'менежер'],
  [/\b(?:hariulah|hariulaach|hariulna|hariulj|hariul|hariult)\b/gi, 'хариулах'],
  [/\b(?:buruu|buru)\b/gi, 'буруу'],
  [/\b(?:shiljuulchihlee|shiljuullee|shiljuulsn|shiljuulchihsn|shiljuulchihle|tulchihlee|tullee)\b/gi, 'төлсөн'],
  [/\b(?:mungu|mongo|mungiig|mungoo|mungun)\b/gi, 'мөнгө'],
  [/\b(?:chatbot|chat\s*bot|bot)\b/gi, 'чатбот'],
  [/\b(?:vne|une|unee|unei|unii|uniin|unetei|unitei)\b/gi, 'үнэ'],
  [/\b(?:myanga|mynga|myangan|myangiin|mynggan)\b/gi, 'мянга'],
  [/\b(?:hed|hedi|hediin)\b/gi, 'хэд'],
  [/\b(?:heden|hedn|hedenn)\b/gi, 'хэдэн'],
  [/\b(?:ve|we|vee|wee)\b/gi, 'вэ'],
  [/\b(?:be)\b/gi, 'бэ'],
  [/\b(?:yu|yuu)\b/gi, 'юу'],
  [/\b(?:uu)\b/gi, 'уу'],
  [/\b(?:medeelel|medelel|medeelal)\b/gi, 'мэдээлэл'],
  [/\b(?:avay|avya|awy|awya|away|aviy|aviya|avii|avi|avia|awii|avmaar|avmar|avna|avy|avlaa|awlaa)\b/gi, 'авъя'],
  [/\b(?:avah|avahgsn|avch)\b/gi, 'авах'],
  [/\b(?:hudaldaj|hudaldan|hudaldaa)\b/gi, 'худалдаж'],
  [/\b(?:zahialya|zahialiya|zahialia|zahialna|zahialmaar|zahialmar|zahialy|zahialii)\b/gi, 'захиалъя'],
  [/\b(?:zahialj|zahial|zahialah|zahialh|zahialaad)\b/gi, 'захиалах'],
  [/\b(?:zahialga|zahialgaa|zahialgiin|zahialgyn|zahialgaar|zahialg)\b/gi, 'захиалга'],
  [/\b(?:zahialsan|zahialsn)\b/gi, 'захиалсан'],
  [/\b(?:bgaa|baigaa|bga|baina|bn|bna|bainaa)\b/gi, 'байгаа'],
  [/\b(?:baihgui|bhgui|baihgv|bhq)\b/gi, 'байхгүй'],
  [/\b(?:belen)\b/gi, 'бэлэн'],
  [/\b(?:duussan|duusan|duusn|duuschihsan)\b/gi, 'дууссан'],
  [/\b(?:uldsen|uldsn|uldegdel|uldegdeltei)\b/gi, 'үлдсэн'],
  [/\b(?:ungu|ongotei|ungutei|ongo|ongu|ungo|unge|ungiin|ungunuud)\b/gi, 'өнгө'],
  [/\b(?:hemjee|hemjeetei|hemje|hemjeenii)\b/gi, 'хэмжээ'],
  [/\b(?:yaj|yaaj|yj|herhen|yajan)\b/gi, 'яаж'],
  [/\b(?:buteegdehuun|buteegdehuunii|buteegdhun|buteegdhuni|buteegdehuuniig|buteegdehuunuud|buteegdhuun|buteegdehvvn)\b/gi, 'бүтээгдэхүүн'],
  [/\b(?:hurgelt|hurgeltiin|hurgeltei|hurgeh|hurgej|hurgene|hurgedeg|hurguuleh|hurgeld|hurgelte)\b/gi, 'хүргэлт'],
  [/\b(?:ugye|ugie|ugii|ugy|ugiy|ogye)\b/gi, 'өгье'],
  [/\b(?:ugh|ugnu|uguh|ugooch|ugne|ogooch|ugch|ugj)\b/gi, 'өгөх'],
  [/\b(?:odoo|odo|odoogoor|odoohon)\b/gi, 'одоо'],
  [/\b(?:tulbur|tulbor|tolbor|tulburiig|tulbvr|tolboriig)\b/gi, 'төлбөр'],
  [/\b(?:tulsun|tulsen|tulchihsen|shiljuulsen|shiljuulchihsen)\b/gi, 'төлсөн'],
  [/\b(?:tuluh|tulh|tolh|toloh|tulne|tulj)\b/gi, 'төлөх'],
  [/\b(?:dans|dansnii|dansni|dansaar|dansan|dansiin)\b/gi, 'данс'],
  [/\b(?:hezee)\b/gi, 'хэзээ'],
  [/\b(?:nairlaga|nairlag|nairlagiig|nairlagaa|orts)\b/gi, 'найрлага'],
  [/\b(?:udaa)\b/gi, 'удаа'],
  [/\b(?:udur|odor|udurt|udriin|odort|udriig)\b/gi, 'өдөр'],
  [/\b(?:hugatsaa|hugatsaand)\b/gi, 'хугацаа'],
  [/\b(?:butsaah|butsaaj|butsaalt|butsaana|butsaalttai|butsaa)\b/gi, 'буцаах'],
  [/\b(?:soliuh|solih|soliulah|solij|solilts|soliulj|soliuluh)\b/gi, 'солих'],
  [/\b(?:kart|kartaar|card)\b/gi, 'карт'],
  [/\b(?:huntei|hvntei|humuustei)\b/gi, 'хүнтэй'],
  [/\b(?:hunii|humuus|hun)\b/gi, 'хүн'],
  [/\b(?:ajiltan|ajiltantai|ajilchin|ajiltand)\b/gi, 'ажилтан'],
  [/\b(?:yarih|yarii|yarimaar|yarya|yariya)\b/gi, 'ярих'],
  [/\b(?:holboo|holbogdoh|holbogdmoor|holbogdoj|holbogdoyo|holbood|holbogdy|holbogdoi)\b/gi, 'холбогдох'],
  [/\b(?:hyamdral|hyamdarh|hyamdrah|hyamdraltai)\b/gi, 'хямдрал'],
  [/\b(?:hyamd|hyamdhan)\b/gi, 'хямд'],
  [/\b(?:hamgiin|hamgin)\b/gi, 'хамгийн'],
  [/\b(?:gomdol|gomdoltoi)\b/gi, 'гомдол'],
  [/\b(?:gemtel|gemteltei)\b/gi, 'гэмтэлтэй'],
  [/\b(?:utas|utasnii|utasni|utsaa|utasaa|utsnii)\b/gi, 'утас'],
  [/\b(?:tanai|tnai|tanaid)\b/gi, 'танай'],
  [/\b(?:manai)\b/gi, 'манай'],
  [/\b(?:shirheg|shirhg|shirhegiig|sh)\b/gi, 'ширхэг'],
  [/\b(?:ugui|ugvi|ugyi)\b/gi, 'үгүй'],
  [/\b(?:bish)\b/gi, 'биш'],
  [/\b(?:tiim|tim|tiimee|tiimeee)\b/gi, 'тийм'],
  [/\b(?:za|zaa)\b/gi, 'за'],
  [/\b(?:ni)\b/gi, 'нь'],
  [/\b(?:bolno|bolnoo)\b/gi, 'болно'],
  [/\b(?:bolih|bolino|bolilaa|boliy)\b/gi, 'болих'],
  [/\b(?:end|ende)\b/gi, 'энд'],
  [/\b(?:chataar|chatar)\b/gi, 'чатаар'],
  [/\b(?:ner|neree|nerees)\b/gi, 'нэр'],
  [/\b(?:hayag|hayagaa|hayg)\b/gi, 'хаяг'],
  [/\b(?:duureg|dvvreg|duuregt)\b/gi, 'дүүрэг'],
  [/\b(?:horoo|horoond|horoog)\b/gi, 'хороо'],
  [/\b(?:ene|eniig|enenii|enii)\b/gi, 'энэ'],
  [/\b(?:ter|teriig|terni|tuunii)\b/gi, 'тэр'],
  [/\b(?:uur|ondoo|uurtei|oor)\b/gi, 'өөр'],
  [/\b(?:bii|bij)\b/gi, 'бий'],
  [/\b(?:doosh|dooshoo|dooshih)\b/gi, 'доош'],
  [/\b(?:deesh|deeshih)\b/gi, 'дээш'],
  [/\b(?:hurtel|hurtl)\b/gi, 'хүртэл'],
  [/\b(?:shalgah|shalgaj|shalgana|shalgaya|shalgay|shalgana)\b/gi, 'шалгах'],
  [/\b(?:yavts|yavtsiig|yavtsaa)\b/gi, 'явц'],
  [/\b(?:tuluv|tuluw|tolov|tuluviig)\b/gi, 'төлөв'],
  [/\b(?:haana|hana)\b/gi, 'хаана'],
  [/\b(?:sanal|sanaliig)\b/gi, 'санал'],
  [/\b(?:bolgooch|bolgoh|bolgono)\b/gi, 'болгох'],
  [/\b(?:zuvluh|zuvluguu|zuvlu|zuvluuch|zovloh)\b/gi, 'зөвлөх'],
  [/\b(?:tohiroh|tohirh|tohirno|tohiroo|taarah|taarna|taaruu)\b/gi, 'тохирох'],
  [/\b(?:ylgaa|yalgaa|ylgaatai|yalgaatai)\b/gi, 'ялгаа'],
  [/\b(?:sagsand|sagsaa|sags|sagsluu|sagsruu)\b/gi, 'сагсанд'],
  [/\b(?:nemeh|nemj|nemye|nemii|nemeech|nem)\b/gi, 'нэмэх'],
  [/\b(?:hiih|hiie|hiiye|hiigeech)\b/gi, 'хийх'],
  [/\b(?:bayrlalaa|bayrlaa|bayrla|bayarlalaa|bairlalaa)\b/gi, 'баярлалаа'],
]

/** Words a customer types glued together ("unehedve", "odobga"). */
function splitGluedLatin(text: string): string {
  return text
    .replace(/\b(une|vne)(hed|bga|bgaa|baina|bn|avya|avay|zahialya)\b/gi, '$1 $2')
    .replace(/\b(hed)(ve|we)\b/gi, '$1 $2')
    .replace(/\b(bga|bgaa|baina|bn|bna)(uu|yu)\b/gi, '$1 $2')
    .replace(/\b(odoo|odo)(bga|bgaa|baina|belen)\b/gi, '$1 $2')
    .replace(/\b(hudaldaj)(avya|away|avii|avay)\b/gi, '$1 $2')
    // "2iig avi": a quantity glued to its case ending
    .replace(/\b(\d{1,3})(iig|ig|iin|yg)\b/gi, '$1 $2')
}

/**
 * Lowercases, maps Latin spellings (the shop's own aliases first, then the
 * generic ones) to Cyrillic and strips punctuation. Digits, ₮ and size letters
 * are kept.
 */
export function normText(text: string, shopAliases: readonly Alias[] = []): string {
  let out = splitGluedLatin(text.normalize('NFKC').toLowerCase())
  for (const [pattern, replacement] of shopAliases) out = out.replace(pattern, replacement)
  for (const [pattern, replacement] of GENERIC_ALIASES) out = out.replace(pattern, replacement)
  return out
    .replace(/ё/g, 'е')
    .replace(/[+_/\\|()[\]{},.:;!?«»"'“”*#~^=<>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The customer's text and its normalized form together, for intent patterns written in Cyrillic. */
export function intentProbe(text: string, shopAliases: readonly Alias[] = []): string {
  const normalized = normText(text, shopAliases)
  return normalized === text.toLowerCase() ? text : `${text}\n${normalized}`
}

/** "latin" when the customer typed Mongolian in Latin letters, else "cyrillic" (or "other"). */
export function scriptOf(text: string): 'cyrillic' | 'latin' | 'other' {
  const cyr = (text.match(/[Ѐ-ӿ]/g) || []).length
  const lat = (text.match(/[a-z]/gi) || []).length
  if (cyr === 0 && lat === 0) return 'other'
  return cyr >= lat ? 'cyrillic' : 'latin'
}

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n',
  о: 'o', ө: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ү: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh',
  ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya',
}

/** One phonetic spelling for Cyrillic and Latin alike, for typo-tolerant word matching. */
export function phoneticLatinText(text: string, shopAliases: readonly Alias[] = []): string {
  return normText(text, shopAliases)
    .split('')
    .map((char) => CYRILLIC_TO_LATIN[char] ?? char)
    .join('')
    .replace(/ts/g, 'c')
    .replace(/ch/g, 'c')
    .replace(/sh/g, 's')
    .replace(/yo/g, 'o')
    .replace(/yu/g, 'u')
    .replace(/ya/g, 'a')
    .replace(/kh/g, 'h')
    .replace(/ee+/g, 'e')
    .replace(/oo+/g, 'o')
    .replace(/uu+/g, 'u')
    .replace(/ii+/g, 'i')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isOneEditApart(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false
  let i = 0
  let j = 0
  let edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1
      j += 1
      continue
    }
    edits += 1
    if (edits > 1) return false
    if (a.length > b.length) i += 1
    else if (b.length > a.length) j += 1
    else {
      i += 1
      j += 1
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1
}

/**
 * True when the longer token is the shorter one plus a Mongolian case suffix
 * ("цамцны" vs "цамц"). Case endings add letters rather than substitute them,
 * so this is not a typo; the minimum length guards short words.
 */
export function isCaseSuffixedForm(a: string, b: string): boolean {
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a]
  return shorter.length >= 4 && longer.length > shorter.length && longer.startsWith(shorter)
}

export function phoneticTokenMatches(queryToken: string, candidateToken: string): boolean {
  return queryToken === candidateToken || isOneEditApart(queryToken, candidateToken) || isCaseSuffixedForm(queryToken, candidateToken)
}

export function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values))
}
