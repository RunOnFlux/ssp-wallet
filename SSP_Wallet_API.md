# SSP Wallet JavaScript API

The SSP Wallet injects a `window.ssp` object into the website, enabling communication between web pages and the SSP Wallet Chrome extension.

## API Method: `window.ssp.request(method, parameters)`

This function takes two parameters:

- `method`: A string specifying the method to be called.
- `parameters`: An object containing additional parameters specific to the method.

### Response Format

All methods return a Promise that resolves to an object with the following structure:

**Success Response:**
```javascript
{
  status: 'SUCCESS',
  // ... method-specific fields
}
```

**Error Response:**
```javascript
{
  status: 'ERROR',
  result: 'Error message',  // Human-readable error
  data?: 'Additional error details'
}
```

---

### Implemented Methods

#### 1. Pay Request

- **Method:** `'pay'`
- **Description:** Requests SSP to perform payment actions (sending assets).
- **Parameters:**
  - `address` (string, required): The recipient's address.
  - `amount` (string, required): The amount to send in whole units (e.g., `'4.124'`).
  - `chain` (string, required): The chain ID identifier of SSP (e.g., `'flux'`, `'btc'`, `'eth'`).
  - `message` (string, optional): A message/memo to include in the transaction.
  - `contract` (string, optional): For EVM networks, the token contract address. Not needed for native assets like ETH.

- **Response (Success):**
  - `status`: `'SUCCESS'`
  - `txid`: Transaction ID of the successful payment.

- **Response (Error):**
  - `status`: `'ERROR'`
  - `result`: Error explanation.

#### Example:
```javascript
window.ssp.request('pay', {
  address: 't1eabPBaLCqNgttQMnAoohPaQM6u2vFwTNJ',
  amount: '4.124',
  chain: 'flux',
  message: 'Payment for services'
}).then(response => {
  if (response.status === 'SUCCESS') {
    console.log('Transaction ID:', response.txid);
  } else {
    console.error('Error:', response.result);
  }
});
```

---

#### 2. Sign Message with Chain Address

- **Method:** `'sign_message'`
- **Description:** Requests SSP to sign a message using a specific chain address.
- **Parameters:**
  - `message` (string, required): The message to be signed.
  - `address` (string, optional): The address to sign with. If not provided, uses the SSP Wallet Identity.
  - `chain` (string, optional): The chain ID. Defaults to identity chain if not specified.

- **Response (Success):**
  - `status`: `'SUCCESS'`
  - `signature`: The signature of the message.
  - `address`: The address that signed the message.
  - `message`: The message that was signed.

- **Response (Error):**
  - `status`: `'ERROR'`
  - `data`: Error explanation.

#### Example:
```javascript
window.ssp.request('sign_message', {
  message: 'Hello SSP, please sign this message',
  chain: 'btc'
}).then(response => {
  if (response.status === 'SUCCESS') {
    console.log('Signature:', response.signature);
    console.log('Address:', response.address);
  }
});
```

---

#### 3. Sign Message with SSP Wallet ID (FluxID)

- **Method:** `'sspwid_sign_message'`
- **Description:** Requests SSP to sign a message using SSP Wallet Identity (FluxID). This is the primary identity address of the wallet.
- **Parameters:**
  - `message` (string, required): The message to be signed.

- **Response (Success):**
  - `status`: `'SUCCESS'`
  - `signature`: The signature of the message.
  - `address`: The SSP Wallet Identity address that signed the message.
  - `message`: The message that was signed.

- **Response (Error):**
  - `status`: `'ERROR'`
  - `data`: Error explanation.

#### Example:
```javascript
window.ssp.request('sspwid_sign_message', {
  message: 'Hello SSP, please sign this message'
}).then(response => {
  if (response.status === 'SUCCESS') {
    console.log('Signature:', response.signature);
    console.log('FluxID Address:', response.address);
  }
});
```

---

#### 4. SSP Chains Info

- **Method:** `'chains_info'`
- **Description:** Requests information about all blockchain networks supported by SSP Wallet.
- **Parameters:** None

