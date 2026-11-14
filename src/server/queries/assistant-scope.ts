// Which chats an admin may see and act on. The public demo sees the sample
// chats and the ones its own browser started — never another visitor's.
// Test chats ("try the chatbot") are only ever their owner's.
import { and, eq, ne, or, sql, type SQL } from 'drizzle-orm'
import type { Actor } from '@/server/context'
import * as t from '@/server/db/schema'

export function conversationScope(actor: Actor): SQL | undefined {
  if (actor.role !== 'demo') return ne(t.chatConversations.channel, 'test')
  return or(
    eq(t.chatConversations.channel, 'sample'),
    actor.visitorKey ? and(eq(t.chatConversations.channel, 'website'), eq(t.chatConversations.visitorId, actor.visitorKey)) : sql`false`,
  )
}

/** Staff act on storefront and Messenger/Instagram chats; the demo only on its own website chats; sample chats are read-only. */
export function canActOn(actor: Actor, c: { channel: string; visitorId: string | null }): boolean {
  if (c.channel === 'messenger' || c.channel === 'instagram') return actor.role !== 'demo'
  if (c.channel !== 'website') return false
  return actor.role !== 'demo' || (!!actor.visitorKey && c.visitorId === actor.visitorKey)
}
