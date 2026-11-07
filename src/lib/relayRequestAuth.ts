/**
 * RA-2 (relay authentication, client side): every POST the wallet sends to
 * the relay's write endpoints — /v1/action, /v1/nonces, /v1/nonces/reconcile,
 * /v1/sol/setup — must carry WK identity auth. The relay no longer accepts
 * unauthenticated "legacy client" writes, so a request whose auth could not be
 * produced is never sent: it would only leak its payload and be refused.
 *
 * The signature itself comes from the existing createWkIdentityAuth helper
 * (useRelayAuth); this module only makes it mandatory.
 */
import type { AuthFields } from './relayAuth';

/**
 * Shape of useRelayAuth().createWkIdentityAuth as used for write requests.
 * The body is hashed into the signed payload, so it must be passed WITHOUT
 * auth fields and must not change afterwards.
 */
export type WkAuthCreator = (
  action: 'action',
  wkIdentity: string,
  requestBody?: Record<string, unknown>,
) => Promise<AuthFields | null>;

export class RelayAuthUnavailableError extends Error {
  constructor(message = 'Relay authentication unavailable') {
    super(message);
    this.name = 'RelayAuthUnavailableError';
  }
}

/**
 * Sign `body` for `wkIdentity` and return it with the auth fields attached.
 * Throws RelayAuthUnavailableError instead of ever returning an unsigned body.
 */
export async function attachRequiredWkAuth<T extends Record<string, unknown>>(
  body: T,
  wkIdentity: string,
  createAuth: WkAuthCreator,
): Promise<T & AuthFields> {
  if (!wkIdentity) {
    throw new RelayAuthUnavailableError(
      'Relay authentication unavailable: wallet is not synced with SSP Key',
    );
  }
  let auth: AuthFields | null = null;
  try {
    auth = await createAuth('action', wkIdentity, body);
  } catch (error) {
    console.warn('[relayRequestAuth] auth creation failed', error);
    auth = null;
  }
  if (!auth || !auth.signature || !auth.message || !auth.publicKey) {
    throw new RelayAuthUnavailableError();
  }
  return { ...body, ...auth };
}
