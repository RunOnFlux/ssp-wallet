# SSP Identity Authentication Guide

This guide explains how to integrate SSP Identity authentication into your website or application. SSP Identity provides cryptographic proof of user identity using Bitcoin message signing with optional two-factor (2-of-2 multisig) security.

## Overview

SSP Identity authentication works by:
1. Your website creates a challenge message with a timestamp
2. User approves the signing request in SSP Wallet (and optionally SSP Key for 2FA)
3. Your website receives signatures and verification data
4. Your server verifies the signatures to authenticate the user

## Quick Start

```javascript
// 1. Create a timestamped message
const timestamp = Date.now().toString(); // 13-digit millisecond timestamp
const challenge = crypto.randomBytes(16).toString('hex');
const message = timestamp + challenge;

// 2. Request signature from SSP Wallet
const response = await window.ssp.request('wk_sign_message', {
  message: message,
  origin: window.location.origin,
  siteName: 'Your App Name',
  description: 'Sign in to your account'
});

// 3. Send to your server for verification
if (response.status === 'SUCCESS') {
  await fetch('/api/auth/verify', {
    method: 'POST',
    body: JSON.stringify(response.result)
  });
}
```

---

## Message Construction

### Format Requirements

The message must be:
- **Plain text**: A simple string (no hex encoding required)
- **Timestamp-prefixed**: First 13 characters must be a millisecond timestamp
- **Time-valid**: Timestamp must be within 15 minutes in the past and 5 minutes in the future

### Example Message Construction

```javascript
/**
 * Creates a valid SSP Identity authentication message
 * @param {string} customData - Optional additional data to include
 * @returns {string} Plain text message ready for signing
 */
function createAuthMessage(customData = '') {
  // Current timestamp in milliseconds (13 digits)
  const timestamp = Date.now().toString();

  // Random challenge to prevent replay attacks
  const challenge = crypto.randomBytes(16).toString('hex');

  // Combine: timestamp + challenge + optional custom data
  return timestamp + challenge + customData;
}

// Example output:
// "1704067200000a1b2c3d4e5f6a7b8c9d0e1f2a3b"
```

### Including Custom Data

You can include additional data after the timestamp + challenge:

```javascript
// Include user session ID or nonce from your server
const serverNonce = 'abc123';
const message = timestamp + challenge + serverNonce;
```

---

## API Request

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `message` | Yes | Plain text message with 13-digit timestamp prefix |
| `origin` | Yes | Your domain (verified by extension, shown to user) |
| `authMode` | No | `1` = wallet only, `2` = wallet + key (default: `2`) |
| `siteName` | No | Your app name (shown to user, max 100 chars) |
| `description` | No | Purpose description (shown to user, max 500 chars) |
| `iconUrl` | No | HTTPS URL to your icon (max 500 chars) |

### Full Example

```javascript
async function requestSSPAuth() {
  // Check if SSP Wallet is available
  if (typeof window.ssp === 'undefined') {
    throw new Error('SSP Wallet not installed');
  }

  // Create message
  const timestamp = Date.now().toString();
  const challenge = crypto.randomBytes(16).toString('hex');
  const message = timestamp + challenge;

  // Request signature
  const response = await window.ssp.request('wk_sign_message', {
    message: message,
    authMode: 2, // Two-factor authentication
    origin: window.location.origin,
    siteName: 'My Application',
    description: 'Sign in to access your dashboard',
    iconUrl: 'https://myapp.com/icon.png'
  });

  if (response.status === 'SUCCESS') {
    return response.result;
  } else {
    throw new Error(response.result || 'Authentication failed');
  }
}
```

---

## Response Format

### Success Response (authMode = 2)

```javascript
{
  status: 'SUCCESS',
  result: {
    walletSignature: 'H+ABC123...==',     // Base64 wallet signature
    walletPubKey: '02abc123...',           // 66-char compressed public key
    keySignature: 'H+DEF456...==',         // Base64 key signature
    keyPubKey: '03def456...',              // 66-char compressed public key
    witnessScript: '5221...52ae',          // Hex witness script
    wkIdentity: 'bc1q...',                 // P2WSH identity address
    message: '1704067200000a1b2c3d...'     // Original plain text message
  }
}
```

### Success Response (authMode = 1)

```javascript
{
  status: 'SUCCESS',
  result: {
    walletSignature: 'H+ABC123...==',
    walletPubKey: '02abc123...',
    witnessScript: '5221...52ae',
    wkIdentity: 'bc1q...',
    message: '1704067200000a1b2c3d...'
    // Note: keySignature and keyPubKey are NOT present
  }
}
```

