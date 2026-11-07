// VD-2 / VD-3 / VD-4 / VD-5 wiring in the wallet: the bridge accepts the
// descriptor object, every vault method refuses without it, the dialogs verify
// before enabling their action AND again at sign time, the descriptor reaches
// SSP Key verbatim, and SSP Key's refusal codes reach SSP Enterprise.
import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { sanitizeRequest, type bgRequest } from '../../src/lib/sanitizeRequest';
import {
  VAULT_ERROR_CODES,
  vaultErrorCodeFromKey,
  vaultGateErrorCode,
} from '../../src/lib/vaultGate';

const read = (relativePath: string): string =>
  readFileSync(new URL(`../../src/${relativePath}`, import.meta.url), 'utf8');

const vectors = JSON.parse(
  readFileSync(new URL('./fixtures/vd-vectors.json', import.meta.url), 'utf8'),
) as { vectors: Array<{ descriptor: unknown; descriptorHash: string }> };

function request(method: string, params: Record<string, unknown>): bgRequest {
  return {
    origin: 'ssp-background',
    data: {
      method,
      params: {
        origin: 'https://enterprise.sspwallet.com',
        verifiedOrigin: 'https://enterprise.sspwallet.com',
        topOrigin: 'https://enterprise.sspwallet.com',
        isSubframe: false,
        ...params,
      } as unknown as bgRequest['data']['params'],
    },
  };
}

describe('sanitizeRequest carries the vault descriptor (VD-2)', () => {
  const { descriptor, descriptorHash } = vectors.vectors[3]; // Solana: largest

  it('accepts the descriptor object, its hash, typeIndex and expectedAddress', () => {
    const result = sanitizeRequest(
      request('enterprise_vault_address', {
        vaultDescriptor: descriptor,
        vaultDescriptorHash: descriptorHash,
        typeIndex: 4,
        addressIndex: 0,
        expectedAddress: 'ETjNEBPQxwmgpxmQeCxwYd8w1X5wmhftUTAiPrqzDmRs',
      }),
    );
    expect(result).not.toBeNull();
    expect(result?.data.params.vaultDescriptor).toBe(descriptor);
  });

  it('rejects a non-object descriptor, an array or an oversized one', () => {
    for (const vaultDescriptor of [
      'x',
      42,
      ['a'],
      { blob: 'x'.repeat(200_001) },
    ]) {
      expect(
        sanitizeRequest(
          request('enterprise_vault_sign_tx', {
            vaultDescriptor,
            vaultDescriptorHash: descriptorHash,
          }),
        ),
      ).toBeNull();
    }
  });

  it('rejects a non-integer typeIndex', () => {
    for (const typeIndex of [-1, 1.5, '3']) {
      expect(
        sanitizeRequest(request('enterprise_vault_address', { typeIndex })),
      ).toBeNull();
    }
  });
});

describe('sspConnectContext intake', () => {
  const context = read('contexts/sspConnectContext.tsx');

  it('restricts enterprise_vault_address to SSP Enterprise origins', () => {
    const set = context.slice(
      context.indexOf('const ENTERPRISE_ONLY_METHODS'),
      context.indexOf(']);', context.indexOf('const ENTERPRISE_ONLY_METHODS')),
    );
    expect(set).toContain("'enterprise_vault_address'");
    expect(context).toContain('isEnterpriseOrigin(verifiedOrigin)');
  });

  it('refuses every vault method without a descriptor (fail closed)', () => {
    for (const method of [
      'enterprise_vault_sign_tx',
      'enterprise_vault_sign_message',
      'enterprise_flux_node_start',
      'enterprise_vault_address',
    ]) {
      const start = context.indexOf(`request.data.method === '${method}'`);
      expect(start, method).toBeGreaterThan(-1);
      const end = context.indexOf('} else if (request.data.method', start + 1);
      const branch = context.slice(start, end);
      expect(branch, method).toContain('if (!acceptVaultDescriptor()) return;');
      // The check runs before the request becomes the active dialog.
      expect(
        branch.indexOf('if (!acceptVaultDescriptor()) return;'),
        method,
      ).toBeLessThan(branch.indexOf('setType('));
    }
    expect(context).toContain("t('home:vaultDescriptor.err_missing')");
    expect(context).toContain('VAULT_ERROR_CODES.missing');
  });
});

