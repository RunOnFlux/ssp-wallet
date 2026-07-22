# SSP Wallet v2.0.0

The biggest release in SSP's history — a complete redesign of the wallet on the
new SSP design system, with major security-UX additions. Same keys, same
2-of-2 self-custody, zero migration: updating in place keeps your wallet,
pairing, and settings exactly as they were.

## New

- **Multi-chain batch sync** — activate any set of chains with a single
  approval on your SSP Key (previously one approval per chain).
- **Pairing verification code** — after syncing, both devices show the same
  6 words derived from your keys. If they match, no one — not even the relay —
  could have tampered with your pairing. Scan-to-verify supported.
- **Portfolio tab** — your total balance across every chain (tokens included),
  with 24h change and allocation at a glance.
- **Activity tab** and a **redesigned navigation**: wallet/chain switching in
  one identity pill up top, compact tab bar below.
- **Unified Send** — one clear 3-step flow (compose → review → approve) for
  every chain, with the full recipient address always shown at review.
- **Privacy mode** — tap your balance to blur every amount.
- **Backup health** — the wallet reminds you what's at stake until your seed
  is verified and your Key is paired.
- **2-of-2 handshake screen** — watch your two devices co-sign in real time.

## Changed

- Complete visual refresh: the new SSP brand (amber, Inter, Lucide icons,
  the pillar mark) across every screen, light and dark.
- Onboarding rebuilt: name and color your wallet, verify your seed with a
  word challenge, and pair with live progress.
- Settings became **Menu** — everything from the old menus, one place.
- The built-in tutorial now reflects the new interface.

## Security

- No changes to key derivation, signing, seed handling, or encryption —
  verified by independent audit across every commit in this release.
- All dependencies updated and exactly pinned; every fixable vulnerability
  resolved.
- Works with SSP Key v1 and v2 — update in any order.

## Compatibility

- Updating in place: nothing to re-do. Your wallet, password, pairing and
  settings carry over (covered by an automated release gate).
- Old SSP Key keeps working with this wallet; batch sync activates when both
  apps are on v2.
