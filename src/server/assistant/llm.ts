// AI mode: OpenAI tool calling over the database tools. The model decides which
// tool to call; every product fact it may state comes back from a tool. After
// the answer is written, a fact check rejects any money amount or stock count
// that did not appear in this turn's tool results.
import { amountsIn, stockCountsIn } from '@/lib/fact-check'
import { POLICY_SLUGS } from '@/lib/settings'
import { STARTER_SUGGESTIONS, type AssistantReply } from './engine'
import {
  cardsFor,
  checkStock,
  compareProducts,
  getPolicy,
  listCategories,
  productDetail,
  productFacts,
  searchProducts,
  type SearchArgs,
  type ToolContext,
} from './tools'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface LlmUsage {
  model: string
  inputTokens: number
  outputTokens: number
  toolCalls: number
}

/** USD per 1M tokens (input, output). Unknown models use a conservative rate. */
const PRICES: Record<string, [number, number]> = {
  'gpt-4.1-mini': [0.4, 1.6],
  'gpt-4.1-nano': [0.1, 0.4],
  'gpt-4o-mini': [0.15, 0.6],
  'gpt-4.1': [2, 8],
  'gpt-4o': [2.5, 10],
}

export function costMicroUsd(usage: LlmUsage): number {
  const [inRate, outRate] = PRICES[usage.model] ?? [2.5, 10]
  return Math.ceil(usage.inputTokens * inRate + usage.outputTokens * outRate)
}