- **Response (Success):**
  - `status`: `'SUCCESS'`
  - `chains`: Array of chain objects:
    - `id` (string): Chain ID (e.g., `'btc'`, `'eth'`, `'flux'`).
    - `name` (string): Chain name (e.g., `'Bitcoin'`, `'Ethereum'`).
    - `symbol` (string): Chain symbol (e.g., `'BTC'`, `'ETH'`).
    - `decimals` (number): Number of decimal places.
    - `chainId` (string, optional): EVM Chain ID for EVM-compatible networks.

- **Response (Error):**
  - `status`: `'ERROR'`
  - `data`: Error explanation.

#### Example:
```javascript
window.ssp.request('chains_info').then(response => {
  if (response.status === 'SUCCESS') {
    response.chains.forEach(chain => {
      console.log(`${chain.name} (${chain.symbol}): ${chain.id}`);
    });
  }
});
```

---

#### 5. Chain Tokens

- **Method:** `'chain_tokens'`
- **Description:** Requests the list of supported tokens for a specific blockchain.
- **Parameters:**
  - `chain` (string, required): Chain ID (e.g., `'eth'`, `'sepolia'`).

- **Response (Success):**
  - `status`: `'SUCCESS'`
  - `tokens`: Array of token objects:
    - `contract` (string): Token contract address.
    - `name` (string): Token name.
    - `symbol` (string): Token symbol.
    - `decimals` (number): Number of decimal places.

- **Response (Error):**
  - `status`: `'ERROR'`
  - `data`: Error explanation (e.g., chain not specified, chain not supported, no tokens).

#### Example:
```javascript
window.ssp.request('chain_tokens', {
  chain: 'eth'
}).then(response => {
  if (response.status === 'SUCCESS') {
    response.tokens.forEach(token => {
      console.log(`${token.name} (${token.symbol}): ${token.contract}`);
    });
  }
});
```

---

#### 6. User Synced Chains Info

- **Method:** `'user_chains_info'`
- **Description:** Requests information about chains that the user has synchronized with their SSP Key. Only synchronized chains have addresses available for immediate use.
- **Parameters:** None

- **Response (Success):**
  - `status`: `'SUCCESS'`
  - `chains`: Array of chain objects (same format as `chains_info`).

- **Response (Error):**
  - `status`: `'ERROR'`
  - `data`: Error explanation.

#### Example:
```javascript
window.ssp.request('user_chains_info').then(response => {
  if (response.status === 'SUCCESS') {
    console.log('User has synced:', response.chains.map(c => c.name).join(', '));
  }
});
```

---

#### 7. User Addresses

- **Method:** `'user_addresses'`
- **Description:** Requests the user's addresses for a specific chain. The user will be prompted to select which addresses to share.
- **Parameters:**
  - `chain` (string, required): Chain ID.

- **Response (Success):**
  - `status`: `'SUCCESS'`
  - `addresses`: Array of address strings selected by the user.

- **Response (Error):**
  - `status`: `'ERROR'`
  - `data`: Error explanation.

#### Example:
```javascript
window.ssp.request('user_addresses', {
  chain: 'btc'
}).then(response => {
  if (response.status === 'SUCCESS') {
    console.log('User shared addresses:', response.addresses);
  }
});
```

---

#### 8. User Addresses All Chains

- **Method:** `'user_chains_addresses_all'`
- **Description:** Requests addresses for all synchronized chains. The user can select which addresses to share for each chain.
- **Parameters:** None

- **Response (Success):**
  - `status`: `'SUCCESS'`
  - `chains`: Array of chain objects with addresses:
    - `id` (string): Chain ID.
    - `name` (string): Chain name.
    - `symbol` (string): Chain symbol.
    - `decimals` (number): Number of decimal places.
    - `chainId` (string, optional): EVM Chain ID.
    - `addresses` (array of strings): User-approved addresses for this chain.

- **Response (Error):**
  - `status`: `'ERROR'`
  - `data`: Error explanation.

#### Example:
```javascript
window.ssp.request('user_chains_addresses_all').then(response => {
  if (response.status === 'SUCCESS') {
    response.chains.forEach(chain => {
      console.log(`${chain.name}: ${chain.addresses.join(', ')}`);
    });
  }
});
```

---

#### 9. Sign Message with WK Identity