---

## Server-Side Verification

### Overview

To verify the authentication:
1. Validate the message timestamp
2. Verify wallet signature against walletPubKey
3. Verify key signature against keyPubKey (if authMode = 2)
4. Verify both public keys are in the witnessScript
5. Verify witnessScript hashes to the wkIdentity address

### Step 1: Validate Timestamp

```javascript
function validateTimestamp(message) {
  // Extract timestamp (first 13 characters)
  const timestamp = parseInt(message.substring(0, 13), 10);

  if (isNaN(timestamp)) {
    return { valid: false, error: 'Invalid timestamp format' };
  }

  const now = Date.now();
  const maxAge = 15 * 60 * 1000; // 15 minutes
  const maxFuture = 5 * 60 * 1000; // 5 minutes

  if (timestamp < now - maxAge) {
    return { valid: false, error: 'Message expired' };
  }

  if (timestamp > now + maxFuture) {
    return { valid: false, error: 'Message timestamp too far in future' };
  }

  return { valid: true, timestamp };
}
```

### Step 2: Verify Bitcoin Message Signatures

SSP uses standard Bitcoin message signing (BIP-137 compatible). Use a Bitcoin library to verify:

```javascript
const bitcoin = require('bitcoinjs-lib');
const bitcoinMessage = require('bitcoinjs-message');

function verifySignature(message, signature, publicKey) {
  try {
    // Bitcoin message signing uses the message directly
    const verified = bitcoinMessage.verify(
      message,           // The plain text message
      getAddressFromPubKey(publicKey),
      signature
    );
    return verified;
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}

function getAddressFromPubKey(publicKeyHex) {
  const pubKeyBuffer = Buffer.from(publicKeyHex, 'hex');
  const { address } = bitcoin.payments.p2pkh({
    pubkey: pubKeyBuffer,
    network: bitcoin.networks.bitcoin
  });
  return address;
}
```

### Step 3: Verify Public Keys in Witness Script

The witnessScript is a 2-of-2 multisig script containing both public keys:

```javascript
function verifyWitnessScript(witnessScriptHex, walletPubKey, keyPubKey) {
  const witnessScript = Buffer.from(witnessScriptHex, 'hex');

  // 2-of-2 multisig script format:
  // OP_2 <pubkey1> <pubkey2> OP_2 OP_CHECKMULTISIG
  // 52 21 <33-byte-pubkey> 21 <33-byte-pubkey> 52 ae

  // Check script structure
  if (witnessScript[0] !== 0x52) { // OP_2
    return false;
  }

  // Extract public keys from script
  const pubKey1 = witnessScript.slice(2, 35).toString('hex');
  const pubKey2 = witnessScript.slice(36, 69).toString('hex');

  // Verify both provided public keys are in the script
  const pubKeys = [pubKey1, pubKey2];
  const hasWalletKey = pubKeys.includes(walletPubKey);
  const hasKeyKey = pubKeys.includes(keyPubKey);

  return hasWalletKey && hasKeyKey;
}
```

### Step 4: Verify Identity Address

Verify the witnessScript hashes to the claimed wkIdentity (P2WSH address):

```javascript
const bitcoin = require('bitcoinjs-lib');

function verifyIdentityAddress(witnessScriptHex, wkIdentity) {
  const witnessScript = Buffer.from(witnessScriptHex, 'hex');

  // Create P2WSH payment from witness script
  const p2wsh = bitcoin.payments.p2wsh({
    redeem: { output: witnessScript },
    network: bitcoin.networks.bitcoin
  });

  // Compare addresses
  return p2wsh.address === wkIdentity;
}
```

### Complete Verification Function

```javascript
async function verifySSPAuthentication(authResult) {
  const {
    walletSignature,
    walletPubKey,
    keySignature,
    keyPubKey,
    witnessScript,
    wkIdentity,
    message
  } = authResult;

  // 1. Validate timestamp
  const timestampResult = validateTimestamp(message);
  if (!timestampResult.valid) {
    return { success: false, error: timestampResult.error };
  }

  // 2. Verify wallet signature
  const walletSigValid = verifySignature(message, walletSignature, walletPubKey);
  if (!walletSigValid) {
    return { success: false, error: 'Invalid wallet signature' };
  }

  // 3. Verify key signature (if present - authMode 2)
  if (keySignature && keyPubKey) {
    const keySigValid = verifySignature(message, keySignature, keyPubKey);
    if (!keySigValid) {
      return { success: false, error: 'Invalid key signature' };
    }

    // 4. Verify both keys in witness script
    const keysInScript = verifyWitnessScript(witnessScript, walletPubKey, keyPubKey);
    if (!keysInScript) {
      return { success: false, error: 'Public keys not in witness script' };
    }
  }

  // 5. Verify identity address
  const addressValid = verifyIdentityAddress(witnessScript, wkIdentity);
  if (!addressValid) {
    return { success: false, error: 'Witness script does not match identity' };
  }

  return {
    success: true,
    identity: wkIdentity,
    timestamp: timestampResult.timestamp,
    twoFactor: !!(keySignature && keyPubKey)
  };
}
```

