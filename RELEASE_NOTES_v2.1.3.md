# SSP Wallet v2.1.3

_Release date: 25 September 2026_

A hotfix for v2.1.2.

## Fixed

- **Transaction history no longer crashes on a bad explorer response.** When
  the EVM explorer answered with an error message instead of a transaction
  list (for example when rate limited), the wallet read each character of
  that message as a transaction, and the history screen failed with
  "Not a number: -undefined". Such responses are now ignored, transfers
  without a value count as zero, and one malformed row can no longer take
  the whole history down.
- **Swap shows the correct token balance.** The swap screen only used token
  balances cached by the home screen, so a token that had not been cached
  yet (for example Flux on BNB Smart Chain received from another wallet)
  showed a zero balance and could not be swapped. The balance is now
  fetched directly when it is not cached.
