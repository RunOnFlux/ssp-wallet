# SSP Wallet v2.1.1

_Release date: 21 August 2026_

A hotfix for v2.1.0.

## Fixed

- **Signing a vault payment proposal no longer crashes the wallet.** Opening
  any enterprise transaction proposal for signature could send the extension
  to the error screen before the approval dialog appeared. The Flux node
  start dialogs were reading a proposal's recipients as if they were node
  delegate keys; they now stay out of the way until a node start is actually
  requested.
