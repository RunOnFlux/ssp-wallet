// Transaction simulation / risk preview types.
//
// These mirror the canonical definitions in ssp-relay-enterprise
// (src/types/vault.ts) and ssp-enterprise-app (src/types/vault.ts). The
// browser extension is a PUBLIC, open-source signing app: it is a DUMB
// RENDERER for the server-computed `simulation` object. It performs NO
// simulation itself and ships NO provider secrets.
//
// SAFETY: the `simulation` object is ADVISORY enrichment only. It NEVER gates
// signing. The device's own trustless decode (VaultDecodedTx / transactions.ts)
// remains the authoritative display of what is being signed.

export type SimWarningSeverity = 'critical' | 'high' | 'medium' | 'info';

export type SimWarningCode =
  // approvals
  | 'UNLIMITED_APPROVAL'
  | 'NON_ZERO_APPROVAL'
  | 'APPROVAL_TO_EOA'
  // recipients
  | 'RECIPIENT_NOT_ALLOWLISTED'
  | 'ADDRESS_POISONING'
  | 'NEW_RECIPIENT'
  // contract risk
  | 'UNVERIFIED_CONTRACT'
  | 'NEW_CONTRACT'
  | 'VALUE_TO_CONTRACT'
  | 'KNOWN_MALICIOUS'
  // execution
  | 'SIMULATION_REVERTED'
  | 'BALANCE_MISMATCH'
  | 'SIMULATION_DECODE_MISMATCH'
  // degradation
  | 'SIMULATION_UNAVAILABLE';

export interface SimWarning {
  code: SimWarningCode;
  severity: SimWarningSeverity;
  message: string; // English; client renders an i18n string when available
  detail?: string; // e.g. the look-alike address, the spender, the revert reason
  provider?: string; // which engine raised it
}

export interface SimBalanceChange {
  asset: string; // 'native' | erc20 contract | token symbol
  symbol: string;
  decimals: number;
  address?: string; // contract address for tokens
  beforeRaw: string; // smallest unit
  afterRaw: string; // smallest unit
  deltaRaw: string; // signed, smallest unit
  deltaUsd?: number;
  direction: 'out' | 'in';
}

export interface SimDecodedCall {
  standard?:
    | 'erc20'
    | 'erc721'
    | 'erc1155'
    | 'router'
    | 'entrypoint'
    | 'unknown';
  method?: string; // 'transfer' | 'approve' | 'setApprovalForAll' | ...
  args?: Record<string, string>; // stringified for transport
  target?: string; // contract being called
  targetVerified?: boolean;
}

export type ProposalSimulationStatus =
  | 'pending'
  | 'ok'
  | 'reverted'
  | 'unavailable';

export interface ProposalSimulation {
  status: ProposalSimulationStatus;
  provider?: string;
  simulatedAt?: string; // ISO
  chainStateBlock?: number;
  balanceChanges: SimBalanceChange[];
  decodedCall?: SimDecodedCall;
  warnings: SimWarning[];
  revertReason?: string;
}

const SEVERITY_ORDER: Record<SimWarningSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  info: 3,
};

/** Sort warnings by descending severity (critical first). Pure, non-mutating. */
export function sortWarningsBySeverity(warnings: SimWarning[]): SimWarning[] {
  return [...warnings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
}

/**
 * Runtime guard: validate that an unknown value (e.g. a parsed JSON string that
 * arrived over the relay/sspConnect bridge) is a usable ProposalSimulation.
 * Defensive — never throws; returns null on any structural problem so the UI
 * can render gracefully (the never-strand-funds invariant: a malformed/absent
 * simulation must never break the sign screen).
 */
export function parseProposalSimulation(
  value: unknown,
): ProposalSimulation | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  const status = v.status;
  if (
    status !== 'pending' &&
    status !== 'ok' &&
    status !== 'reverted' &&
    status !== 'unavailable'
  ) {
    return null;
  }

  const warnings: SimWarning[] = [];
  if (Array.isArray(v.warnings)) {
    for (const w of v.warnings) {
      if (typeof w !== 'object' || w === null) continue;
      const wo = w as Record<string, unknown>;
      if (typeof wo.code !== 'string') continue;
      const severity =
        wo.severity === 'critical' ||
        wo.severity === 'high' ||
        wo.severity === 'medium' ||
        wo.severity === 'info'
          ? wo.severity
          : 'info';
      warnings.push({
        code: wo.code as SimWarningCode,
        severity,
        message: typeof wo.message === 'string' ? wo.message : '',
        detail: typeof wo.detail === 'string' ? wo.detail : undefined,
        provider: typeof wo.provider === 'string' ? wo.provider : undefined,
      });
    }
  }

  const balanceChanges: SimBalanceChange[] = [];
  if (Array.isArray(v.balanceChanges)) {
    for (const c of v.balanceChanges) {
      if (typeof c !== 'object' || c === null) continue;
      const co = c as Record<string, unknown>;
      balanceChanges.push({
        asset: typeof co.asset === 'string' ? co.asset : '',
        symbol: typeof co.symbol === 'string' ? co.symbol : '',
        decimals: typeof co.decimals === 'number' ? co.decimals : 0,
        address: typeof co.address === 'string' ? co.address : undefined,
        beforeRaw: typeof co.beforeRaw === 'string' ? co.beforeRaw : '0',
        afterRaw: typeof co.afterRaw === 'string' ? co.afterRaw : '0',
        deltaRaw: typeof co.deltaRaw === 'string' ? co.deltaRaw : '0',
        deltaUsd: typeof co.deltaUsd === 'number' ? co.deltaUsd : undefined,
        direction: co.direction === 'in' ? 'in' : 'out',
      });
    }
  }

  let decodedCall: SimDecodedCall | undefined;
  if (typeof v.decodedCall === 'object' && v.decodedCall !== null) {
    const dc = v.decodedCall as Record<string, unknown>;
    let args: Record<string, string> | undefined;
    if (typeof dc.args === 'object' && dc.args !== null) {
      args = {};
      for (const [k, val] of Object.entries(
        dc.args as Record<string, unknown>,
      )) {
        if (typeof val === 'string') args[k] = val;
        else if (typeof val === 'number' || typeof val === 'boolean') {
          args[k] = String(val);
        }
      }
    }
    decodedCall = {
      standard:
        dc.standard === 'erc20' ||
        dc.standard === 'erc721' ||
        dc.standard === 'erc1155' ||
        dc.standard === 'router' ||
        dc.standard === 'entrypoint' ||
        dc.standard === 'unknown'
          ? dc.standard
          : undefined,
      method: typeof dc.method === 'string' ? dc.method : undefined,
      args,
      target: typeof dc.target === 'string' ? dc.target : undefined,
      targetVerified:
        typeof dc.targetVerified === 'boolean' ? dc.targetVerified : undefined,
    };
  }

  return {
    status,
    provider: typeof v.provider === 'string' ? v.provider : undefined,
    simulatedAt: typeof v.simulatedAt === 'string' ? v.simulatedAt : undefined,
    chainStateBlock:
      typeof v.chainStateBlock === 'number' ? v.chainStateBlock : undefined,
    balanceChanges,
    decodedCall,
    warnings,
    revertReason:
      typeof v.revertReason === 'string' ? v.revertReason : undefined,
  };
}
