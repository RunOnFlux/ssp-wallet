# SSP Wallet v2.3.0

_Release date: 24 November 2026_

A feature and fix release for v2.2.3. Update SSP Key to v2.3.0 as well: vault approvals are much faster there.

## New

- **Every EVM transaction is checked with the network before you sign.** After you review a send, swap or WalletConnect request, SSP Wallet asks the network whether it will go through and how much gas it needs. While it checks, you see "Checking transaction…". If the network says the transaction would fail, SSP Wallet shows the reason (for example "transfer amount exceeds balance") before anything is signed. You can still choose **Sign anyway**. If the network doesn't answer within 10 seconds, you can send as before.

## Fixed

- **Correct gas on Base and for large swaps.** Swaps and WalletConnect requests with a lot of transaction data, and transactions on Base, could be refused by the network for too little gas after both devices had signed. The gas is now taken from the network's own check.
- **The last signer of a large enterprise vault transaction can sign.** A vault transaction with many inputs and signers (for example a 3-of-4 Flux vault with more than about 40 inputs) failed for the last signer with "Request Rejected: Invalid or malformed request." Such transactions now pass.

## Improved

- Updated translations.
