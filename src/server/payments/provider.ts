// Payment provider abstraction. QPay is the online provider; cash on delivery
// is recorded by staff and needs no adapter.

export interface CreateInvoiceInput {
  /** Our unique reference (QPay sender_invoice_no). */
  reference: string
  amount: number
  description: string
  receiverCode: string
  callbackUrl: string
}

export interface ProviderInvoice {
  providerInvoiceId: string
  qrText: string | null
  qrImage: string | null
  deeplinks: { name: string; link: string }[]
}

export interface ProviderCheck {
  paid: boolean
  paidAmount: number
}

export type PaymentMode = 'mock' | 'sandbox' | 'production'

export interface OnlinePaymentProvider {
  readonly mode: PaymentMode
  createInvoice(input: CreateInvoiceInput): Promise<ProviderInvoice>
  checkInvoice(providerInvoiceId: string): Promise<ProviderCheck>
  cancelInvoice(providerInvoiceId: string): Promise<void>
}

export class PaymentProviderError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'PaymentProviderError'
  }
}
