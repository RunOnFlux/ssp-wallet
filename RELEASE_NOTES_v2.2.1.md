# SSP Wallet v2.2.1

_Release date: 3 November 2026_

A fix for v2.2.0, released together with SSP Key v2.2.1.

## Fixed

- **The verification code appears after every sync.** SSP Wallet now shows
  the 6 words and the QR code after a single-chain sync too, not only after
  a first pairing or a multi-chain sync, and SSP Key v2.2.1 shows the same
  code. In v2.2.0, a single-chain sync that replaced an existing pairing
  showed the words on SSP Key while SSP Wallet showed nothing. With an older
  SSP Key, SSP Wallet still shows the code and asks you to update SSP Key.
