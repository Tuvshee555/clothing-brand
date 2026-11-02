'use server'

import type { ChatView } from '@/lib/assistant/types'
import {
  deleteFaq,
  releaseConversation,
  resetTestChats,
  saveAssistantSettings,
  saveConversationNotes,
  saveFaq,
  sendTestMessage,
  staffReply,
  takeOverConversation,
} from '@/server/services/assistant-admin'
import { runAdminAction, type ActionResult } from './run'

// ---- Conversations (take over, reply, hand back) ----------------------------

export async function takeOverAction(conversationId: string) {
  return runAdminAction('assistant.reply', (ctx) => takeOverConversation(ctx, { conversationId }))
}

export async function releaseAction(conversationId: string) {
  return runAdminAction('assistant.reply', (ctx) => releaseConversation(ctx, { conversationId }))
}

export async function staffReplyAction(raw: { conversationId: string; text: string; clientMessageId: string }) {
  return runAdminAction('assistant.reply', (ctx) => staffReply(ctx, raw))
}

export async function saveNotesAction(raw: { conversationId: string; notes: string }) {
  return runAdminAction('assistant.reply', (ctx) => saveConversationNotes(ctx, raw))
}

// ---- Knowledge and settings (owner / manager) ---------------------------------

export async function saveFaqAction(raw: unknown) {
  return runAdminAction('assistant.manage', (ctx) => saveFaq(ctx, raw))
}

export async function deleteFaqAction(id: string) {
  return runAdminAction('assistant.manage', (ctx) => deleteFaq(ctx, { id }))
}

export async function saveAssistantSettingsAction(raw: unknown) {
  return runAdminAction('assistant.manage', (ctx) => saveAssistantSettings(ctx, raw))
}

// ---- Try the chatbot ------------------------------------------------------------

export async function sendTestMessageAction(raw: { conversationId: string | null; clientMessageId: string; text: string }): Promise<ActionResult<ChatView>> {
  const res = await runAdminAction('assistant.view', (ctx) => sendTestMessage(ctx, raw), { refreshRouter: false })
  return res.ok ? { ok: true, data: res.data.view } : res
}

export async function resetTestChatAction() {
  return runAdminAction('assistant.view', (ctx) => resetTestChats(ctx))
}