export function assistantModel(): string {
  return process.env.OPENAI_MODEL_ASSISTANT || 'gpt-4.1-mini'
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_products',
      description:
        'Search the live catalogue. Use for any question about which products exist, prices, colours, sizes, price limits, cheapest/most expensive, categories or seasons.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Product words in Mongolian or English, e.g. "hoodie", "ноолуур", "жинс". Omit for pure filters.' },
          category: { type: 'string', description: 'Category slug from list_categories.' },
          color: { type: 'string', description: 'Colour family: black, grey, white, beige, brown, blue, green, red (or Mongolian name).' },
          size: { type: 'string', description: 'Size such as S, M, L, XL, 30, ONE SIZE.' },
          max_price: { type: 'integer', description: 'Upper price limit in MNT.' },
          min_price: { type: 'integer', description: 'Lower price limit in MNT.' },
          in_stock_only: { type: 'boolean' },
          audience: { type: 'string', enum: ['women', 'men'] },
          tag: { type: 'string', enum: ['winter', 'autumn', 'summer', 'layering', 'oversized', 'essential', 'cashmere', 'wool', 'cotton', 'linen', 'denim', 'leather', 'office'] },
          sort: { type: 'string', enum: ['price_asc', 'price_desc', 'featured', 'newest'] },
          limit: { type: 'integer', minimum: 1, maximum: 12 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_product',
      description: 'Full details of one product (description, material, care, fit, colours, sizes, which sizes are in stock).',
      parameters: { type: 'object', properties: { product: { type: 'string', description: 'Slug or name.' } }, required: ['product'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_stock',
      description: 'Exact live stock for a product, optionally for one colour and/or size. Use before saying a size/colour is available.',
      parameters: {
        type: 'object',
        properties: { product: { type: 'string' }, color: { type: 'string' }, size: { type: 'string' } },
        required: ['product'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compare_products',
      description: 'Side-by-side facts for 2–4 products.',
      parameters: { type: 'object', properties: { products: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4 } }, required: ['products'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_policy',
      description: 'Store policy text and delivery options. Topics: delivery, returns, exchange, ordering (incl. changing an order), payment, privacy, contact.',
      parameters: {
        type: 'object',
        properties: { topic: { type: 'string', enum: ['delivery', 'returns', 'exchange', 'ordering', 'payment', 'privacy', 'contact'] } },
        required: ['topic'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: { name: 'list_categories', description: 'Categories with product counts and price ranges.', parameters: { type: 'object', properties: {}, additionalProperties: false } },
  },
]

function systemPrompt(tc: ToolContext, pageSlug: string | null): string {
  const page = pageSlug ? tc.catalog.find((p) => p.slug === pageSlug) : null
  return [
    `You are the shopping assistant of ${tc.info.storeName}, a fictional premium fashion label. This online store is a portfolio demonstration by Ursgal Digital: products and prices are sample data and no real purchase or payment happens.`,
    'Reply in natural, warm, concise Mongolian Cyrillic (even if the customer writes Mongolian in Latin letters). If the customer writes in English, reply in English.',
    'FACTS RULE: Every product name, price, colour, size, stock level, material, delivery fee or delivery time you mention must come from a tool result in this conversation. Call a tool before answering any product, stock, price or policy question. Never guess, round or invent numbers. If the tools do not contain the answer, say you do not have that information and suggest asking staff.',
    'Before saying a colour or size is available, call check_stock. Quote stock counts exactly as returned.',
    'Link products as markdown links to their url, e.g. [Name](/products/slug). Keep answers short: 1–4 sentences or a short bullet list (max 6 items).',
    'Never place an order or claim you did. To buy, the customer opens the product page, picks colour and size, adds to cart and checks out. Do not promise discounts, gifts or delivery dates beyond the delivery policy.',
    'Only discuss this store, its products, sizing, delivery, returns, exchanges, payment and ordering. Politely decline anything else.',
    page ? `The customer is currently viewing the product "${page.name}" (slug: ${page.slug}). Questions like "is L available?" refer to it.` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } }
type ApiMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

interface TurnTrace {
  slugs: string[]
  stockCounts: Set<number>
  amounts: Set<number>
}

/** Image fields are for the chat cards, not the model. */
function withoutImage<T extends { image: string | null; imageAlt: string }>(facts: T): Omit<T, "image" | "imageAlt"> {
  const copy: Partial<T> = { ...facts }
  delete copy.image
  delete copy.imageAlt
  return copy as Omit<T, "image" | "imageAlt">
}

async function runTool(tc: ToolContext, name: string, rawArgs: string, trace: TurnTrace): Promise<unknown> {
  let args: Record<string, unknown> = {}
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {}
  } catch {
    return { error: 'invalid arguments' }
  }
  switch (name) {
    case 'search_products': {
      const list = searchProducts(tc, args as SearchArgs)
      for (const p of list) {
        trace.slugs.push(p.slug)
        trace.amounts.add(p.minPrice)
        trace.amounts.add(p.maxPrice)
      }
      return { count: list.length, products: list.map((p) => withoutImage(productFacts(p))) }
    }
    case 'get_product': {
      const result = await productDetail(tc, String(args.product ?? ''))
      if ('product' in result && result.product) {
        trace.slugs.push(result.product.slug)
        trace.amounts.add(result.product.price)
        trace.amounts.add(result.product.maxPrice)
        const rest = withoutImage(result.product)
        return { found: 1, product: rest }
      }
      return result
    }
    case 'check_stock': {
      const result = checkStock(tc, { product: String(args.product ?? ''), color: (args.color as string) ?? null, size: (args.size as string) ?? null })
      if ('variants' in result && result.variants) {
        trace.slugs.push(result.product.slug)
        for (const v of result.variants) {
          trace.stockCounts.add(v.stock)
          trace.amounts.add(v.price)
        }
      }
      return result
    }
    case 'compare_products': {
      const result = await compareProducts(tc, Array.isArray(args.products) ? (args.products as string[]) : [])
      for (const p of result.products) {
        trace.slugs.push(p.slug)
        trace.amounts.add(p.price)
        trace.amounts.add(p.maxPrice)
      }
      return { products: result.products.map(withoutImage) }
    }
    case 'get_policy': {
      const result = getPolicy(tc, String(args.topic ?? ''))
      if ('shippingMethods' in result && result.shippingMethods) {
        for (const m of result.shippingMethods) {
          trace.amounts.add(m.fee)
          if (m.freeFrom) trace.amounts.add(m.freeFrom)
        }
      }
      return { ...result, page: 'topic' in result && result.topic in POLICY_SLUGS ? `/help/${POLICY_SLUGS[result.topic as keyof typeof POLICY_SLUGS]}` : undefined }
    }
    case 'list_categories': {
      const cats = listCategories(tc)
      for (const c of cats) {
        if (c.priceFrom) trace.amounts.add(c.priceFrom)
        if (c.priceTo) trace.amounts.add(c.priceTo)
      }
      return { categories: cats }
    }
    default:
      return { error: `unknown tool ${name}` }
  }
}

/** Problems with a draft reply (empty = passes). */
export function factCheck(reply: string, trace: TurnTrace, tc: ToolContext, userAmounts: number[]): string[] {
  const problems: string[] = []
  // Only amounts this turn's tools returned (or the customer typed) — not any catalogue price,
  // so the model cannot attach one product's price to another.
  const allowed = new Set([...trace.amounts, ...userAmounts])
  for (const amount of amountsIn(reply)) {
    if (!allowed.has(amount)) problems.push(`amount ${amount} is not in the tool results`)
  }
  for (const count of stockCountsIn(reply)) {
    if (!trace.stockCounts.has(count)) problems.push(`stock count ${count} was not returned by check_stock`)
  }
  for (const m of reply.matchAll(/\/products\/([a-z0-9-]+)/g)) {
    if (!tc.catalog.some((p) => p.slug === m[1])) problems.push(`link /products/${m[1]} does not exist`)
  }
  return problems
}

async function chat(messages: ApiMessage[], signal: AbortSignal) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: assistantModel(), messages, tools: TOOLS, tool_choice: 'auto', temperature: 0.2, max_completion_tokens: 700 }),
    signal,
  })
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return (await res.json()) as {
    choices: { message: { content: string | null; tool_calls?: ToolCall[] } }[]
    usage?: { prompt_tokens: number; completion_tokens: number }
  }
}