describe('enterprise vault dialogs (VD-3 / VD-4)', () => {
  const signTx = read(
    'components/EnterpriseVaultSignTx/EnterpriseVaultSignTx.tsx',
  );
  const flux = read(
    'components/EnterpriseFluxNodeStart/EnterpriseFluxNodeStart.tsx',
  );

  it('sign tx: Sign stays disabled until the vault verified and the request derives from it', () => {
    expect(signTx).toContain('useVaultDescriptorGate({');
    expect(signTx).toContain(
      'if (vaultGateError) return vaultGateError.message;',
    );
    expect(signTx).toContain('if (vaultCheckError) return vaultCheckError;');
    expect(signTx).toMatch(/const signPending =\s+vaultPending \|\|/);
    expect(signTx).toContain('checkVaultSignRequest(');
  });

  it('sign tx: re-verifies at sign time before any nonce is burned or input signed', () => {
    const handleSign = signTx.slice(signTx.indexOf('const handleSign = async'));
    const recheck = handleSign.indexOf('vaultGate.reverify(');
    expect(recheck).toBeGreaterThan(-1);
    expect(handleSign).toContain('ownVaultAccountXpubFromXpriv(vaultXpriv');
    expect(recheck).toBeLessThan(
      handleSign.indexOf('consumeEnterpriseNonceForPartial('),
    );
    expect(recheck).toBeLessThan(handleSign.indexOf('signVaultUtxoInputs('));
    expect(recheck).toBeLessThan(handleSign.indexOf('tx.partialSign('));
    expect(
      handleSign.indexOf('checkVaultSignRequest(signTimeVault.descriptor'),
    ).toBeGreaterThan(recheck);
  });

  it('sign tx: pins a first-sight vault only after every check, right before the key is used', () => {
    const handleSign = signTx.slice(
      signTx.indexOf('const handleSign = async'),
      signTx.indexOf('const handleCancel = () =>'),
    );
    const firstCommit = handleSign.indexOf('commitVaultPin();');
    expect(handleSign.match(/commitVaultPin\(\);/g)).toHaveLength(5);
    expect(
      handleSign.indexOf('vaultGate.commitPin(signTimeVault)'),
    ).toBeGreaterThan(
      handleSign.indexOf('checkVaultSignRequest(signTimeVault.descriptor'),
    );
    expect(firstCommit).toBeGreaterThan(
      handleSign.indexOf('checkVaultSignRequest(signTimeVault.descriptor'),
    );
    // EVM: hash binding and signer-key checks first, then the pin, then the
    // nonce burn.
    const evmCommit = handleSign.indexOf(
      'commitVaultPin();',
      handleSign.indexOf('keypair.pubKey,\n          );'),
    );
    expect(evmCommit).toBeGreaterThan(handleSign.indexOf('userOpHashMatches('));
    expect(evmCommit).toBeLessThan(
      handleSign.indexOf('consumeEnterpriseNonceForPartial('),
    );
    expect(
      handleSign.lastIndexOf(
        'commitVaultPin();',
        handleSign.indexOf('tx.partialSign('),
      ),
    ).toBeGreaterThan(-1);
    expect(
      handleSign.lastIndexOf(
        'commitVaultPin();',
        handleSign.indexOf('signVaultUtxoInputs(vaultXpriv)'),
      ),
    ).toBeGreaterThan(-1);
    // Pin-on-confirm is reserved for enterprise_vault_address.
    const hook = read('hooks/useVaultDescriptorGate.ts');
    expect(hook).toContain("pinTiming = 'on_sign'");
    expect(hook).toContain("if (pinTiming === 'on_sign') {");
    expect(
      read('components/VaultAddressDisplay/VaultAddressDisplay.tsx'),
    ).toContain("pinTiming: 'on_confirm'");
    expect(signTx).not.toContain('pinTiming');
    expect(flux).not.toContain('pinTiming');
  });

  it('sign tx / flux: cancelling forgets a staged confirmation', () => {
    for (const source of [signTx, flux]) {
      for (const handler of [
        'const handleCancel = ',
        'const handlePinDeclined = ',
      ]) {
        const body = source.slice(
          source.indexOf(handler),
          source.indexOf('};', source.indexOf(handler)),
        );
        expect(body, handler).toContain('vaultGate.discardStagedPin();');
      }
    }
  });

  it('sign tx: every mode branch follows the VERIFIED descriptor, not the request', () => {
    const handleSign = signTx.slice(
      signTx.indexOf('const handleSign = async'),
      signTx.indexOf('const handleCancel = () =>'),
    );
    expect(handleSign).toContain(
      'const vaultMode = signTimeVault.descriptor.signingMode',
    );
    expect(handleSign).not.toMatch(/\bsigningMode ===/);
    expect(handleSign).not.toContain('!reservedNonce.kPublic;');
    expect(handleSign).toContain(
      "const isKeyOnlyMode = vaultMode === 'key_only';",
    );
    expect(handleSign).toContain("} else if (vaultMode === 'key_only') {");
    expect(handleSign).toContain("if (vaultMode === 'sol_single') {");
    const post = signTx.slice(signTx.indexOf('const postVaultSignRequest'));
    expect(post).toContain('signingMode: verifiedSigningMode,');
  });

  it('sign tx: EVM signer keys come from the pinned vault, checked before the nonce burn', () => {
    const handleSign = signTx.slice(signTx.indexOf('const handleSign = async'));
    const check = handleSign.indexOf(
      'checkEvmSignerKeysAgainstDescriptor(\n            signTimeVault.descriptor,\n            txAddressIndex,\n            signingKeys,\n            keypair.pubKey,',
    );
    expect(check).toBeGreaterThan(-1);
    // After the M=1 fallback built its pair from the request's key xpub…
    expect(check).toBeGreaterThan(handleSign.indexOf('deriveEVMPublicKey('));
    // …and before the nonce is burned.
    expect(check).toBeLessThan(
      handleSign.indexOf('consumeEnterpriseNonceForPartial('),
    );
    // key_only forwarding is checked too (no own key in the set).
    expect(handleSign).toMatch(
      /checkEvmSignerKeysAgainstDescriptor\(\s+signTimeVault\.descriptor,\s+txAddressIndex,\s+allSignerKeys,\s+null,/,
    );
  });

  it('sign tx: a retry re-posts the stored partial under its original request id', () => {
    const handleSign = signTx.slice(signTx.indexOf('const handleSign = async'));
    expect(handleSign).toContain('let reqId = generateRequestId();');
    expect(handleSign).toContain('reqId = result.requestId;');
    expect(handleSign.indexOf('let reqId = generateRequestId();')).toBeLessThan(
      handleSign.indexOf('consumeEnterpriseNonceForPartial('),
    );
  });

  it('sign tx: forwards the descriptor and hash verbatim to SSP Key (VD-2)', () => {
    // The payload comes from the pure builder whose output SSP Key's parser
    // is tested against (vaultRelayPayload.spec.ts + fixture).
    const post = signTx.slice(
      signTx.indexOf('const postVaultSignRequest = async'),
    );
    const build = post.slice(
      post.indexOf('buildVaultSignRelayPayload({'),
      post.indexOf('});', post.indexOf('buildVaultSignRelayPayload({')),
    );
    expect(build).toMatch(/\n\s+vaultDescriptor,\n/);
    expect(build).toMatch(/\n\s+vaultDescriptorHash,\n/);
    expect(post).toContain('payload: JSON.stringify(payload),');
  });

  it("sign tx: SSP Key's rejection is matched to the request it names", () => {
    const effect = signTx.slice(
      signTx.indexOf('if (enterpriseVaultSignRejected && waitingForKey)'),
    );
    expect(effect).toContain(
      'keyRejectionRequestId(enterpriseVaultSignRejected)',
    );
    expect(effect).toContain(
      'if (rejectedId && requestId && rejectedId !== requestId)',
    );
    expect(effect).toContain("errorCode: keyVaultCode ?? 'KEY_REJECTED'");
  });

  it('flux node start: approve gated, re-verified, forwarded', () => {
    expect(flux).toContain(
      'disabled={processing || waitingForKey || !vaultReady}',
    );
    expect(flux).toContain('if (!vaultReady) return;');
    // Wallet-signing path and Key-forwarding path.
    expect(flux.match(/recheckVault\(/g)).toHaveLength(2);
    const approve = flux.slice(flux.indexOf('const handleApprove = async'));
    expect(approve.indexOf('recheckVault(ownXpub)')).toBeLessThan(
      approve.indexOf('fluxnode.startFluxNodev6WithPubKey('),
    );
    expect(approve).toContain('buildFluxNodeStartRelayPayload({');
    expect(approve).toMatch(/vaultDescriptor,\s+vaultDescriptorHash,\s+\}\),/);
    // A first-sight vault is pinned inside the re-check, after the collateral
    // check, i.e. right before signing or forwarding.
    const recheck = flux.slice(
      flux.indexOf('const recheckVault = '),
      flux.indexOf('return verified.descriptor;'),
    );
    expect(recheck.indexOf('vaultGate.commitPin(verified);')).toBeGreaterThan(
      recheck.indexOf('checkFluxCollateralAgainstDescriptor('),
    );
  });

  it('pin confirmation cancel refuses the request with VAULT_PIN_REFUSED', () => {
    for (const source of [
      signTx,
      flux,
      read('components/VaultAddressDisplay/VaultAddressDisplay.tsx'),
    ]) {
      expect(source).toContain('<VaultPinConfirm');
      expect(source).toContain('errorCode: VAULT_ERROR_CODES.pinRefused');
    }
  });

  it('SspConnect mounts the address dialog and passes descriptors to both dialogs', () => {
    const sspConnect = read('components/SspConnect/SspConnect.tsx');
    expect(sspConnect).toContain('<VaultAddressDisplay');
    expect(
      sspConnect.match(/vaultDescriptor=\{vaultDescriptor\}/g),
    ).toHaveLength(3);
  });
});

