/**
 * Payment provider interface.
 *
 * The club pays through Weeztix, but nothing above this file knows that. Two reasons:
 *
 * 1. No Weeztix credentials or API documentation exist yet, so the adapter cannot be
 *    written. Everything else — the five statuses, the return handling, the webhook, the
 *    idempotency — is real, testable and finished behind this interface.
 * 2. A club changes payment provider roughly once a decade, and when it does, the cost
 *    should be one adapter rather than a rewrite of the registration flow.
 *
 * The model is hosted checkout: the user is redirected to the provider, pays there, and
 * comes back. The **webhook is authoritative**, never the return URL — a user who closes
 * the tab after paying must still end up marked as paid, and a user who edits the return
 * URL must not.
 */

export type BetaalStatus = 'unpaid' | 'pending' | 'paid' | 'failed' | 'refunded';

/** Dutch labels, so every surface says the same thing. */
export const BETAALSTATUS_LABEL: Record<BetaalStatus, string> = {
  unpaid: 'Nog niet betaald',
  pending: 'Betaling in behandeling',
  paid: 'Betaald',
  failed: 'Betaling mislukt',
  refunded: 'Terugbetaald',
};

export interface CheckoutRequest {
  /** Our own registration id; comes back on the webhook. */
  reference: string;
  amountCents: number;
  description: string;
  /** Where the provider sends the user afterwards. */
  returnUrl: string;
  aanmelderEmail?: string | null;
  aanmelderNaam?: string | null;
}

export interface CheckoutSession {
  /** The provider's identifier. Stored so a webhook can find the registration. */
  providerReference: string;
  /** Where to send the user to pay. */
  checkoutUrl: string;
}

export interface PaymentProvider {
  readonly name: string;
  /** Starts a hosted checkout. */
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;
  /** Current status, used when the user returns and on reconciliation. */
  getStatus(providerReference: string): Promise<BetaalStatus>;
  /**
   * Verifies a webhook came from the provider and extracts what it says.
   *
   * Returning null means "not authentic" and the caller must ignore it. An unverified
   * webhook is an open endpoint for marking any registration paid.
   */
  parseWebhook(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
  ): { providerReference: string; status: BetaalStatus } | null;
}

/**
 * Test provider, used until Weeztix credentials exist.
 *
 * Deliberately not a silent auto-approve. It exposes success, failure and pending so the
 * flow can be exercised in every direction — a payment path only ever tested on the
 * happy route is a payment path that has not been tested.
 */
export class TestPaymentProvider implements PaymentProvider {
  readonly name = 'test';

  private readonly sessions = new Map<string, BetaalStatus>();

  private readonly publicUrl: string;

  // Written out rather than a constructor parameter property. That shorthand is a
  // TypeScript transform, and Node's strip-only mode emits nothing for it — the same
  // limitation that ruled out NestJS in ADR-0007.
  constructor(publicUrl: string) {
    this.publicUrl = publicUrl;
  }

  async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    const providerReference = `test_${req.reference}`;
    this.sessions.set(providerReference, 'pending');

    // A local page standing in for the provider's hosted checkout, with a button per
    // outcome. Same shape as the real thing: leave the app, come back with a status.
    const url = new URL('/v1/betaling/test-checkout', this.publicUrl);
    url.searchParams.set('ref', providerReference);
    url.searchParams.set('amount', String(req.amountCents));
    url.searchParams.set('description', req.description);
    url.searchParams.set('return_url', req.returnUrl);

    return { providerReference, checkoutUrl: url.toString() };
  }

  async getStatus(providerReference: string): Promise<BetaalStatus> {
    return this.sessions.get(providerReference) ?? 'unpaid';
  }

  /** Test-only: drives a session to an outcome, standing in for the provider. */
  setStatus(providerReference: string, status: BetaalStatus): void {
    this.sessions.set(providerReference, status);
  }

  parseWebhook(rawBody: string): { providerReference: string; status: BetaalStatus } | null {
    try {
      const body = JSON.parse(rawBody) as { reference?: string; status?: string };
      if (!body.reference || !body.status) return null;
      if (!['unpaid', 'pending', 'paid', 'failed', 'refunded'].includes(body.status)) return null;
      return {
        providerReference: body.reference,
        status: body.status as BetaalStatus,
      };
    } catch {
      return null;
    }
  }
}

/**
 * Weeztix adapter — not implemented.
 *
 * Left as an explicit, failing stub rather than a half-guessed implementation. Guessing
 * an endpoint shape here would produce code that looks finished, passes review, and
 * fails the first time real money is involved.
 *
 * To finish it, three things are needed: API documentation, a test-account key, and
 * confirmation of whether the Inleggeld is a generic payment or a ticket per partuur.
 * Everything else in the flow is already built and does not change.
 */
export class WeeztixPaymentProvider implements PaymentProvider {
  readonly name = 'weeztix';

  private readonly apiKey: string;
  private readonly publicUrl: string;

  constructor(apiKey: string, publicUrl: string) {
    this.apiKey = apiKey;
    this.publicUrl = publicUrl;
  }

  private notImplemented(): never {
    throw new Error(
      'De Weeztix-koppeling is nog niet ingesteld. ' +
        'Er zijn API-documentatie en een sleutel nodig voordat betalingen live kunnen.',
    );
  }

  async createCheckout(): Promise<CheckoutSession> {
    this.notImplemented();
  }

  async getStatus(): Promise<BetaalStatus> {
    this.notImplemented();
  }

  parseWebhook(): { providerReference: string; status: BetaalStatus } | null {
    // Returns null rather than throwing: an unverifiable webhook must be ignored, and
    // this adapter can verify nothing yet.
    return null;
  }
}

export function createPaymentProvider(
  kind: string,
  opts: { apiKey?: string; publicUrl: string },
): PaymentProvider {
  if (kind === 'weeztix') {
    if (!opts.apiKey) {
      throw new Error('WEEZTIX_API_KEY ontbreekt terwijl PAYMENT_PROVIDER=weeztix.');
    }
    return new WeeztixPaymentProvider(opts.apiKey, opts.publicUrl);
  }
  return new TestPaymentProvider(opts.publicUrl);
}
