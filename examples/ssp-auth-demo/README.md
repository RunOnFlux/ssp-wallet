# SSP Authentication Demo

A simple example website demonstrating SSP Identity authentication integration.

## Features

- **Two-Factor Authentication** - Wallet + Key (2-of-2 multisig)
- **Single-Factor Authentication** - Wallet only
- **Client-side validation** - Timestamp and format validation
- **Response viewer** - See the full authentication response

## Running the Demo

### Option 1: Using Python

```bash
cd examples/ssp-auth-demo
python3 -m http.server 8080
```

Then open http://localhost:8080 in your browser.

### Option 2: Using Node.js

```bash
npx serve examples/ssp-auth-demo
```

### Option 3: Using any static file server

Simply serve the `examples/ssp-auth-demo` directory with any web server.

## Requirements

- SSP Wallet browser extension installed
- SSP Key mobile app (for two-factor authentication)
- Modern browser with JavaScript enabled

## How It Works

1. **User clicks "Sign in with SSP"**
2. **Demo creates a timestamped message**
   - 13-digit millisecond timestamp
   - 16-byte random challenge
3. **SSP Wallet prompts user for approval**
4. **For Two-Factor mode, request is sent to SSP Key**
5. **Signatures are returned to the demo**
6. **Demo validates the response**
   - Checks timestamp validity (15 min past, 5 min future)
   - Validates public key formats
   - Validates identity address format
7. **User is authenticated**

## Files

- `index.html` - Main HTML structure
- `styles.css` - Styling
- `app.js` - Authentication logic

## Production Notes

⚠️ **Important**: This demo performs client-side validation for demonstration purposes only.

In production, you should:

1. **Validate server-side** - Send the response to your backend for cryptographic verification
2. **Verify signatures** - Use a Bitcoin library to verify the message signatures
3. **Verify witness script** - Ensure the public keys are in the witness script
4. **Verify identity** - Ensure the witness script hashes to the claimed identity address
5. **Use server nonces** - Generate challenges on the server to prevent replay attacks

See `SSP_Identity_Authentication_Guide.md` in the repository root for full verification details.

## API Reference

```javascript
// Request SSP authentication
const response = await window.ssp.request('wk_sign_message', {
  message: timestampedMessage,      // Required: plain text message with timestamp
  authMode: 2,                      // Optional: 1=wallet only, 2=wallet+key (default)
  origin: 'https://example.com',    // Required: your domain
  siteName: 'My App',               // Optional: shown to user
  description: 'Sign in',           // Optional: shown to user
  iconUrl: 'https://example.com/icon.png'  // Optional: HTTPS only
});

// Success response
{
  status: 'SUCCESS',
  result: {
    walletSignature: 'base64...',
    walletPubKey: '02abc...',
    keySignature: 'base64...',      // Only if authMode=2
    keyPubKey: '03def...',          // Only if authMode=2
    witnessScript: '5221...52ae',
    wkIdentity: 'bc1q...',
    message: '1704067200000abc...'
  }
}
```

## License

MIT
