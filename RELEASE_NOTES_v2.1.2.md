# SSP Wallet v2.1.2

_Release date: 2 September 2026_

A hotfix for v2.1.1, released together with SSP Key v2.1.1. Update both to
restore Ethereum enterprise vault signing.

## Fixed

- **Syncing enterprise nonces no longer empties the pool.** Force sync used
  to purge every nonce on the relay before refilling, so a refill that
  failed left nothing to sign with, and the wallet-side wipe also discarded
  nonces still reserved by pending proposals, which made those proposals
  permanently unsignable. Sync now reconciles the relay against the nonces
  the wallet actually holds and only tops up what is missing, and the Sync
  Nonces dialog reports a wallet-side failure instead of showing success
  off the SSP Key acknowledgement alone.
- **Vault proposal signatures are registered even if this tab closes.** The
  signing request now carries the organisation, vault and proposal
  references, so the relay can attach the signature to the proposal
  directly when the enterprise app page that asked for it is no longer
  around to receive the response.

## Changed

- Store listing copy refreshed.