describe('SSP Key rejections reach the dialogs with their payload', () => {
  const socket = read('contexts/SocketContext.tsx');

  it('enterprisevaultsignrejected passes the payload (requestId + errorCode) through', () => {
    const handler = socket.slice(
      socket.indexOf("newSocket.on('enterprisevaultsignrejected'"),
      socket.indexOf("newSocket.on('enterprisekeynoncesynced'"),
    );
    expect(handler).toContain('rejected.payload');
    expect(handler).toContain('setEnterpriseVaultSignRejected(');
    // the old constant stays only as the fallback for an empty payload
    expect(handler).toContain(": 'enterprisevaultsignrejected'");
  });

  it('enterprisefluxnodestarted keeps the parsed payload, errorCode included', () => {
    const handler = socket.slice(
      socket.indexOf("newSocket.on('enterprisefluxnodestarted'"),
    );
    expect(handler).toContain('setEnterpriseFluxNodeStarted(parsed)');
    expect(handler).toContain('errorCode?: string;');
  });
});

describe('Settings: Reset vault pin (VD-3 item 6)', () => {
  it('mounts VaultPinSettings in the Advanced body right after the public nonces row', () => {
    const settings = read('components/Settings/Settings.tsx');
    expect(settings).toContain(
      "import VaultPinSettings from '../VaultPinSettings/VaultPinSettings';",
    );
    const advanced = settings.slice(
      settings.indexOf('{advancedOpen && ('),
      settings.indexOf("label={t('home:settings.ssp_relay')}"),
    );
    expect(advanced).toContain("{t('home:settings.sync_public_nonces')}");
    expect(advanced.indexOf('<VaultPinSettings />')).toBeGreaterThan(
      advanced.indexOf("{t('home:settings.sync_public_nonces')}"),
    );
  });
});

