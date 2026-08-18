# SSP Wallet v2.1.0

_Release date: 18 August 2026_

Solana arrives on SSP mainnet. True 2-of-2 self-custody on Solana — the same
wallet + key approval flow you know, now securing SOL and SPL tokens through
SSP's own on-chain multisig program.

## New

- **Solana mainnet** — send and receive SOL with full 2-of-2 multisig
  security. Your vault is a program-derived address controlled solely by
  your wallet and key signatures; no single device can ever move funds.
- **SPL tokens** — USDC and FLUX supported at launch, with automatic
  creation of recipient token accounts when they don't exist yet.
- **No gas juggling** — network fees are fronted by SSP's paymaster and
  reimbursed in SOL directly from your vault as part of each transaction.
  Your first send includes a small one-time on-chain vault setup
  (~0.0032 SOL); every send after that costs ~0.0001 SOL.
- **Solana in Portfolio, Activity, and unified Send** — SOL and SPL tokens
  appear across the whole wallet like every other chain, explorer links
  included.

## Fixed

- Activity feed no longer breaks on explorer transactions with missing
  timestamps.
