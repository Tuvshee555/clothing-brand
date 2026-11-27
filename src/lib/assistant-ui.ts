// Where and how the storefront's shopping assistant opens (isomorphic, no React).

/** Window event that opens the assistant panel; the phone header's chat button sends it. */
export const ASSISTANT_OPEN_EVENT = 'store:assistant-open'

/**
 * Pages where a floating chat would sit on top of the task at hand — checkout, an order
 * page, order lookup. The assistant (and its header button) stay out of the way there.
 */
export function hidesAssistant(pathname: string): boolean {
  return /^\/(checkout|track)(\/|$)/.test(pathname) || /^\/orders\/./.test(pathname)
}