export async function answerWithLlm(
  tc: ToolContext,
  history: ChatMessage[],
  opts: { pageSlug: string | null; userAmounts: number[] },
): Promise<{ reply: AssistantReply | null; usage: LlmUsage; problems: string[] }> {
  const usage: LlmUsage = { model: assistantModel(), inputTokens: 0, outputTokens: 0, toolCalls: 0 }
  const trace: TurnTrace = { slugs: [], stockCounts: new Set(), amounts: new Set() }
  const messages: ApiMessage[] = [{ role: 'system', content: systemPrompt(tc, opts.pageSlug) }, ...history.map((m) => ({ role: m.role, content: m.content }) as ApiMessage)]
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25_000)
  let problems: string[] = []
  try {
    for (let round = 0, retried = false; round < 6; round++) {
      const data = await chat(messages, controller.signal)
      usage.inputTokens += data.usage?.prompt_tokens ?? 0
      usage.outputTokens += data.usage?.completion_tokens ?? 0
      const msg = data.choices[0]?.message
      if (!msg) break
      if (msg.tool_calls?.length) {
        messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: msg.tool_calls })
        for (const call of msg.tool_calls.slice(0, 4)) {
          usage.toolCalls++
          const result = await runTool(tc, call.function.name, call.function.arguments, trace)
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result).slice(0, 12_000) })
        }
        continue
      }
      const text = (msg.content ?? '').trim()
      problems = factCheck(text, trace, tc, opts.userAmounts)
      if (problems.length === 0 && text) {
        const linked = [...text.matchAll(/\/products\/([a-z0-9-]+)/g)].map((m) => m[1])
        return {
          reply: { reply: text, products: cardsFor(tc, linked.length ? linked : trace.slugs.slice(0, 3)), suggestions: linked.length ? [] : STARTER_SUGGESTIONS.slice(0, 2), mode: 'ai' },
          usage,
          problems,
        }
      }
      if (retried) break
      retried = true
      messages.push({ role: 'assistant', content: text })
      messages.push({
        role: 'user',
        content: `SYSTEM CHECK (not from the customer): your answer contained facts that are not in the tool results (${problems.join('; ')}). Call the tools again if needed and answer using only exact values from tool results.`,
      })
    }
    return { reply: null, usage, problems }
  } finally {
    clearTimeout(timer)
  }
}
