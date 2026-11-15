// Shapes shared by the assistant engine, its API and the chat widget (isomorphic).

/** A button under an assistant message. Links are always internal paths. */
export type ChatAction =
  | { type: 'add_to_cart'; variantId: string; quantity: number; label: string }
  | { type: 'link'; href: string; label: string }

/** A product card under an assistant message (a snapshot of the reply's facts). */
export interface ChatCard {
  name: string
  slug: string
  url: string
  price: number
  maxPrice: number
  availability: string
  image: string | null
  imageAlt: string
}

export interface PublicChatMessage {
  id: string
  role: 'customer' | 'assistant' | 'staff'
  text: string
  createdAt: string
  cards?: ChatCard[]
  actions?: ChatAction[]
  suggestions?: string[]
  mode?: 'ai' | 'rules'
}

export interface ChatView {
  conversationId: string
  /** A person took over: the assistant stays silent. */
  paused: boolean
  /** Waiting for or talking to a person (the widget then checks for staff replies). */
  humanActive: boolean
  enabled: boolean
  messages: PublicChatMessage[]
  /** The cart changed in this turn (the widget refreshes the header count). */
  cartChanged?: boolean
}
