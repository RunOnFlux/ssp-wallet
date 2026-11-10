# SSP Wallet v2.2.2

_Release date: 10 November 2026_

A fix release for v2.2.1. Ship it together with SSP Key v2.2.3: Zcash sends need both apps updated.

## Fixed

- **Zcash sends work again.** Since the Zcash NU7 network upgrade on 5 November 2026, the network only accepts version 5 transactions. SSP Wallet now builds and signs v5 transactions (ZIP 225 and ZIP 244). SSP Key v2.2.3 is needed to co-sign them.
- **EVM sends no longer show an old transaction as sent.** While SSP Key was still approving, SSP Wallet could find an earlier transaction to the same amount and show "Transaction Sent!" with its hash. It now only accepts a transaction that is newer than the send and goes to the same receiver.
- **Show in Explorer works after an EVM send.** The button did nothing when the transaction was found by the fallback check.
- **Firefox: data collection is declared.** SSP Wallet sends addresses, balances and transactions to its own backends and the SSP relay. The Firefox version now declares this, and Firefox asks for consent at install. It needs Firefox 140 or newer, or 142 or newer on Android.

## Improved

- **Buy and Sell are greyed out when no provider sells the coin in your country** (for example FLUX), instead of opening an empty list.
- Updated translations.
