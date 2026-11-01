// QPay Merchant API v2 adapter (ported from the cleaning-com platform).
//   POST   /v2/auth/token     Basic base64(client_id:client_secret)
//   POST   /v2/auth/refresh   Bearer refresh_token
//   POST   /v2/invoice        invoice_code, sender_invoice_no, invoice_receiver_code,
//                             invoice_description, amount, callback_url
//   DELETE /v2/invoice/{id}
//   POST   /v2/payment/check  { object_type: "INVOICE", object_id, offset }
// Responses are read defensively. A callback is only a hint: payment is
// confirmed exclusively by /v2/payment/check.
import { PaymentProviderError, type CreateInvoiceInput, type OnlinePaymentProvider, type ProviderCheck, type ProviderInvoice } from './provider'

type Json = Record<string, unknown>

const BASE_URLS = {
  sandbox: 'https://merchant-sandbox.qpay.mn',
  production: 'https://merchant.qpay.mn',
} as const

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : typeof v === 'number' ? String(v) : null)
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

/** QPay has returned both relative seconds and absolute epoch seconds for expires_in. */
function expiry(value: unknown, fallbackSeconds: number): number {
  const n = num(value)
  if (n === null) return Date.now() + fallbackSeconds * 1000
  return n > 1_000_000_000 ? n * 1000 : Date.now() + n * 1000
}

export class QPayProvider implements OnlinePaymentProvider {
  private token: { access: string; refresh: string | null; expiresAt: number; refreshExpiresAt: number } | null = null
  private readonly base: string

  constructor(
    readonly mode: 'sandbox' | 'production',
    private readonly creds: { clientId: string; clientSecret: string; invoiceCode: string },
    baseUrl?: string,
  ) {
    // Request paths already start with /v2, so a base URL ending in /v2 is trimmed.
    this.base = (baseUrl || BASE_URLS[mode]).replace(/\/+$/, '').replace(/\/v2$/, '')
  }

  private async request(path: string, init: { method: string; body?: unknown; auth?: string }): Promise<Json> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15_000)
    try {
      const res = await fetch(`${this.base}${path}`, {
        method: init.method,
        headers: { 'Content-Type': 'application/json', Authorization: init.auth ?? `Bearer ${await this.accessToken()}` },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: controller.signal,
      })
      const text = await res.text()
      let data: Json = {}
      try {
        data = text ? (JSON.parse(text) as Json) : {}
      } catch {
        data = { raw: text.slice(0, 200) }
      }
      if (!res.ok) throw new PaymentProviderError(`QPay: ${str(data.message) ?? str(data.error) ?? `HTTP ${res.status}`}`, res.status)
      return data
    } catch (err) {
      if (err instanceof PaymentProviderError) throw err
      throw new PaymentProviderError(err instanceof Error ? `QPay холболт: ${err.message}` : 'QPay холболтын алдаа')
    } finally {
      clearTimeout(timer)
    }
  }

  private async accessToken(): Promise<string> {
    const now = Date.now()
    if (this.token && this.token.expiresAt - 60_000 > now) return this.token.access
    if (this.token?.refresh && this.token.refreshExpiresAt - 60_000 > now) {
      try {
        this.storeToken(await this.request('/v2/auth/refresh', { method: 'POST', auth: `Bearer ${this.token.refresh}` }))
        return this.token!.access
      } catch {
        this.token = null
      }
    }
    const basic = Buffer.from(`${this.creds.clientId}:${this.creds.clientSecret}`).toString('base64')
    this.storeToken(await this.request('/v2/auth/token', { method: 'POST', auth: `Basic ${basic}` }))
    return this.token!.access
  }

  private storeToken(data: Json) {
    const access = str(data.access_token)
    if (!access) throw new PaymentProviderError('QPay: access_token ирсэнгүй')
    this.token = {
      access,
      refresh: str(data.refresh_token),
      expiresAt: expiry(data.expires_in, 3000),
      refreshExpiresAt: expiry(data.refresh_expires_in, 6000),
    }
  }

  async createInvoice(input: CreateInvoiceInput): Promise<ProviderInvoice> {
    const data = await this.request('/v2/invoice', {
      method: 'POST',
      body: {
        invoice_code: this.creds.invoiceCode,
        sender_invoice_no: input.reference,
        invoice_receiver_code: input.receiverCode,
        invoice_description: input.description.slice(0, 255),
        amount: input.amount,
        callback_url: input.callbackUrl,
      },
    })
    const providerInvoiceId = str(data.invoice_id) ?? str(data.id)
    if (!providerInvoiceId) throw new PaymentProviderError('QPay: нэхэмжлэхийн дугаар ирсэнгүй')
    const urls = Array.isArray(data.urls) ? (data.urls as Json[]) : []
    return {
      providerInvoiceId,
      qrText: str(data.qr_text),
      qrImage: str(data.qr_image),
      deeplinks: urls.map((u) => ({ name: str(u.name) ?? '', link: str(u.link) ?? '' })).filter((u) => u.link),
    }
  }

  async checkInvoice(providerInvoiceId: string): Promise<ProviderCheck> {
    const data = await this.request('/v2/payment/check', {
      method: 'POST',
      body: { object_type: 'INVOICE', object_id: providerInvoiceId, offset: { page_number: 1, page_limit: 100 } },
    })
    const rows = Array.isArray(data.rows) ? (data.rows as Json[]) : []
    const paidRows = rows.filter((r) => (str(r.payment_status) ?? '').toUpperCase() === 'PAID')
    const paidAmount = num(data.paid_amount) ?? paidRows.reduce((s, r) => s + (num(r.payment_amount) ?? 0), 0)
    return { paid: paidRows.length > 0 && paidAmount > 0, paidAmount }
  }

  async cancelInvoice(providerInvoiceId: string): Promise<void> {
    await this.request(`/v2/invoice/${encodeURIComponent(providerInvoiceId)}`, { method: 'DELETE' })
  }
}
