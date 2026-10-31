import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

/**
 * Source-level contracts for the wallet's dApp / pairing / relay surface
 * (security review 2026-10: H-4, H-6, H-9, WEXT-3/5/6/7, RA-1/RA-4).
 *
 * The behaviour itself is unit-tested in wkMessage.spec, chainSync.spec,
 * relayAuth.spec, backgroundRequests.spec and walletConnectVerify.spec; these
 * pin that the components actually route through those checks, so a refactor
 * cannot quietly reopen a bypass.
 */

const read = (relativePath: string): string =>
  readFileSync(new URL(`../../src/${relativePath}`, import.meta.url), 'utf8');

/** Source with comments removed, so assertions see only code. */
const code = (relativePath: string): string =>
  read(relativePath)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

describe('H-4: pairing never finishes without the verification gate or attestation', () => {
  const key = code('components/Key/Key.tsx');

  it('calls finishSync only from the gate confirmation and completeSync', () => {
    const calls = key.match(/finishSync\(\)/g) ?? [];
    expect(calls).toHaveLength(2);
    expect(key).not.toMatch(/onClick=\{finishSync\}/);
    const confirm = key.slice(
      key.indexOf('const confirmVerification'),
      key.indexOf('const discardSessionSyncedChains'),
    );
    expect(confirm).toContain('finishSync()');
    const complete = key.slice(
      key.indexOf('const completeSync'),
      key.indexOf('const confirmVerification'),
    );
    expect(complete).toContain('if (!sessionNeedsVerificationCode())');
  });

  it('sends "Continue to wallet" through completeSync', () => {
    expect(key).toMatch(/onClick=\{completeSync\}/);
  });

  it('records every stored key in the session registry before writing it', () => {
    const ok = key.slice(key.indexOf('const handleOkModalKey'));
    expect(ok.indexOf('sessionLandedRef.current.set(activeChain')).toBeLessThan(
      ok.indexOf('secureLocalStorage.setItem(`2-${derivationPath}`'),
    );
    expect(
      ok.indexOf('markUnverifiedPairing(session.id, activeChain)'),
    ).toBeGreaterThan(-1);
    expect(
      ok.indexOf('markUnverifiedPairing(session.id, activeChain)'),
    ).toBeLessThan(
      ok.indexOf('secureLocalStorage.setItem(`2-${derivationPath}`'),
    );
    const batchDoc = key.slice(key.indexOf('const handleBatchSyncDoc'));
    expect(
      batchDoc.indexOf('sessionLandedRef.current.set(doc.chain'),
    ).toBeLessThan(batchDoc.indexOf('storeKeyXpubForChain('));
  });

  it('stores nothing once the verification code is on screen', () => {
    const batchDoc = key.slice(
      key.indexOf('const handleBatchSyncDoc'),
      key.indexOf('const markBatchArrival'),
    );
    expect(batchDoc.indexOf('if (verifyOpenRef.current)')).toBeGreaterThan(-1);
    expect(batchDoc.indexOf('if (verifyOpenRef.current)')).toBeLessThan(
      batchDoc.indexOf('storeKeyXpubForChain('),
    );
  });

  it('verifies SSP Key attestations against the stored identity key', () => {
    expect(key.match(/verifyChainSyncAttestation\(/g)?.length).toBe(2);
    expect(key).toContain(
      'keyIdentityXpub: identityKeyXpubRef.current || storedIdentityKeyXpub',
    );
  });

  it('builds the gate from the session registry, not the batch', () => {
    const gate = key.slice(
      key.indexOf('const buildVerifyGate'),
      key.indexOf('const sessionNeedsVerificationCode'),
    );
    expect(gate).toContain('sessionLandedRef.current.forEach');
    expect(gate).not.toContain("phase === 'done'");
  });

  it('never posts the batch request unsigned', () => {
    const start = key.slice(
      key.indexOf('const startBatch'),
      key.indexOf('const batchTick'),
    );
    expect(start).toContain(
      "throw new Error('Relay authentication unavailable')",
    );
    expect(start).not.toContain('sending without');
  });

  it('discards unverified key xpubs at unlock, before reading them', () => {
    const login = code('pages/Login/Login.tsx');
    const decrypt = login.slice(login.indexOf('const decryptWallet'));
    const sweep = decrypt.indexOf('await discardOrphanedUnverifiedPairings()');
    expect(sweep).toBeGreaterThan(-1);
    expect(sweep).toBeLessThan(decrypt.indexOf('`2-xpub-48-'));
    // A pairing still in progress in another view is never read back here.
    const refusal = decrypt.indexOf(
      "failUnlock(t('login:err_pairing_in_progress'))",
    );
    expect(refusal).toBeGreaterThan(sweep);
    expect(refusal).toBeLessThan(decrypt.indexOf('`2-xpub-48-'));
  });

  it('re-checks the sync session after PBKDF2, right before any key write', () => {
    const ok = key.slice(
      key.indexOf('const handleOkModalKey'),
      key.indexOf('const handleCancelModalKey'),
    );
    const encrypt = ok.indexOf('await passworderEncrypt(password, xpub2)');
    const recheck = ok.indexOf('if (!isCurrentSession(session))', encrypt);
    expect(encrypt).toBeGreaterThan(-1);
    expect(recheck).toBeGreaterThan(encrypt);
    expect(recheck).toBeLessThan(ok.indexOf('sessionLandedRef.current.set('));
    expect(recheck).toBeLessThan(ok.indexOf('markUnverifiedPairing('));
    expect(recheck).toBeLessThan(ok.indexOf('setXpubKey(activeChain, xpub2)'));
    // The redux write is no longer made before the PBKDF2 work.
    expect(ok.match(/setXpubKey\(activeChain, xpub2\)/g)).toHaveLength(1);
    const batchDoc = key.slice(
      key.indexOf('const handleBatchSyncDoc'),
      key.indexOf('const markBatchArrival'),
    );
    expect(batchDoc).toContain('isCurrent: () => isCurrentSession(session)');
    const lib = code('lib/chainSync.ts');
    const store = lib.slice(
      lib.indexOf('export async function storeKeyXpubForChain'),
    );
    const encrypted = store.indexOf(
      'await passworderEncrypt(password, keyXpub)',
    );
    expect(
      store.indexOf('if (!session.isCurrent()) return false;', encrypted),
    ).toBeLessThan(store.indexOf('markUnverifiedPairing(session.id, chain)'));
    expect(
      store.indexOf('if (!session.isCurrent()) return false;', encrypted),
    ).toBeGreaterThan(encrypted);
  });

  it('ends the sync session whenever it finishes, is discarded or the view goes', () => {
    const finish = key.slice(
      key.indexOf('const finishSync'),
      key.indexOf('const buildVerifyGate'),
    );
    expect(finish).toContain('clearUnverifiedPairing(session.id)');
    expect(finish).toContain('endSyncSession()');
    const discard = key.slice(
      key.indexOf('const discardSessionSyncedChains'),
      key.indexOf('const abortVerification'),
    );
    expect(discard.indexOf('endSyncSession()')).toBeLessThan(
      discard.indexOf('secureLocalStorage.removeItem('),
    );
    expect(discard).toContain('discardUnverifiedPairings(session.id)');
    const unmount = key.slice(key.indexOf('return () => {'));
    expect(unmount.indexOf('endSyncSession()')).toBeLessThan(
      unmount.indexOf('}, []);'),
    );
  });
});

describe('KEY-5 residual: randomParams rotate after a recovery exchange', () => {
  it('saves a recoverable state first, retires the index, then rotates in one commit', () => {
    const login = code('pages/Login/Login.tsx');
    const recovery = login.slice(
      login.indexOf('const runRecovery'),
      login.indexOf('const retryRecovery'),
    );
    expect(recovery).toContain('await secureWalletAfterRecovery({');
    expect(recovery).toContain(
      'setPassword(userPassword + effectiveRandomParams)',
    );
    // Runs to the recoverable state even when the user cancelled meanwhile
    // (rotation then skipped); progress is shown while it rotates.
    expect(
      recovery.indexOf('const rotate = !recoveryCancelledRef.current'),
    ).toBeLessThan(recovery.indexOf('await secureWalletAfterRecovery({'));
    // Once SSP Key released the key, nothing returns early before the
    // recoverable state is saved and the index retired.
    const released = recovery.indexOf('await requestRecovery({');
    const secured = recovery.indexOf('await secureWalletAfterRecovery({');
    expect(
      recovery
        .slice(released, secured)
        .includes('recoveryCancelledRef.current ||'),
    ).toBe(false);
    expect(recovery).toContain("setRecoveryStatus('securing')");
    const lib = code('lib/recoveryRotation.ts');
    const flow = lib.slice(
      lib.indexOf('export async function secureWalletAfterRecovery'),
    );
    const fallback = flow.indexOf(
      'storage.setItem(RANDOM_PARAMS_STORAGE_KEY, fallbackBlob)',
    );
    expect(fallback).toBeGreaterThan(-1);
    expect(fallback).toBeLessThan(flow.indexOf('advanceIndex()'));
    expect(flow.indexOf('advanceIndex()')).toBeLessThan(
      flow.indexOf('await rotateVaultPassword({'),
    );
    // The nonce pool moves with the rest of the vault, under its own lock.
    expect(lib).toContain('NONCE_POOL_STORAGE_KEY');
    expect(lib).toContain('extraLocks: [NONCE_POOL_LOCK');
  });
});

describe('H-6 / WEXT-7: WK messages and enterprise methods are origin-bound', () => {
  const context = code('contexts/sspConnectContext.tsx');

  it('checks the WK policy against the verified origin at intake', () => {
    expect(context).toContain('checkWkSignPolicy(');
    expect(context).toContain('request.data.params?.verifiedOrigin');
  });

  it('allows enterprise_* methods from SSP Enterprise only', () => {
    expect(context).toContain('isEnterpriseOrigin(verifiedOrigin)');
    for (const method of [
      'enterprise_vault_xpub',
      'enterprise_vault_sign_tx',
      'enterprise_vault_sign_message',
      'enterprise_flux_node_start',
      'enterprise_nonce_sync',
      'enterprise_vault_address',
    ]) {
      expect(context).toContain(`'${method}'`);
    }
  });

  it('every enterprise-only method is one background.js forwards (and vice versa)', () => {
    const background = readFileSync(
      new URL('../../public/scripts/background.js', import.meta.url),
      'utf8',
    );
    const setOf = (source: string, name: string): string[] => {
      const start = source.indexOf(name);
      const body = source.slice(start, source.indexOf(']);', start));
      return [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    };
    const enterpriseOnly = setOf(context, 'const ENTERPRISE_ONLY_METHODS');
    const dappMethods = setOf(background, 'const DAPP_METHODS');
    expect(enterpriseOnly).toContain('enterprise_vault_address');
    for (const method of enterpriseOnly) {
      expect(dappMethods, method).toContain(method);
    }
    for (const method of dappMethods.filter((m) =>
      m.startsWith('enterprise_'),
    )) {
      expect(enterpriseOnly, method).toContain(method);
    }
  });

  it('re-checks the policy in the WkSign dialog at sign time', () => {
    const wkSign = code('components/WkSign/WkSign.tsx');
    expect(wkSign.match(/checkWkSignPolicy\(/g)?.length).toBe(2);
    expect(wkSign).toContain(
      'disabled={loading || waitingForKey || !!policyRefusal}',
    );
  });
});

describe('H-9 / WEXT-6: every dApp dialog names the verified requester', () => {
  it('passes the requester to SignMessage and pins it above the other dialogs', () => {
    const sspConnect = code('components/SspConnect/SspConnect.tsx');
    expect(sspConnect).toContain('requesterInfo={requesterInfo}');
    expect(sspConnect).toContain('<RequesterOrigin');
    const signMessage = code('components/SignMessage/SignMessage.tsx');
    expect(signMessage).toContain('<RequesterOrigin variant="inline"');
  });

  it('builds requester info for every bridge method', () => {
    const context = code('contexts/sspConnectContext.tsx');
    // sign/sspwid/wk sign, pay, chains info, chain tokens, user addresses,
    // and the five enterprise / two flux-node methods.
    expect(
      (context.match(/setRequesterInfo\(buildRequesterInfo\(/g) ?? []).length,
    ).toBeGreaterThanOrEqual(9);
  });
});

describe('WEXT-3: every UI reply echoes the request id', () => {
  it('SspConnect replies only through sendReply with the request id', () => {
    const sspConnect = code('components/SspConnect/SspConnect.tsx');
    expect(sspConnect.match(/runtime\.sendMessage\(/g)).toHaveLength(1);
    expect(sspConnect).toContain('requestId: requestIdRef.current');
  });

  it('sspConnectContext replies carry the incoming request id', () => {
    const context = code('contexts/sspConnectContext.tsx');
    const replies = context.match(/runtime\.sendMessage\(\{\s*origin: 'ssp',/g);
    expect(replies).toHaveLength(1);
    expect(context).toContain('requestId: incomingRequestId');
  });
});

describe('WEXT-5 / WEXT-6: WalletConnect Verify and session scoping', () => {
  it('refuses scam-flagged requesters and accounts outside the session', () => {
    const wc = code('contexts/WalletConnectContext.tsx');
    expect(wc).toContain('sessionRequestRefusal(event)');
    expect(wc).toContain('sessionRequestRefusal(request)');
    expect(wc).toContain('sessionAccountAddresses(sessionAccounts');
    expect(wc).not.toContain('result = await getUserAccounts()');
  });

  it('refuses eth_sign and eth_signTypedData* up front and stops advertising them (EVM-12)', () => {
    const wc = code('contexts/WalletConnectContext.tsx');
    const unsupported = wc.slice(
      wc.indexOf('const UNSUPPORTED_SIGNING_METHODS'),
      wc.indexOf('const UNSUPPORTED_METHOD_CODE'),
    );
    for (const method of [
      'eth_sign',
      'eth_signTypedData',
      'eth_signTypedData_v3',
      'eth_signTypedData_v4',
    ]) {
      expect(unsupported).toContain(`'${method}'`);
    }
    // Refused before the scam/session checks and before any modal.
    const handler = wc.slice(wc.indexOf('const handleSessionRequest'));
    expect(
      handler.indexOf('UNSUPPORTED_SIGNING_METHODS.includes(method)'),
    ).toBeLessThan(handler.indexOf('setPendingRequestModal(event)'));
    expect(wc).toContain('code: UNSUPPORTED_METHOD_CODE');
    // No approval path and no namespace advertises them.
    expect(wc).not.toContain("case 'eth_sign':");
    expect(wc).not.toContain("case 'eth_signTypedData");
    expect(wc).not.toContain('handleSignTypedData');
    expect(wc).not.toContain('handleEthSign');
    const namespaces = wc.slice(
      wc.indexOf('const supportedNamespaces'),
      wc.indexOf('const approvedNamespaces'),
    );
    expect(namespaces).toContain("'personal_sign'");
    expect(namespaces).not.toContain("'eth_sign'");
    expect(namespaces).not.toContain('eth_signTypedData');
  });

  it.each([
    'components/WalletConnect/modals/ConnectionRequestModal.tsx',
    'components/WalletConnect/modals/PersonalSignModal.tsx',
    'components/WalletConnect/modals/TypedDataSignModal.tsx',
  ])('%s shows the Verify status and gates approval on it', (path) => {
    const modal = code(path);
    expect(modal).toContain('<VerifiedDappOrigin');
    expect(modal).toContain('assessVerifyContext(');
    expect(modal).toContain('verifyBlocksApproval');
    expect(modal).not.toContain('<DappOrigin');
  });
});

describe('RA-1 / RA-2 / RA-4: relay auth on the client', () => {
  it('never emits an unauthenticated socket join', () => {
    const socket = code('contexts/SocketContext.tsx');
    const joins = socket.match(/emit\('join',[^)]*\)/gs) ?? [];
    expect(joins).toHaveLength(1);
    expect(joins[0]).toContain('...auth');
    expect(socket).not.toContain("emit('join', { wkIdentity: identity })");
  });

  it('signs the GET polls it owns', () => {
    expect(code('components/Transactions/Transactions.tsx')).toContain(
      "createReadAuthHeaders('wk', sspWalletKeyInternalIdentity, url)",
    );
    const key = code('components/Key/Key.tsx');
    expect(
      key.match(
        /createReadAuthHeaders\(\s*'wallet',\s*sspWalletInternalIdentity/g,
      ),
    ).toHaveLength(2);
    expect(key).toContain("createReadAuthHeaders('wk', batch.wkIdentity, url)");
  });

  it("replenishes enterprise nonces with relay auth, for the wallet's own wkIdentity", () => {
    const key = code('components/Key/Key.tsx');
    const call = key.slice(key.indexOf('replenishWalletEnterpriseNonces('));
    expect(call.slice(0, 300)).toContain('createAuth: createWkIdentityAuth');
    expect(call.slice(0, 300)).toContain(
      "createReadAuthHeaders('wk', ownWkIdentity, url)",
    );
    expect(key).toContain('wkIdentity === ownWkIdentity');
  });

  it('never posts an unsigned action from WkSign or WalletConnect', () => {
    for (const path of [
      'components/WkSign/WkSign.tsx',
      'contexts/WalletConnectContext.tsx',
    ]) {
      const source = code(path);
      expect(source).not.toMatch(/sending without/i);
      expect(source).toMatch(/if \(!auth\) \{\s*throw new Error/);
    }
  });
});
