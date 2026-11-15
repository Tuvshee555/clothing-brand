// Drives the shopping assistant the way the storefront widget does: one
// browser (visitor key), one conversation, messages through the real handler.
import { randomUUID } from 'node:crypto'
import { desc, eq } from 'drizzle-orm'
import type { ChatView, PublicChatMessage } from '@/lib/assistant/types'
import * as t from '@/server/db/schema'
import { handleCustomerMessage } from '@/server/assistant/handler'
import { ctx, visitor, type TestDb } from './helpers'

export interface Chat {
  visitorKey: string
  conversationId: string | null
  view: ChatView | null
  /** Sends a message; returns the assistant's reply (or null when no reply was published). */
  say: (text: string, opts?: { pageSlug?: string | null }) => Promise<PublicChatMessage | null>
  last: () => PublicChatMessage | null
}

export function startChat(db: TestDb, visitorKey = visitor()): Chat {
  const chat: Chat = {
    visitorKey,
    conversationId: null,
    view: null,
    async say(text, opts = {}) {
      const before = chat.view?.messages.length ?? 0
      const result = await handleCustomerMessage(
        ctx(db),
        { conversationId: chat.conversationId, clientMessageId: `m-${randomUUID()}`, text, pageSlug: opts.pageSlug ?? null },
        // A fresh IP hash per message keeps the per-IP burst limit out of the way.
        { channel: 'website', visitorKey, ipHash: `ip-${randomUUID()}` },
      )
      chat.conversationId = result.view.conversationId
      chat.view = result.view
      const fresh = result.view.messages.slice(before)
      const reply = [...fresh].reverse().find((m) => m.role === 'assistant')
      return reply ?? null
    },
    last() {
      const msgs = chat.view?.messages ?? []
      return [...msgs].reverse().find((m) => m.role === 'assistant') ?? null
    },
  }
  return chat
}

/** Stored metadata of the latest assistant message (intent, events, mode). */
export async function lastMeta(db: TestDb, conversationId: string) {
  const [row] = await db
    .select({ metadata: t.chatMessages.metadata })
    .from(t.chatMessages)
    .where(eq(t.chatMessages.conversationId, conversationId))
    .orderBy(desc(t.chatMessages.createdAt))
    .limit(1)
  return (row?.metadata ?? {}) as { intent?: string; events?: string[]; mode?: string; productIds?: string[] }
}
