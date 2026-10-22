/**
 * After a recovery exchange (Login, fingerprint drift L5): make the wallet
 * unlock locally again and rotate randomParams (KEY-5 residual).
 *
 * The order is what makes every interruption recoverable:
 *  1. The RECOVERED randomParams, encrypted under the fresh fingerprint, are
 *     written first and read back. From here on the wallet unlocks locally
 *     with the plain password, whatever happens to the rest — a closed popup,
 *     a crash or a refused rotation leaves a working (unrotated) wallet.
 *  2. The recovery index the exchange used is advanced — its key was released
 *     and must never seal another envelope. It runs as soon as step 1 holds,
 *     even when the user cancelled meanwhile; never before step 1, because it
 *     drops the envelope, which is the only way back in until then.
 *  3. Rotation: fresh randomParams; every blob re-encrypted under the new
 *     password and the new randomParams blob written in ONE verified,
 *     locked, compare-and-swapped commit (vaultUpgrade.rotateVaultPassword).
 *     A failure there writes nothing and the wallet stays on step 1's state.
 */

import { encrypt as passworderEncrypt } from '@metamask/browser-passworder';
import { getRandomParams } from './fingerprint';
import { advanceRecoveryIndex } from './recoveryEnvelope';
import { NONCE_POOL_LOCK, NONCE_POOL_STORAGE_KEY } from './enterpriseNonces';
import {
  passwordVaultKeys,
  rotateVaultPassword,
  type VaultLocation,
  type VaultLockOptions,
  type VaultStorage,
} from './vaultUpgrade';
import { plainVaultStorage, secureVaultStorage } from './vaultStorage';

export const RANDOM_PARAMS_STORAGE_KEY = 'randomParams';
/** Pre-migration enterprise nonce pool (react-secure-storage). */
const LEGACY_NONCE_POOL_KEY = 'enterpriseNoncesWallet';

/**
 * Every blob encrypted with `userPassword + randomParams` — rotated together
 * when randomParams change after a recovery exchange.
 */
export function recoveryRotationLocations(
  secure: VaultStorage = secureVaultStorage(),
  plain: VaultStorage = plainVaultStorage(),
): VaultLocation[] {
  return [
    ...passwordVaultKeys().map((key) => ({ storage: secure, key })),
    // Enterprise nonce pool: current (plain localStorage) and pre-migration.
    { storage: plain, key: NONCE_POOL_STORAGE_KEY },
    { storage: secure, key: LEGACY_NONCE_POOL_KEY },
  ];
}

export type RecoveryRotationStep = 'fallback_saved' | 'rotating';

export interface RecoveryRotationResult {
  /** The randomParams the wallet now uses (log in with password + these). */
  randomParams: string;
  rotated: boolean;
}

export async function secureWalletAfterRecovery(params: {
  userPassword: string;
  recoveredRandomParams: string;
  /** getFingerprint('forRandomParams') of this browser now. */
  freshFingerprint: string;
  /** false: only steps 1 and 2 (the user cancelled after the exchange). */
  rotate: boolean;
  onStep?: (step: RecoveryRotationStep) => void;
  /** Where randomParams lives (react-secure-storage). */
  randomParamsStorage?: VaultStorage;
  locations?: VaultLocation[];
  lockOptions?: VaultLockOptions;
  advanceIndex?: () => void;
  generateRandomParams?: () => string;
}): Promise<RecoveryRotationResult> {
  const {
    userPassword,
    recoveredRandomParams,
    freshFingerprint,
    rotate,
    onStep,
  } = params;
  const storage = params.randomParamsStorage ?? secureVaultStorage();
  const advanceIndex = params.advanceIndex ?? advanceRecoveryIndex;
  const generate = params.generateRandomParams ?? getRandomParams;

  // 1. Recoverable state first. Throws (nothing advanced) if it cannot be
  //    persisted: the envelope must stay so recovery can be retried.
  const fallbackBlob = await passworderEncrypt(
    freshFingerprint,
    recoveredRandomParams,
  );
  storage.setItem(RANDOM_PARAMS_STORAGE_KEY, fallbackBlob);
  if (storage.getFresh(RANDOM_PARAMS_STORAGE_KEY) !== fallbackBlob) {
    throw new Error('randomParams could not be saved');
  }
  onStep?.('fallback_saved');

  // 2. The released index is spent.
  try {
    advanceIndex();
  } catch (error) {
    console.log('[recovery] could not advance the recovery index:', error);
  }

  if (!rotate) {
    return { randomParams: recoveredRandomParams, rotated: false };
  }

  // 3. Rotation, all-or-nothing.
  onStep?.('rotating');
  const rotatedRandomParams = generate();
  try {
    const rotatedBlob = await passworderEncrypt(
      freshFingerprint,
      rotatedRandomParams,
    );
    await rotateVaultPassword({
      locations: params.locations ?? recoveryRotationLocations(),
      oldPassword: userPassword + recoveredRandomParams,
      newPassword: userPassword + rotatedRandomParams,
      extraWrites: [
        { storage, key: RANDOM_PARAMS_STORAGE_KEY, value: rotatedBlob },
      ],
      // The nonce pool is among the blobs: hold its lock too, so no view
      // burns a nonce into the old-password pool mid-rotation.
      ...params.lockOptions,
      extraLocks: [NONCE_POOL_LOCK, ...(params.lockOptions?.extraLocks ?? [])],
    });
    return { randomParams: rotatedRandomParams, rotated: true };
  } catch (error) {
    // Nothing was written: the wallet keeps the recovered randomParams.
    console.log('[recovery] randomParams rotation skipped:', error);
    return { randomParams: recoveredRandomParams, rotated: false };
  }
}
