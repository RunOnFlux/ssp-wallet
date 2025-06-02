# WalletConnect Setup Guide - LIMITED IMPLEMENTATION

⚠️ **IMPORTANT LIMITATION NOTICE** ⚠️

**This WalletConnect implementation is a LIMITED PROOF OF CONCEPT. While connection establishment works, most signing operations return placeholder data and do not perform real signatures or transactions.**

## Current Implementation Status

### ✅ What Works
- **Connection establishment** - Can connect to dApps
- **Session management** - View and disconnect sessions  
- **Chain switching** - Actually changes active chain
- **Account sharing** - Returns real user addresses

### ❌ What Doesn't Work (Returns Fake Data)
- **Message signing** - Returns placeholder signatures
- **Transaction signing** - Returns fake transaction hashes
- **Typed data signing** - Returns placeholder signatures
- **Real blockchain interaction** - No actual transactions sent

## Setup Instructions

### 1. Get Your Project ID

1. Go to [https://cloud.reown.com/](https://cloud.reown.com/)
2. Sign up or log in to your account
3. Create a new project
4. Copy your Project ID

### 2. Configure in Your Project

#### Option A: Using .env file (Recommended)

Create a `.env` file in your project root:

```bash
# .env
REACT_APP_WALLETCONNECT_PROJECT_ID=your-actual-project-id-here
```

#### Option B: Vite Config (Already configured)

The project ID is already configured in `vite.config.ts`:

```typescript
define: {
  'process.env.REACT_APP_WALLETCONNECT_PROJECT_ID': JSON.stringify(
    process.env.REACT_APP_WALLETCONNECT_PROJECT_ID || '0fddbe43cb0cca6b6e0fcf9b5f4f0ff6',
  ),
}
```

#### Option C: Environment Variable

Set it directly as an environment variable:

```bash
export REACT_APP_WALLETCONNECT_PROJECT_ID=your-actual-project-id-here
npm run dev
```

### 3. How It Works

1. **Vite Config**: Defines the environment variable with a fallback
2. **WalletConnect Context**: Uses the environment variable or shows an error if not configured
3. **Fallback**: If not configured, shows helpful error message with setup instructions

### 4. Current Configuration Locations

- **Vite Config**: `vite.config.ts` (line ~77)
- **Context**: `src/contexts/WalletConnectContext.tsx` (line ~25)
- **Environment**: `.env` file (create this file)

## Testing the Implementation

### ✅ What You Can Test
1. **Connection Flow**
   - Open SSP Wallet on an EVM chain
   - Click WalletConnect button
   - Paste connection URI from a dApp
   - Approve connection
   - **Result**: Session established with real addresses shared

2. **Chain Switching**
   - Connect to a multi-chain dApp
   - Request chain switch from dApp
   - **Result**: SSP Wallet actually switches chains

3. **UI/UX Testing**
   - Test all modal interfaces
   - Test responsive design
   - Test error handling

### ⚠️ What You'll See But Isn't Real
1. **Message Signing**
   - Modal appears with message details ✅
   - User can approve/reject ✅
   - Shows "Waiting for SSP Key..." ✅
   - Returns fake signature after 3 seconds ❌

2. **Transactions**
   - Modal shows transaction details ✅
   - User can approve/reject ✅
   - Returns fake transaction hash ❌
   - No actual blockchain interaction ❌

## Recommended Test dApps

For testing the current limited functionality:

- **[WalletConnect Test dApp](https://react-app.walletconnect.com/)** - Good for connection testing
- **[Reown AppKit Lab](https://lab.reown.com/)** - Official test interface
- **Popular DeFi dApps** - Can test connection but don't expect real transactions

## Development Usage

### ✅ Good For:
- **UI/UX development and testing**
- **dApp connection flow validation**
- **Interface responsiveness testing**
- **User experience design**

### ❌ Not Suitable For:
- **Production usage with real assets**
- **Actual transaction testing**
- **Real signature validation**
- **Any use case requiring valid signatures**

## Error Messages and Troubleshooting

The implementation will show an error message if you haven't configured your project ID, guiding you through the setup process.

### Common Setup Issues

1. **"WalletConnect not initialized"**
   - Ensure project ID is set correctly
   - Check network connectivity
   - Verify provider is properly wrapped

2. **"Unsupported chain"**
   - WalletConnect only works on EVM chains
   - Switch to Ethereum, Polygon, Base, BSC, or Avalanche

3. **"Session proposal expired"**
   - QR codes expire after 5 minutes
   - Generate a new QR code from the dApp

## Future Development

To make this fully functional would require:

1. **Socket Integration** - Real-time communication with SSP Key
2. **Signature Coordination** - Proper Schnorr multisig implementation
3. **Transaction Broadcasting** - Integration with SSP's EVM transaction system
4. **Public Nonce Management** - Dynamic nonce sharing between devices

## Conclusion

This setup guide will help you configure the WalletConnect proof of concept. While the current implementation has significant limitations due to SSP Wallet's unique Schnorr multisig architecture, it provides a solid foundation for UI/UX testing and demonstrates how the full implementation would work when complete. 