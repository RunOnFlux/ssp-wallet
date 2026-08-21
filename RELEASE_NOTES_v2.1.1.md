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
- **A website's request opens a small window again, not a full-height side
  panel.** Approvals asked for by a web page now appear in the compact
  floating window, so the page you are signing for stays readable behind it.
  Opening the wallet from the toolbar icon is unchanged and still follows
  your Popup / Window / Side Panel preference.
- **Requests reach the wallet you already have open.** A wallet window
  hidden behind the browser is brought to the front instead of answering out
  of sight, and an open side panel no longer ends up with a second wallet
  window opening beside it after the browser has idled.
