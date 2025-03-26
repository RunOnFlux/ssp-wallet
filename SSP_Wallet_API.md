# SSP Wallet JavaScript API

The SSP Wallet injects a `window.ssp` object into the website, enabling communication between web pages and the SSP Wallet Chrome extension.

## API Method: `window.ssp.request(method, parameters)`

This function takes two parameters:

- `method`: A string specifying the method to be called.
- `parameters`: An object containing additional parameters specific to the method.

### Implemented Methods

#### 1. Pay Request

- **Method:** `'pay'`
- **Description:** Requests SSP to perform payment actions (sending assets).
- **Parameters:**
  - `message` (string): A message to include in the transaction (e.g., `'Hello SSP'`).
  - `amount` (string): The amount to send in whole units (e.g., `'4.124'`).
  - `address` (string): The recipient's address (e.g., `'t1eabPBaLCqNgttQMnAoohPaQM6u2vFwTNJ'`).
  - `chain` (string): The chain ID identifier of SSP (e.g., `'flux'`).
  - `contract?` (string): For networks that support tokens, the token contract to send from, not needed for ETH itself (e.g., `'0xdac17f958d2ee523a2206206994597c13d831ec7'` to send `'USDT'`).

- **Response:**
  - `status` (string): Indicates success or error.
  - `result?` (string): Explanation of error (if any).
  - `data?` (string): Explanation of success (if any).
  - `txid?` (string): Transaction ID in case of a successful payment.

#### Example:
```javascript
window.ssp.request('pay', {
  message: 'Hello SSP',
  amount: '4.124',
  address: 't1eabPBaLCqNgttQMnAoohPaQM6u2vFwTNJ',
  chain: 'flux'
}).then(response => {
  console.log(response);
});
```

#### 2. Sign Message with SSP Wallet ID (FluxID)

- **Method:** `'sspwid_sign_message'`
- **Description:** Requests SSP to sign a message using SSP Wallet Identity.
- **Parameters:**
  - `message` (string): The message to be signed by SSP Wallet Identity (e.g., `'Hello SSP, please sign this message'`).

- **Response:**
  - `status` (string): Indicates success or error.
  - `result?` (string): Explanation of error (if any).
  - `data?` (string): Explanation of success (if any).
  - `signature?` (string): Signature of the signed message.
  - `address?` (string): Address that signed the message.
  - `message?` (string): The message that was signed.

#### Example:
```javascript
window.ssp.request('sspwid_sign_message', {
  message: 'Hello SSP, please sign this message'
}).then(response => {
  console.log(response);
});
```


#### 3. SSP Chains Info

- **Method:** `'chains_info'`
- **Description:** Requests SSP to get the list of supported chains.

- **Response:**
  - `status` (string): Indicates success or error.
  - `result?` (string): Explanation of error (if any).
  - `data?` (string): Explanation of success (if any).
  - `chains?` (array of objects): List of all supported chains.
    - `id` (string): Chain ID.
    - `name` (string): Chain name.
    - `symbol` (string): Chain symbol.
    - `decimals` (number): Chain decimals.
    - `chainId?` (string): Chain ID (for EVM chains) of the chain.

#### Example:
```javascript
window.ssp.request('chains_info').then(response => {
  console.log(response);
});
```

#### 4. Chain Tokens

- **Method:** `'chain_tokens'`
- **Description:** Requests SSP to get the list of tokens for a given chain.
- **Parameters:**
  - `chain` (string): Chain ID as SSP identifier.

- **Response:**
  - `status` (string): Indicates success or error.
  - `result?` (string): Explanation of error (if any).
  - `data?` (string): Explanation of success (if any).
  - `tokens?` (array of objects): List of tokens for the given chain.
    - `contract` (string): Token contract.
    - `name` (string): Token name.
    - `symbol` (string): Token symbol.
    - `decimals` (number): Token decimals.

#### Example:
```javascript
window.ssp.request('chain_tokens', {
  chain: 'eth'
}).then(response => {
  console.log(response);
});
```

#### 5. User Synced Chains Info

- **Method:** `'user_chains_info'`
- **Description:** Requests SSP to get the list of chains that the user has synchronised. Those are the chains that can be immediately used and have addresses. Other chains will require the user to synchronise the chain first.

- **Response:**
  - `status` (string): Indicates success or error.
  - `result?` (string): Explanation of error (if any).
  - `data?` (string): Explanation of success (if any).
  - `chains?` (array of objects): List of user synced chains.
    - `id` (string): Chain ID.
    - `name` (string): Chain name.
    - `symbol` (string): Chain symbol.
    - `decimals` (number): Chain decimals.
    - `chainId?` (string): Chain ID (for EVM chains) of the chain.

#### Example:
```javascript
window.ssp.request('user_chains_info').then(response => {
  console.log(response);
});
```

#### 6. User Addresses

- **Method:** `'user_addresses'`
- **Description:** Requests SSP to get the list of addresses for a given chain.

- **Parameters:**
  - `chain` (string): Chain ID as SSP identifier.

- **Response:**
  - `status` (string): Indicates success or error.
  - `result?` (string): Explanation of error (if any).
  - `data?` (string): Explanation of success (if any).
  - `addresses?` (array of strings): List of user approved addresses for the given chain.

#### Example:
```javascript
window.ssp.request('user_addresses', {
  chain: 'btc'
}).then(response => {
  console.log(response);
});
```


#### 7. User Addresses All Chains

- **Method:** `'user_chains_addresses_all'`
- **Description:** Requests SSP to get the list of addresses for a all chains. User can select what addresses are shared for what chain. Also provides information about particular chain

- **Response:**
  - `status` (string): Indicates success or error.
  - `result?` (string): Explanation of error (if any).
  - `data?` (string): Explanation of success (if any).
  - `chains?` (array of objects): List of user approved chains with addresses
    - `id` (string): Chain ID.
    - `name` (string): Chain name.
    - `symbol` (string): Chain symbol.
    - `decimals` (number): Chain decimals.
    - `chainId?` (string): Chain ID (for EVM chains) of the chain.
    - `addresses` (array of strings): List of user addresses

#### Example:
```javascript
window.ssp.request('user_chains_addresses_all').then(response => {
  console.log(response);
});
```