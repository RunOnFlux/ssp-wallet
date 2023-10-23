SSP Wallet
Secure. Simple. Powerful.

Why another wallet?
This one is drastically different. Designed with security and self-custody first.
SSP is true two factor authentication wallet. It is 2-of-2 multisignature address.
For operation of the wallet both your SSP Wallet and SSP Key are needed. 
Transactions are constructed on your SSP Wallet and signed with your SSP Wallet private key.
After that your SSP Key receives this transaction and must sign it again with its own SSP Key private key.
Your SSP Wallet private key resides in your SSP Wallet, and your SSP Key private key resides on your SSP Key.
The keys, its extended private parts, seeds. None of that is ever shared between devices making it a true 2-of-2 wallet.
Any interaction thus requires 2 devices to operate making the security of the wallet uncompromisable.

SSP follows BIP48 derivation scheme <https://github.com/bitcoin/bips/blob/master/bip-0048.mediawiki> extended for P2SH addresses having hardened 
derivation path of m/48'/0'/0'/0'
For Flux main chain the address derivation path is thus  m/48'/19167'/0'/0'/0/0. In current scheme we only construct external and 1st address and reserving
the scheme to transition to multi address, multi account nature with change addresses in later development as well as following SLIP44 derivation paths for 
multi asset support.

Synchronisation from SSP Wallet to SSP Key is done via SSP Relay server for ease and convenience of use.
Initial synchronisation is done via SSP Key scanning Hardened Extended Public Key part of each asset in SSP Wallet. 
SSP Wallet starts listening on a derived public key on path m/48'/19167'/0'/0'/10/0 (For all chains). This path is out of any derivation scheme and is reserved by SSP for SSP Wallet Identity.
Upon SSP Key scanning QR code of SSP Wallet XPUB, SSP Key can now construct addresses as per BIP48 as both public keys needed are now on SSP Key.
SSP Key then sends request to SSP Relay server on path of previously derived public key of SSP Wallet m/48'/19167'/0'/0'/10/0.
The data that SSP Key sends to SSP Relay server consists of:
1\. Extended public key of the hardened derivation path of SSP Key eg. m/48'/19167'/0'/0'
2\. A complete 2-of-2 SSP W-K address constructed on identity path m/48'/19167'/0'/0'/10/0 following BIP48.
SSP Wallet receives the data from SSP Relay server. SSP Relay server now possesses both SSP Wallet XPUB and SSP Key XPUB. SSP Wallet verifies that SSP W-K address constructed on idenity path above
matches the one provided by SSP Key in the request from SSP Relay server. In case of a match, the request is valid and now both SSP Wallet and SSP Key have successfully synchronised their extended public keys. In case of a difference, the synchronisation is invalid. This effectively rules out any attacks on SSP Relay servers as an attacker never knows XPUB of SSP Wallet and thus can't construct addresses and forfeight SSP Key data send.
Additionally user is asked to confirm derived address match on both SSP Wallet and SSP Key.
Signing of data that goes through SSP Relay by derived public key of wallet/key is also an option for enhanced security but effectively does not enhance security of the connection and data validity and thus is not a strict requirement for SSP Relay servers operations. The adopters of the scheme may opt for mandatory data signatures.

All other consequent requests between SSP Wallet and SSP Key are fully validatated with transaction signatures and no forgery can thus happen. SSP Relay server simply relays partially signed transactions and notifications between SSP Wallet and SSP Key. 
SSP Wallet and SSP Key can fully function without SSP Relay server through QR code scanning on the Key side for transactions and synchronisations. Opposite direction synchronising from Key to Wallet is only needed on the initial syncrhonisation and can be done with a manual input on SSP Wallet.

Security of private keys, seeds.
SSP Wallet uses user defined password to encrypt seed and other sensitive data such as extended private keys and extended public keys using browser-passworder package.
The serialized text is stored as a JSON blob that includes three base64-encoded fields, data, iv, and salt, none of which you need to worry about.
A key is derived from the password using PBKDF2 with a salt sampled from crypto.getRandomValues(). The data is encrypted using the AES-GCM algorithm with an initialization vector sampled from crypto.getRandomValues(). This is the same method, package that is widely adopted through the industry and pioneered by Metamask as well. 
Additionally SSP Wallet uses Secure Local Storage to further encrypt the data with devce, browser fingerprint. This is a secondary encrpytion on the data and prevents against local storage dump, migration between devices. Only the browser and devices that encrypted, generated the data can decrypt the data. Browser migration, data migration is thus impossible to happen on SSP Wallet.
This is a yet another step up in security and SSP is thus resilient against data digging and step above any other wallet.
An attacker thus can't send your encrypted data to his computer and perform brute force on a password (unlike in metamask). The only way is real physical compromisation of the device, knolwedge of password and that is where your SSP Key comes to play. Simply put, attacker needs to have BOTH of yours PHYSICAL devices to be able to access your funds (and so do you).

SSP Wallet is designed to be a chrome extension first. To preserve sessions and convenience on lock/unlock, after inputting your password, SSP stores your password in encrypted way in Session storage of native chrome storage. The encryption is done using device, browser fingerprint making it resilient to any file dumping.
SSP Wallet NEVER stores any unencrypted form of password, seed, extended private keys nor private keys in any storage. Not even in Redux (application only session storage). Every sensitive operation is always done at the time of sensitive operation level itself and only the the function level. This is yet another huge step up in security against any other wallet that oftenly tend to store sensitive data in application level storage.

For non sensitive data such as transactions associated with an address, balance, notifications, those are stored unencrypted using localforge. Localforge is browsers local database with the speed in mind. Those data are being oftenly accessed by the application, tend to go to decent size values and thus speed is they key for convenience of SSP useage. No sensitive data is ever stored in unencrypted form and your data never leaves your device.

Everything SSP is open source. SSP Wallet, SSP Key, SSP Relay as well as any package, dependency, piece of code. Anyone can verify everything. We strive to provide a simple, secure, powerful wallet to the entire crypto community and work together to be the go to standard for blockchain self custody.

SSP Wallet is built using React 18, Typescript and requires Node 16+. Dev me out with yarn dev now!

By using SSP you agree with SSP Diclaimer <https://github.com/RunOnFlux/ssp-wallet/blob/master/DISCLAIMER.md>