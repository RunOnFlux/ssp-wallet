/**
 * Recovery Protocol — wallet ↔ ssp-key handshake over relay.
 *
 * Triggered by Login.tsx when the fingerprint-gated decrypt of `randomParams`
 * fails (L5 path). The protocol returns `sk_r` — the recovery private key —
 * which the caller then uses together with the stored envelope to recover
 * the plaintext `randomParams`.
 *
 * Authentication: no explicit ECDSA signature is needed on the response.
 * The AES-GCM tag on the transit ciphertext already proves authenticity —
 * only ssp-key's identity privkey can produce a payload that decrypts
 * successfully against the wallet's fresh ephemeral key + stored ssp-key
 * identity pubkey. User biometric approval on ssp-key is the authorization
 * anchor for the request itself.
 */

import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import { Buffer } from 'buffer';

import {
  generateEphemeralKeypair,
  generateRecoveryNonce,
  unwrapSkRFromTransit,
} from './recoveryCrypto';

const DEFAULT_TIMEOUT_MS = 120_000;
// Action names are all-lowercase to match SSP convention — relay re-emits
// them verbatim as socket event names (see ssp-relay actionApi.ts).
const ACTION_REQUEST = 'recoveryrequest';
const SOCKET_EVENT_RESPONSE = 'recoveryresponse';
const SOCKET_EVENT_DENIED = 'recoverydenied';

export class RecoveryError extends Error {
  constructor(
    public readonly code:
      | 'timeout'
      | 'denied'
      | 'malformed_response'
      | 'nonce_mismatch'
      | 'decrypt_failed'
      | 'post_failed',
    message: string,
  ) {
    super(message);
    this.name = 'RecoveryError';
  }
}

interface RecoveryResponsePayload {
  transit: string; // hex of wrapped sk_r
  nonce: string; // hex, must echo request
  timestamp: number; // echoes request
}

interface RelaySocketResponse {
  payload: string; // JSON-stringified body
  action?: string;
  wkIdentity: string;
  chain?: string;
  path?: string;
}

/**
 * Run one recovery round-trip. Opens a short-lived socket, posts the
 * request, waits for either a matching response or a denial, and
 * returns the unwrapped `sk_r`. Always cleans up the socket on exit.
 *
 * @throws {RecoveryError} on timeout, denial, malformed response,
 *   nonce mismatch, transit decrypt failure, or HTTP POST failure.
 */
export async function requestRecovery(params: {
  wkIdentity: string;
  /** hex, 33-byte compressed — ssp-key identity pubkey stored in envelope */
  keyIdentityPubKeyHex: string;
  relay: string;
  /** identity chain (e.g. 'btc') — required by relay's POST /v1/action validator */
  chain: string;
  timeoutMs?: number;
}): Promise<Buffer> {
  const {
    wkIdentity,
    keyIdentityPubKeyHex,
    relay,
    chain,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = params;

  const eph = generateEphemeralKeypair();
  const nonce = generateRecoveryNonce();
  const timestamp = Date.now();
  const keyIdentityPub = Buffer.from(keyIdentityPubKeyHex, 'hex');

  const socket: Socket = io(`https://${relay}`, {
    path: '/v1/socket/wallet',
    timeout: 10_000,
  });
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  try {
    const skR = await new Promise<Buffer>((resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(
          new RecoveryError(
            'timeout',
            `recovery request timed out after ${timeoutMs}ms`,
          ),
        );
      }, timeoutMs);

      socket.on('connect', () => {
        // Unauthenticated join — we cannot sign wkIdentity auth because
        // we don't have a decrypted xpriv until after recovery succeeds.
        // User biometric approval on ssp-key is the authorization anchor.
        socket.emit('join', { wkIdentity });

        axios
          .post(`https://${relay}/v1/action`, {
            action: ACTION_REQUEST,
            chain,
            path: '',
            wkIdentity,
            payload: JSON.stringify({
              pkEph: eph.pub.toString('hex'),
              nonce: nonce.toString('hex'),
              timestamp,
            }),
          })
          .catch((err: unknown) => {
            reject(
              new RecoveryError(
                'post_failed',
                `failed to post recovery request: ${String(err)}`,
              ),
            );
          });
      });

      socket.on(SOCKET_EVENT_RESPONSE, (msg: RelaySocketResponse) => {
        if (msg.wkIdentity !== wkIdentity) return;

        let body: RecoveryResponsePayload;
        try {
          body = JSON.parse(msg.payload) as RecoveryResponsePayload;
        } catch {
          reject(
            new RecoveryError(
              'malformed_response',
              'recovery response payload was not valid JSON',
            ),
          );
          return;
        }

        if (
          typeof body.transit !== 'string' ||
          typeof body.nonce !== 'string' ||
          typeof body.timestamp !== 'number'
        ) {
          reject(
            new RecoveryError(
              'malformed_response',
              'recovery response has missing or wrong-typed fields',
            ),
          );
          return;
        }

        // Nonce-match is defense-in-depth; the AES-GCM tag binds the
        // ciphertext to this session's ephemeral key already, but
        // bailing early on a mismatched nonce avoids burning the
        // decrypt attempt on an unrelated stray response.
        if (body.nonce !== nonce.toString('hex')) {
          reject(
            new RecoveryError(
              'nonce_mismatch',
              'recovery response nonce did not match request',
            ),
          );
          return;
        }

        try {
          const unwrapped = unwrapSkRFromTransit(
            eph.priv,
            keyIdentityPub,
            body.transit,
          );
          resolve(unwrapped);
        } catch (err) {
          reject(
            new RecoveryError(
              'decrypt_failed',
              `failed to unwrap sk_r: ${String(err)}`,
            ),
          );
        }
      });

      socket.on(SOCKET_EVENT_DENIED, (msg: RelaySocketResponse) => {
        if (msg.wkIdentity !== wkIdentity) return;
        reject(new RecoveryError('denied', 'user denied recovery on ssp-key'));
      });
    });

    return skR;
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    socket.removeAllListeners();
    socket.disconnect();
    eph.priv.fill(0);
  }
}
