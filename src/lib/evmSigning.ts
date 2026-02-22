import * as accountAbstraction from '@runonflux/aa-schnorr-multisig-sdk';
import type { keyPair, publicPrivateNonce } from '../types';

interface publicNonces {
  kPublic: string;
  kTwoPublic: string;
}

export function signMessageWithSchnorrMultisig(
  messageToSign: string,
  walletKeypair: keyPair,
  publicKey2HEX: string,
  publicNonces2: publicNonces,
): {
  sigOne: string;
  challenge: string;
  pubNoncesOne: publicNonces;
  pubNoncesTwo: publicNonces;
} {
  try {
    console.log('Signing formatted message:', {
      message: messageToSign,
      messageLength: messageToSign.length,
    });

    // Create Schnorr signers from private key using the SDK
    const signerOne =
      accountAbstraction.helpers.SchnorrHelpers.createSchnorrSigner(
        walletKeypair.privKey as `0x${string}`,
      );

    // CRITICAL: Generate fresh nonces for each signing operation
    // This is essential for security - nonces must NEVER be reused
    signerOne.generatePubNonces();

    console.log('🔐 Created Schnorr signer with fresh nonce');

    // Verify signers are properly initialized by checking their keys
    const pubKeyOne = signerOne.getPubKey();
    const pubKeyTwo = new accountAbstraction.types.Key(
      Buffer.from(publicKey2HEX, 'hex'),
    );

    if (!pubKeyOne || !pubKeyTwo) {
      throw new Error(
        'Failed to initialize Schnorr signers - invalid public keys',
      );
    }

    console.log('🔐 Verified signer initialization with public keys');

    const publicKeys = [pubKeyOne, pubKeyTwo];

    // Generate fresh public nonces
    const pubNoncesOne = signerOne.getPubNonces();
    const pubNoncesTwo: accountAbstraction.types.PublicNonces = {
      kPublic: new accountAbstraction.types.Key(
        Buffer.from(publicNonces2.kPublic, 'hex'),
      ),
      kTwoPublic: new accountAbstraction.types.Key(
        Buffer.from(publicNonces2.kTwoPublic, 'hex'),
      ),
    };

    if (!pubNoncesOne || !pubNoncesTwo) {
      throw new Error('Failed to generate public nonces for signing');
    }

    const publicNonces = [pubNoncesOne, pubNoncesTwo];

    const { signature: sigOne, challenge } = signerOne.signMultiSigMsg(
      messageToSign,
      publicKeys,
      publicNonces,
    );

    const publicNoncesOneHex = {
      kPublic: pubNoncesOne.kPublic.buffer.toString('hex'),
      kTwoPublic: pubNoncesOne.kTwoPublic.buffer.toString('hex'),
    };
    const publicNoncesTwoHex = publicNonces2;
    const signatureHex = sigOne.buffer.toString('hex');
    const challengeHex = challenge.buffer.toString('hex');
    return {
      sigOne: signatureHex,
      challenge: challengeHex,
      pubNoncesOne: publicNoncesOneHex,
      pubNoncesTwo: publicNoncesTwoHex,
    };
  } catch (error) {
    console.error('Error in Enhanced Schnorr MultiSig signing:', error);
    throw error;
  }
}

/**
 * Vault Schnorr signing: uses pre-reserved enterprise nonces instead of
 * generating fresh ones. Both wallet and key restore from their reserved
 * nonce pair. Wallet produces a partial signature (sigOne) + challenge;
 * Key then completes signing via continueSigningSchnorrMultisig().
 *
 * Accepts variable-length arrays for M-of-N signing:
 * - allPublicKeys: ALL 2M public keys hex (canonical order)
 * - allPublicNonces: ALL 2M public nonces (canonical order)
 * The SDK finds this signer automatically via nonce match.
 */
export function signVaultMessageWithSchnorr(
  messageToSign: string,
  walletKeypair: keyPair,
  walletNonce: publicPrivateNonce,
  allPublicKeys: string[],
  allPublicNonces: publicNonces[],
): {
  sigOne: string;
  challenge: string;
} {
  if (
    !allPublicKeys.length ||
    !allPublicNonces.length ||
    allPublicKeys.length !== allPublicNonces.length
  ) {
    throw new Error(
      `Invalid signing arrays: ${allPublicKeys.length} keys vs ${allPublicNonces.length} nonces`,
    );
  }

  // Create Schnorr signer from wallet private key
  const signerOne =
    accountAbstraction.helpers.SchnorrHelpers.createSchnorrSigner(
      walletKeypair.privKey as `0x${string}`,
    );

  // CRITICAL: Restore pre-reserved nonce instead of generating fresh
  const kPrivate = new accountAbstraction.types.Key(
    Buffer.from(walletNonce.k, 'hex'),
  );
  const kTwoPrivate = new accountAbstraction.types.Key(
    Buffer.from(walletNonce.kTwo, 'hex'),
  );
  signerOne.restorePubNonces(kPrivate, kTwoPrivate);

  // Build Key[] and PublicNonces[] from hex inputs
  const publicKeys = allPublicKeys.map(
    (hex) => new accountAbstraction.types.Key(Buffer.from(hex, 'hex')),
  );

  // Replace this signer's pubkey entry with the one from the signer object
  // (SDK matches by nonce, but pubkey must be the signer's internal Key instance)
  const signerPubKey = signerOne.getPubKey();
  const signerPubKeyHex = signerPubKey.buffer.toString('hex');
  const signerKeyIdx = allPublicKeys.findIndex(
    (hex) => hex === signerPubKeyHex,
  );
  if (signerKeyIdx === -1) {
    throw new Error(
      'Wallet public key not found in allSignerKeys array — key mismatch',
    );
  }
  publicKeys[signerKeyIdx] = signerPubKey;

  const signerPubNonces = signerOne.getPubNonces();
  const signerNonceHex = signerPubNonces.kPublic.buffer.toString('hex');
  const publicNoncesArr: accountAbstraction.types.PublicNonces[] =
    allPublicNonces.map((n, i) => {
      // For the signer's own nonce slot, use the signer's internal nonces
      if (i === signerKeyIdx || n.kPublic === signerNonceHex) {
        return signerPubNonces;
      }
      return {
        kPublic: new accountAbstraction.types.Key(
          Buffer.from(n.kPublic, 'hex'),
        ),
        kTwoPublic: new accountAbstraction.types.Key(
          Buffer.from(n.kTwoPublic, 'hex'),
        ),
      };
    });

  const { signature: sigOne, challenge } = signerOne.signMultiSigMsg(
    messageToSign,
    publicKeys,
    publicNoncesArr,
  );

  return {
    sigOne: sigOne.buffer.toString('hex'),
    challenge: challenge.buffer.toString('hex'),
  };
}