describe('error codes returned to SSP Enterprise', () => {
  it('maps descriptor refusals onto the codes the app understands', () => {
    expect(vaultGateErrorCode('missing')).toBe('VAULT_DESCRIPTOR_MISSING');
    expect(vaultGateErrorCode('pin_mismatch')).toBe('VAULT_DESCRIPTOR_CHANGED');
    expect(vaultGateErrorCode('not_pinned')).toBe('VAULT_PIN_REFUSED');
    for (const code of [
      'malformed',
      'hash_mismatch',
      'identity_invalid',
      'attestation_invalid',
      'not_member',
      'xpub_mismatch',
      'request_mismatch',
      'derivation_mismatch',
      'pin_storage',
    ] as const) {
      expect(vaultGateErrorCode(code)).toBe('VAULT_DESCRIPTOR_INVALID');
    }
    expect(VAULT_ERROR_CODES.pinRefused).toBe('VAULT_PIN_REFUSED');
  });

  it("passes SSP Key's VD refusal codes through and nothing else", () => {
    expect(
      vaultErrorCodeFromKey('{"errorCode":"VAULT_DESCRIPTOR_CHANGED"}'),
    ).toBe('VAULT_DESCRIPTOR_CHANGED');
    expect(
      vaultErrorCodeFromKey({ requestId: 'x', errorCode: 'VAULT_PIN_REFUSED' }),
    ).toBe('VAULT_PIN_REFUSED');
    expect(vaultErrorCodeFromKey('VAULT_DESCRIPTOR_MISSING')).toBe(
      'VAULT_DESCRIPTOR_MISSING',
    );
    // `code` is accepted defensively; `errorCode` wins when both are present.
    expect(vaultErrorCodeFromKey('{"code":"VAULT_DESCRIPTOR_INVALID"}')).toBe(
      'VAULT_DESCRIPTOR_INVALID',
    );
    expect(
      vaultErrorCodeFromKey({
        errorCode: 'VAULT_PIN_REFUSED',
        code: 'VAULT_DESCRIPTOR_INVALID',
      }),
    ).toBe('VAULT_PIN_REFUSED');
    for (const raw of [
      '{}',
      'enterprisevaultsignrejected',
      '{"errorCode":"SOMETHING_ELSE"}',
      '{"code":"SOMETHING_ELSE"}',
      { errorCode: 42 },
      null,
      undefined,
    ]) {
      expect(vaultErrorCodeFromKey(raw)).toBeNull();
    }
  });
});
