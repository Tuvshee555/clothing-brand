// The shopping assistant (MANAN's adaptation of the Lorentz commerce chatbot).
//
//   handler.ts      persistence around a turn: ownership, lease, dedup, takeover, hand-overs, AI budget, logs
//   turn.ts         one message → one reply (pure): the layer order
//   understand.ts   what a message asks and which products it names
//   answers.ts      deterministic answers from the database (variants, prices, policies…)
//   purchase.ts     purchase intent and the confirmed chat order draft
//   chat-order.ts   chat order → the checkout's own order core, with the reservation policy
//   llm.ts          AI mode (OpenAI tool calling) behind the fact check
//   tools.ts        the database context and tools both modes read
// Generic engine pieces ported from Lorentz live in lib/chat; clothing vocabulary in lib/assistant.
export { aiConfigured, chatView, handleCustomerMessage, pollConversation, spentTodayMicroUsd, type Speaker } from './handler'
