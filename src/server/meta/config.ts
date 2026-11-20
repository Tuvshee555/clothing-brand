// Meta (Messenger, Instagram) configuration. Every value is server-only: no
// token or secret ever has a NEXT_PUBLIC_ name, reaches the browser or a log.
//
// Two ways in:
// - hub (preferred): the MANAN Page is connected at the Ursgal Digital hub
//   (www.ursgaldigital.com/holboh). The hub is the Meta webhook; it forwards
//   MANAN's events here signed with this route's own secret and hands out the
//   Page token on request. This deployment holds neither the Meta app secret
//   nor a Page token. Needs URSGAL_HUB_URL, URSGAL_HUB_ROUTE_ID,
//   URSGAL_HUB_SECRET and META_PAGE_ID.
// - direct: Meta calls this deployment itself (META_APP_SECRET,
//   META_VERIFY_TOKEN, META_PAGE_ID, META_PAGE_ACCESS_TOKEN).
// The webhook stays closed (503) until one of them is complete. Sending is a
// second, separate switch.
import 'server-only'

export type MetaAccess =
  | {
      mode: 'hub'
      /** https://www.ursgaldigital.com */
      hubUrl: string
      /** This project's route at the hub (16 hex characters). */
      routeId: string
      /** The route's secret: verifies forwarded deliveries and signs token requests. */
      routeSecret: string
    }
  | {
      mode: 'direct'
      /** Meta App → Settings → Basic → App secret. Signs every webhook delivery. */
      appSecret: string
      /** A random string you also type into the App Dashboard's webhook form. */
      verifyToken: string
      /** A Page access token for that Page (pages_messaging; instagram_manage_messages for Instagram). */
      pageToken: string
    }

export interface MetaConfig {
  access: MetaAccess
  /** The one Facebook Page this deployment answers for. */
  pageId: string
  /** The Instagram professional account linked to the Page, if Instagram is used. */
  instagramId: string | null
  /** Graph API version, e.g. v25.0. */
  graphVersion: string
  /** Replies are actually sent only when this is true; otherwise they are recorded as suppressed. */
  outbound: boolean
  /** Private replies to comments that match a trigger word (one per comment). */
  commentReplies: boolean
  /** Trigger words for comment replies. */
  commentKeywords: string[]
}

const DIGITS = /^\d{5,40}$/
const VERSION = /^v\d{1,3}\.\d$/
const ROUTE_ID = /^[0-9a-f]{16}$/

/** Default comment triggers: price, availability, order and "write to me" in Cyrillic and Latin Mongolian. */
export const DEFAULT_COMMENT_KEYWORDS = [
  'үнэ', 'une', 'хэд', 'hed', 'хэдээр', 'hedeer', 'захиал', 'zahial', 'zakhial', 'байгаа юу', 'baigaa yu', 'bga yu',
  'үлдэгдэл', 'uldegdel', 'хэмжээ', 'hemjee', 'size', 'price', 'dm', 'inbox', 'инбокс', 'чат', 'chat', 'мэдээлэл', 'medeelel',
]

function value(name: string): string {
  return (process.env[name] ?? '').trim()
}

/** The hub connection, or null while it is not (completely) set. */
function hubAccess(): Extract<MetaAccess, { mode: 'hub' }> | null {
  const hubUrl = value('URSGAL_HUB_URL')
  const routeId = value('URSGAL_HUB_ROUTE_ID')
  const routeSecret = value('URSGAL_HUB_SECRET')
  if (!hubUrl || !ROUTE_ID.test(routeId) || routeSecret.length < 32) return null
  try {
    const url = new URL(hubUrl)
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') return null
    return { mode: 'hub', hubUrl: url.origin, routeId, routeSecret }
  } catch {
    return null
  }
}

/** The configuration, or null while any required value is missing or malformed. */
export function metaConfig(): MetaConfig | null {
  const pageId = value('META_PAGE_ID')
  const instagramId = value('META_INSTAGRAM_ACCOUNT_ID')
  const graphVersion = value('META_GRAPH_API_VERSION') || 'v25.0'
  if (!DIGITS.test(pageId) || (instagramId && !DIGITS.test(instagramId)) || !VERSION.test(graphVersion)) return null

  let access: MetaAccess | null = hubAccess()
  if (!access) {
    const appSecret = value('META_APP_SECRET')
    const verifyToken = value('META_VERIFY_TOKEN')
    const pageToken = value('META_PAGE_ACCESS_TOKEN')
    if (!appSecret || verifyToken.length < 16 || !pageToken) return null
    access = { mode: 'direct', appSecret, verifyToken, pageToken }
  }
  const keywords = value('META_COMMENT_KEYWORDS')
  return {
    access,
    pageId,
    instagramId: instagramId || null,
    graphVersion,
    outbound: value('META_OUTBOUND_ENABLED') === 'true',
    commentReplies: value('META_COMMENT_REPLIES_ENABLED') === 'true',
    commentKeywords: keywords ? keywords.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean) : DEFAULT_COMMENT_KEYWORDS,
  }
}

/** Which required variables are missing, by name only (for the admin's setup page and logs). */
export function missingMetaVariables(): string[] {
  const missing: string[] = []
  if (!DIGITS.test(value('META_PAGE_ID'))) missing.push('META_PAGE_ID')
  const hubStarted = ['URSGAL_HUB_URL', 'URSGAL_HUB_ROUTE_ID', 'URSGAL_HUB_SECRET'].some((name) => value(name))
  if (hubStarted) {
    if (!hubAccess()) {
      if (!value('URSGAL_HUB_URL')) missing.push('URSGAL_HUB_URL')
      if (!ROUTE_ID.test(value('URSGAL_HUB_ROUTE_ID'))) missing.push('URSGAL_HUB_ROUTE_ID')
      if (value('URSGAL_HUB_SECRET').length < 32) missing.push('URSGAL_HUB_SECRET')
    }
    return missing
  }
  if (!value('META_APP_SECRET')) missing.push('META_APP_SECRET')
  if (value('META_VERIFY_TOKEN').length < 16) missing.push('META_VERIFY_TOKEN')
  if (!value('META_PAGE_ACCESS_TOKEN')) missing.push('META_PAGE_ACCESS_TOKEN')
  return missing
}
