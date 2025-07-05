# SSP Wallet Schnorr MultiSig Proof of Concept

This directory contains simple proof-of-concept tests for the Schnorr MultiSig implementation in SSP Wallet.

## 🎯 **Purpose**

These tests demonstrate the basic functionality of:
- Extended private key handling
- EIP-191 message formatting
- Schnorr MultiSig signature generation
- Hash compatibility verification

## 📁 **Test Files**

### **`simple-schnorr-test.mjs`**
The main test that demonstrates the complete Schnorr MultiSig process:
- ✅ Private key derivation from extended keys
- ✅ EIP-191 message formatting
- ✅ Schnorr MultiSig signature generation  
- ✅ Hash compatibility with `ethers.hashMessage()`
- ✅ Optional contract verification

### **`address-verification.mjs`**
Simple test to verify address generation:
- ✅ Extended key to public key conversion
- ✅ MultiSig address generation
- ✅ Keypair creation for signing

## 🔑 **Test Configuration**

### **Extended Private Keys**:
```javascript
SSP_WALLET_XPRIV: 'xprvREDACTED'
SSP_KEY_XPRIV: 'xprvREDACTED'
```

### **Target Address**:
```
0x9b171134A9386149Ed030F499d5e318272eB9589
```

### **EIP-191 Format**:
```javascript
const prefix = '\x19Ethereum Signed Message:\n';
const eip191Message = prefix + message.length.toString() + message;
```

## 🚀 **Running the Tests**

```bash
# Main Schnorr MultiSig test
node tests/proof-of-concept/simple-schnorr-test.mjs

# Address verification test  
node tests/proof-of-concept/address-verification.mjs
```

## 📋 **Expected Results**

Both tests should show:
- ✅ Successful key derivation
- ✅ Proper EIP-191 formatting
- ✅ Hash compatibility confirmation
- ✅ Valid signature generation

## 🔗 **Integration**

The core logic from these tests is used in:
- **`src/contexts/WalletConnectContext.tsx`**: Main WalletConnect implementation
- **Personal sign handling**: EIP-191 compatible signatures
- **Hex message decoding**: Handles WalletConnect hex-encoded messages

## 📝 **Key Points**

1. **EIP-191 Standard**: Ensures Etherscan compatibility
2. **Fresh Nonces**: Security requirement for Schnorr signatures  
3. **Hash Matching**: `ethers.hashMessage()` compatibility is crucial
4. **ABI Encoding**: Proper format for smart contract verification
5. **Hex Decoding**: WalletConnect sends hex-encoded messages

This implementation provides the foundation for SSP Wallet's WalletConnect integration with proper Schnorr MultiSig signatures. 