/**
 * Validation for requests arriving from the injected provider via
 * background.js.
 *
 * INVARIANT: every key that background.js's stampVerifiedOrigin() adds to
 * params must be accepted here. The loop below rejects any value that is not a
 * string unless its key has an explicit branch, so a non-string field added to
 * the stamper without a matching branch rejects every request. sanitizeRequest
 * lives in lib/ rather than inside the provider component so that contract is
 * testable — see sanitizeRequest.spec.ts, which runs the real stamper and
 * asserts its output is accepted.
 */

export interface dataBgParams {
  address: string;
  message: string;
  amount: string;
  chain: string;
  contract: string;
  authMode?: number;
  // Requester identity.
  //
  // `verifiedOrigin`, `topOrigin` and `isSubframe` are stamped by
  // public/scripts/background.js from the runtime `sender` and cannot be set by
  // the requesting page. `origin` is overwritten there too, but treat it as
  // untrusted here and read `verifiedOrigin` — the stamping is the only thing
  // that makes it authoritative, and a future caller might bypass it.
  origin?: string;
  verifiedOrigin?: string | null;
  topOrigin?: string | null;
  isSubframe?: boolean;
  // Page-supplied and unverifiable. Presentation only — never use for trust.
  siteName?: string; // friendly name
  description?: string; // what the auth is for
  iconUrl?: string; // site icon (HTTPS only)
  // Enterprise vault xpub params
  orgIndex?: number; // enterprise org index (positive integer)
  vaultName?: string; // enterprise vault name
  orgName?: string; // enterprise org name
  // Enterprise vault sign tx params
  vaultIndex?: number; // enterprise vault index (non-negative integer)
  recipients?: string; // JSON string of recipients array
  fee?: string; // transaction fee
  memo?: string; // transaction memo
  rawUnsignedTx?: string; // raw unsigned transaction hex
  inputDetails?: string; // JSON string of input details array
  reservedNonce?: { kPublic: string; kTwoPublic: string }; // EVM wallet nonce for signing
  reservedKeyNonce?: { kPublic: string; kTwoPublic: string }; // EVM key nonce for Key signing
  keyXpub?: string; // Key's vault xpub for EVM Schnorr signing
  allSignerKeys?: string; // JSON string of all 2M public keys hex
  allSignerNonces?: string; // JSON string of all 2M nonces
  // ERC-20 token metadata (EVM only)
  tokenContract?: string;
  tokenSymbol?: string;
  tokenDecimals?: number;
  // Source vault address for display on Key
  sourceAddress?: string;
  // Full EVM UserOp struct (JSON string) for trustless decode
  evmUserOp?: string;
  // Vault signing mode (dual, key_only, wallet_only)
  signingMode?: string;
  // Server-computed advisory transaction simulation (JSON string)
  simulation?: string;
  // Enterprise proposal references (Mongo ObjectId hex) — echoed through the
  // relay action payloads for server-side signature registration
  orgId?: string;
  vaultId?: string;
  proposalId?: string;
  // WalletConnect Phase 2 — vault message signing (personal_sign)
  digest?: string; // 0x 32-byte EIP-191 message digest to sign
  dappOrigin?: string; // requesting dApp name/url
  // Enterprise Flux Node Start params
  addressIndex?: number;
  collateralTxid?: string;
  collateralVout?: number;
  collateralAmount?: string;
  collateralAddress?: string;
  identityPubKey?: string;
  redeemScript?: string;
  signingDevice?: string;
  nodeName?: string;
  delegates?: string[];
}

export interface dataBgRequest {
  method: string;
  params: dataBgParams;
}

export interface bgRequest {
  origin: string;
  data: dataBgRequest;
}

