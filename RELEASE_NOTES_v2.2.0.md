# SSP Wallet v2.2.0

_Release date: to be set (security release, October 2026)_

A security release that follows the October 2026 security review. Release it
together with the matching SSP Key security release. The SSP relay and SSP
Enterprise have to be deployed before it reaches users.

## Behaviour changes you will notice

- **One dApp request at a time.** While a `window.ssp` request is open in SSP
  Wallet, a second request from any site is answered with `BUSY` (code 4001)
  instead of replacing the one on screen. If a request is never answered,
  the slot frees itself when the requesting tab closes, or after at most
  15 minutes. Sites have to wait for the open request to finish, then retry.
- **`eth_sign` and `eth_signTypedData` are refused.** These methods sign data
  the wallet cannot show you in a readable form. They are also no longer
  offered over WalletConnect, so a dApp that _requires_ them can no longer
  connect. `personal_sign` and transactions work as before.
- **Enterprise methods only work from SSP Enterprise.** `enterprise_*`
  requests are accepted only from `https://enterprise.sspwallet.com`. Testing
  against a local enterprise app needs a development build of the wallet.
- **Pairing checks SSP Key's signature on every synced chain.** The updated
  SSP Key signs each chain it syncs and SSP Wallet verifies it. The
  verification code is shown whenever SSP Key shows it (first pairing and
  multi-chain sync), with a note when SSP Key signed every chain. An older
  SSP Key keeps working as before; after a single-chain sync from it, SSP
  Wallet suggests updating SSP Key.
- **Unlocking waits for a pairing in another window.** If SSP Wallet is in
  the middle of pairing with SSP Key in another window or tab, unlocking is
  refused until that pairing is finished or cancelled there.
- **First request for an enterprise vault asks you to confirm its signers.**
  The first time SSP Enterprise asks this wallet to sign for a vault (or to
  show one of its addresses), SSP Wallet shows the vault's chain, signing
  mode, threshold and every signer, and asks you to confirm them against SSP
  Enterprise. The vault is remembered once you sign (or once you confirm an
  address check). Cancelling refuses the request and remembers nothing.
- **Changed vaults are refused.** A request whose signers differ from what
  you confirmed is refused with "The configuration of this vault changed".
  This also applies to a vault that reappears under a new id with the same
  derivation slot (organisation, chain, organisation index and vault index).
  If you expect the change, reset the vault in Settings › Advanced ›
  Confirmed vaults, then confirm it again.
- **An outdated SSP Enterprise is refused.** Enterprise signing requests
  without the vault's signer set fail with "Update required: vault
  descriptor missing".

## Security fixes

- Vault signing, message signing and Flux node starts re-derive every input
  script, change output, EVM account and Solana multisig from the confirmed
  signers, and refuse anything that does not derive from them. EVM signing
  also refuses a signer list that contains a key outside the vault or leaves
  out this wallet's own key.
- Pairing verifies SSP Key's signature over each synced chain. A sync answer
  that arrives after its pairing session finished or was cancelled is
  dropped instead of being stored.
- Contract calls are never shown as plain sends. Calls to the vault account
  itself and contract-upgrade calls are refused. Unknown tokens are shown in
  raw base units with an "unverified token" warning.
- Solana: transactions that cannot be decoded are blocked, split approvals
  are checked against the proposal on chain (this needs the wallet's Solana
  RPC), and the legacy SPL Transfer instruction is refused.
- Sign-message dialogs show the verified requesting site. Enterprise login and
  critical-action signatures are bound to the site that asked for them.
- Enterprise signing nonces are never reused, even with several wallet
  windows open. The nonce store moves to a new location the first time you
  sign for an enterprise vault; if that fails, use Sync Nonces in SSP
  Enterprise.
- Every request to the relay is signed. A request that cannot be signed is
  not sent.
- Wallets created in 2023–2024 are re-encrypted with the current, stronger
  password hashing after unlock. This runs in the background, is verified,
  and is coordinated across open wallet windows.

## Improvements

- **Retrying an enterprise EVM signature works.** If sending a signature to
  SSP Key failed (for example because the connection dropped), approving the
  same proposal again re-sends the same signature instead of failing with
  "nonce already used".
- **Recovering after a browser change is safer.** After SSP Key approves a
  recovery, SSP Wallet first saves what it needs to unlock with your password
  alone, then re-encrypts your wallet with new keys while it shows "Securing
  your wallet". If the window closes during that step, the wallet still
  unlocks with your password.