- **Method:** `'wk_sign_message'`
- **Description:** Requests SSP to sign a message using Wallet-Key (WK) Identity. This creates a Bitcoin message signing request with configurable authentication modes. In 2-of-2 mode, the request is sent to the user's mobile SSP Key app for approval and co-signing.

- **Parameters:**
  - `message` (string, required): Plain text message starting with a 13-digit millisecond timestamp. The message must be valid for ~15 minutes from the timestamp and not more than 5 minutes in the future. Length requirements: minimum 45 characters (13 timestamp + 32 random hex), maximum 500 characters.
  - `authMode` (number, optional): Authentication mode. `1` = wallet signature only, `2` = wallet + key signatures (2-of-2). Defaults to `2`.
  - `origin` (string, required): The domain/origin of the requesting site. This is verified and displayed prominently to the user.
  - `siteName` (string, optional): Friendly name of the requesting site (max 100 chars).
  - `description` (string, optional): Description of what the authentication is for (max 500 chars).
  - `iconUrl` (string, optional): HTTPS URL to site icon (max 500 chars). Must use HTTPS protocol.

- **Response (Success):**
  - `status`: `'SUCCESS'`
  - `result`: Object containing:
    - `walletSignature` (string): Base64-encoded wallet signature.
    - `walletPubKey` (string): Hex-encoded wallet public key (66 chars, compressed).
    - `keySignature` (string, optional): Base64-encoded key signature (only when `authMode=2`).
    - `keyPubKey` (string, optional): Hex-encoded key public key (only when `authMode=2`).
    - `witnessScript` (string): Hex-encoded witness script for signature verification.
    - `wkIdentity` (string): The WK Identity address (bc1q... P2WSH address).
    - `message` (string): The original message that was signed.

- **Response (Error):**
  - `status`: `'ERROR'`
  - `result`: Error explanation.

#### Message Format:
The message should start with a 13-digit millisecond timestamp:
```javascript
// Create a valid message
const timestamp = Date.now().toString(); // e.g., "1704067200000"
const randomData = crypto.randomBytes(16).toString('hex');
const message = timestamp + randomData;
```

#### Example (2-of-2 mode - default):
```javascript
window.ssp.request('wk_sign_message', {
  message: '1704067200000abcdef1234567890ab',
  origin: 'example.com',
  siteName: 'Example App',
  description: 'Sign in to your account'
}).then(response => {
  if (response.status === 'SUCCESS') {
    console.log('Wallet Signature:', response.result.walletSignature);
    console.log('Key Signature:', response.result.keySignature);
    console.log('WK Identity:', response.result.wkIdentity);
  }
});
```

#### Example (wallet-only mode):
```javascript
window.ssp.request('wk_sign_message', {
  message: '1704067200000abcdef1234567890ab',
  authMode: 1,
  origin: 'example.com'
}).then(response => {
  if (response.status === 'SUCCESS') {
    // Response includes walletSignature only (no keySignature)
    console.log('Wallet Signature:', response.result.walletSignature);
  }
});
```

---

## Supported Chain IDs

| Chain ID | Name | Symbol | Type |
|----------|------|--------|------|
| `btc` | Bitcoin | BTC | UTXO |
| `flux` | Flux | FLUX | UTXO |
| `eth` | Ethereum | ETH | EVM |
| `sepolia` | Sepolia Testnet | ETH | EVM |
| `ltc` | Litecoin | LTC | UTXO |
| `doge` | Dogecoin | DOGE | UTXO |
| `zec` | Zcash | ZEC | UTXO |
| `bch` | Bitcoin Cash | BCH | UTXO |
| `rvn` | Ravencoin | RVN | UTXO |

*Note: Additional chains may be available. Use `chains_info` to get the complete list.*

---

## Error Handling

Always check the `status` field in the response:

```javascript
window.ssp.request('method_name', params).then(response => {
  if (response.status === 'SUCCESS') {
    // Handle success
  } else {
    // Handle error
    console.error('Error:', response.result || response.data);
  }
}).catch(error => {
  // Handle connection/extension errors
  console.error('SSP Wallet not available:', error);
});
```

## Checking SSP Wallet Availability

```javascript
if (typeof window.ssp !== 'undefined') {
  console.log('SSP Wallet is installed');
} else {
  console.log('SSP Wallet is not installed');
}
```