export function sanitizeRequest(request: bgRequest): bgRequest | null {
  // sanitize request
  // must be an object of only data and origin, origin must be a string of max 50 characters
  // data must be an object of only method and params
  // params must be an object of only keys containing strings of max 50k characters
  // method must be a string of max 50 characters
  // return sanitized request
  const sanitizedRequest = {
    origin: request.origin,
    data: request.data,
  };
  console.log('sanitizedRequest');
  console.log(sanitizedRequest);
  if (
    typeof sanitizedRequest.origin !== 'string' ||
    sanitizedRequest.origin.length > 50
  ) {
    console.log('Invalid origin type');
    return null;
  }
  if (typeof sanitizedRequest.data !== 'object') {
    console.log('Invalid data type');
    return null;
  }
  if (
    typeof sanitizedRequest.data.method !== 'string' ||
    sanitizedRequest.data.method.length > 50
  ) {
    console.log('Invalid method type');
    return null;
  }
  if (
    sanitizedRequest.data.params &&
    typeof sanitizedRequest.data.params !== 'object'
  ) {
    console.log('Invalid params type');
    return null;
  }
  if (sanitizedRequest.data.params) {
    for (const key in sanitizedRequest.data.params) {
      const paramValue =
        sanitizedRequest.data.params[key as keyof dataBgParams];
      // Skip undefined/null values
      if (paramValue === undefined || paramValue === null) {
        continue;
      }
      // authMode, orgIndex, and vaultIndex are numbers, other params are strings
      if (key === 'authMode') {
        if (
          typeof paramValue !== 'number' ||
          (paramValue !== 1 && paramValue !== 2)
        ) {
          console.log('Invalid authMode value:', paramValue);
          return null;
        }
      } else if (key === 'orgIndex') {
        if (
          typeof paramValue !== 'number' ||
          !Number.isInteger(paramValue) ||
          paramValue < 100 ||
          paramValue > 99999
        ) {
          console.log('Invalid orgIndex value:', paramValue);
          return null;
        }
      } else if (key === 'vaultIndex') {
        if (
          typeof paramValue !== 'number' ||
          !Number.isInteger(paramValue) ||
          paramValue < 0 ||
          paramValue > 99
        ) {
          console.log('Invalid vaultIndex value:', paramValue);
          return null;
        }
      } else if (key === 'reservedNonce' || key === 'reservedKeyNonce') {
        // EVM enterprise nonce objects — validate structure
        if (
          typeof paramValue !== 'object' ||
          typeof (paramValue as Record<string, unknown>).kPublic !== 'string' ||
          typeof (paramValue as Record<string, unknown>).kTwoPublic !== 'string'
        ) {
          console.log('Invalid ' + key + ' value');
          return null;
        }
      } else if (key === 'tokenDecimals') {
        // ERC-20 token decimals — non-negative integer
        if (
          typeof paramValue !== 'number' ||
          !Number.isInteger(paramValue) ||
          paramValue < 0
        ) {
          console.log('Invalid tokenDecimals value:', paramValue);
          return null;
        }
      } else if (key === 'addressIndex' || key === 'collateralVout') {
        // Enterprise flux node start — non-negative integer
        if (
          typeof paramValue !== 'number' ||
          !Number.isInteger(paramValue) ||
          paramValue < 0
        ) {
          console.log('Invalid ' + key + ' value:', paramValue);
          return null;
        }
      } else if (key === 'isSubframe') {
        // Stamped by background.js from the runtime `sender` — the ONLY
        // non-string field it injects. Without this branch the string
        // catch-all below rejected it and therefore rejected every single
        // request that came through the content script.
        if (typeof paramValue !== 'boolean') {
          console.log('Invalid isSubframe value:', paramValue);
          return null;
        }
      } else if (key === 'delegates') {
        // Enterprise flux node start — array of pubkey hex strings
        if (!Array.isArray(paramValue)) {
          console.log('Invalid delegates value (not array)');
          return null;
        }
        for (const d of paramValue) {
          if (typeof d !== 'string' || d.length > 200) {
            console.log('Invalid delegate entry');
            return null;
          }
        }
      } else {
        if (typeof paramValue !== 'string') {
          console.log('Invalid param type ' + key);
          return null;
        }
        if (paramValue.length > 50000) {
          console.log('Invalid param length ' + key);
          return null;
        }
      }
    }
  }
  return sanitizedRequest;
}