---

## Security Best Practices

### 1. Always Verify Server-Side

Never trust client-side verification alone. Always send the complete response to your server for cryptographic verification.

### 2. Use Unique Challenges

Include a server-generated nonce in your message to prevent replay attacks:

```javascript
// Server generates nonce
const serverNonce = crypto.randomBytes(32).toString('hex');
await storeNonce(serverNonce, { expires: Date.now() + 15 * 60 * 1000 });

// Client includes nonce in message
const message = timestamp + challenge + ':' + serverNonce;

// Server verifies nonce was issued and not yet used
const nonceValid = await validateAndConsumeNonce(extractedNonce);
```

### 3. Bind to Session

Associate the wkIdentity with a user session after verification:

```javascript
// After successful verification
const session = await createSession({
  userId: findOrCreateUser(wkIdentity),
  identity: wkIdentity,
  twoFactor: result.twoFactor,
  authenticatedAt: new Date()
});
```

### 4. Prefer Two-Factor Authentication

For sensitive operations, require `authMode: 2`:

```javascript
// For login, single factor may be acceptable
const loginResponse = await window.ssp.request('wk_sign_message', {
  message: hexMessage,
  authMode: 1, // Wallet only for convenience
  origin: window.location.origin
});

// For sensitive operations, require two-factor
const sensitiveOpResponse = await window.ssp.request('wk_sign_message', {
  message: hexMessage,
  authMode: 2, // Wallet + Key required
  origin: window.location.origin,
  description: 'Authorize withdrawal of funds'
});
```

### 5. Display Origin Prominently

The `origin` parameter is verified by the SSP extension and displayed to users. Always use your actual domain - users will see it and can verify they're authenticating with the right site.

---

## Example: Express.js Server

```javascript
const express = require('express');
const bitcoin = require('bitcoinjs-lib');
const bitcoinMessage = require('bitcoinjs-message');

const app = express();
app.use(express.json());

// Store for server nonces
const nonces = new Map();

// Generate authentication challenge
app.get('/api/auth/challenge', (req, res) => {
  const nonce = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + 15 * 60 * 1000;

  nonces.set(nonce, { expires, used: false });

  res.json({ nonce, expires });
});

// Verify authentication
app.post('/api/auth/verify', async (req, res) => {
  try {
    const result = await verifySSPAuthentication(req.body);

    if (!result.success) {
      return res.status(401).json({ error: result.error });
    }

    // Create or find user by identity
    const user = await User.findOrCreate({
      sspIdentity: result.identity
    });

    // Create session
    const token = generateSessionToken(user.id);

    res.json({
      success: true,
      user: { id: user.id, identity: result.identity },
      token,
      twoFactor: result.twoFactor
    });
  } catch (error) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

app.listen(3000);
```

---

## Troubleshooting

### "Message expired" Error

The timestamp is more than 15 minutes old. Create a fresh message with current timestamp.

### "Invalid signature" Error

- Ensure you're verifying against the correct message (the hex string, not decoded)
- Check that the public key format is correct (66 hex characters, compressed)
- Verify the signature is Base64 encoded

### "Public keys not in witness script" Error

The witness script should contain both the wallet and key public keys in a 2-of-2 multisig format.

### "Witness script does not match identity" Error

The SHA256 hash of the witness script should match the wkIdentity P2WSH address. This could indicate tampering.

---

## Libraries and Tools

### JavaScript/Node.js
- `bitcoinjs-lib` - Bitcoin transaction/address handling
- `bitcoinjs-message` - Bitcoin message signing/verification

### Python
- `python-bitcoinlib` - Bitcoin library
- `ecdsa` - ECDSA signature verification

### Go
- `btcsuite/btcd` - Bitcoin library with message signing support

---

## Support

For questions or issues:
- GitHub: https://github.com/anthropics/ssp-wallet
- Documentation: https://docs.sspwallet.io
