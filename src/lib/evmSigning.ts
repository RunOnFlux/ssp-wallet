import * as accountAbstraction from '@runonflux/aa-schnorr-multisig-sdk';
import { keyPair } from '../types';

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

    console.log(`Raw Data:`, {
      message: messageToSign,
      publicKeys,
      publicNonces,
      sigOne,
      challenge,
    });

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
