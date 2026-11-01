// Chooses the payment provider. The demo store runs QPay in "mock" mode: a
// clearly labelled simulation in which no money ever moves. A real QPay
// connection needs QPAY_MODE=sandbox, or QPAY_MODE=production together with
// QPAY_ALLOW_LIVE_PAYMENTS=true — a deliberate two-key switch so a demo
// deployment can never charge anyone by accident.
import { randomUUID } from 'node:crypto'
import type { OnlinePaymentProvider, PaymentMode, ProviderInvoice } from './provider'
import { QPayProvider } from './qpay'

class SimulatedQPay implements OnlinePaymentProvider {
  readonly mode = 'mock' as const
  async createInvoice(input: { reference: string; amount: number }): Promise<ProviderInvoice> {
    return {
      providerInvoiceId: `sim-${randomUUID()}`,
      // Deliberately not a QPay payload: nothing a banking app could act on.
      qrText: `DEMO-ONLY|${input.reference}|${input.amount}`,
      qrImage: null,
      deeplinks: [],
    }
  }
  async checkInvoice() {
    // A simulated invoice is never paid by the provider; only the labelled demo button marks it.
    return { paid: false, paidAmount: 0 }
  }
  async cancelInvoice() {}
}

export function qpayMode(): PaymentMode {
  const mode = process.env.QPAY_MODE
  if (mode === 'sandbox') return 'sandbox'
  if (mode === 'production') {
    if (process.env.QPAY_ALLOW_LIVE_PAYMENTS === 'true') return 'production'
    console.warn('[qpay] QPAY_MODE=production ignored: QPAY_ALLOW_LIVE_PAYMENTS is not "true". Using the simulation.')
  }
  return 'mock'
}

let cached: OnlinePaymentProvider | null = null

/** The configured provider. Credentials are only ever read on the server. */
export function getQPay(): OnlinePaymentProvider {
  if (cached) return cached
  const mode = qpayMode()
  if (mode === 'mock') {
    cached = new SimulatedQPay()
    return cached
  }
  const clientId = process.env.QPAY_CLIENT_ID || process.env.QPAY_USERNAME
  const clientSecret = process.env.QPAY_CLIENT_SECRET || process.env.QPAY_PASSWORD
  const invoiceCode = process.env.QPAY_INVOICE_CODE
  if (!clientId || !clientSecret || !invoiceCode) {
    throw new Error('QPay credentials (QPAY_USERNAME, QPAY_PASSWORD, QPAY_INVOICE_CODE) are required outside mock mode')
  }
  // A live base URL must never be used in sandbox mode (that would reach real money).
  const baseUrl = process.env.QPAY_BASE_URL || undefined
  const safeBase = mode === 'sandbox' && baseUrl && !baseUrl.includes('sandbox') ? undefined : baseUrl
  cached = new QPayProvider(mode, { clientId, clientSecret, invoiceCode }, safeBase)
  return cached
}

/** Tests can swap in a provider. */
export function setQPayForTests(provider: OnlinePaymentProvider | null) {
  cached = provider
}
