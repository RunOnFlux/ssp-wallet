# SSP Wallet v2.2.3

_Release date: 19 November 2026_

A feature and fix release for v2.2.2. Update SSP Key to v2.2.4 as well, so that SSP Key shows Zcash TEX addresses the way you entered them.

## New

- **Send ZEC to TEX addresses.** Zcash TEX addresses (`tex1…`, ZIP 320) are now accepted as recipients. Binance gives them out for ZEC deposits, and THORChain uses one for ZEC swaps. A TEX address only accepts funds from transparent addresses, and SSP Wallet only ever sends from transparent addresses.
- **SSP Key shows the TEX address you entered.** With SSP Key v2.2.4, the approval screen shows the `tex1…` address, after checking on the phone that it matches the transaction. If it doesn't match, SSP Key refuses the request. Block explorers and older SSP Key versions show the same address in its transparent form (`t1…`), which the review screen also lists.
- **Enterprise vaults** can pay TEX addresses too, and the vault signing screens show them the same way.

## Fixed

- **Very large Flux sends no longer fail at broadcast.** The network refuses transactions with more than 1999 SSP inputs. SSP Wallet now stays within that limit. When a send would need more inputs, it suggests sending a smaller amount to yourself first to combine them.
- **Flux transactions stay valid for an hour again.** Since Flux moved to 30-second blocks, a transaction expired about 13 minutes after it was built.

## Improved

- **Buy:** the Onramper page now opens from a link that the SSP relay builds and signs, ready for Onramper's new signed links.
- Updated translations.
