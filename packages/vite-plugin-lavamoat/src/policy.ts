/**
 * LavaMoat policy model plus the build-time comparison between the policy
 * observed in the bundle and the committed, reviewed policy.
 *
 * The format is LavaMoat's (`resources[pkg].globals|packages|builtin`), so the
 * committed file reads like any LavaMoat policy. Values follow LavaMoat:
 * `true` = read access, `'write'` = may assign.
 */

export type GlobalPermission = true | 'write' | false;

export interface ResourcePolicy {
  globals?: Record<string, GlobalPermission>;
  packages?: Record<string, boolean>;
  builtin?: Record<string, boolean>;
  native?: boolean;
}

export interface LavaMoatPolicy {
  resources: Record<string, ResourcePolicy>;
}

export type PolicyViolationKind = 'package' | 'global' | 'dependency';

export interface PolicyViolation {
  kind: PolicyViolationKind;
  packageName: string;
  /** global path (e.g. `chrome.storage`) or dependency package name */
  item?: string;
  /** permission that was observed */
  observed?: GlobalPermission;
}

/**
 * Turn a Rollup/Vite module id into the path it points at: drop the `\0`
 * virtual prefix and any `?query` suffix (commonjs proxies, `?inline`, ...).
 */
export function cleanModuleId(id: string): string {
  return id.replace(/^\0+/, '').replace(/[?#].*$/, '');
}

/**
 * Package name for a module path, from its node_modules location. Nested
 * copies are named LavaMoat-style with `>` (e.g. `@solana/web3.js>bn.js`), so
 * two installed copies of a package never share one policy entry. Returns
 * undefined for first-party code and virtual modules.
 */
export function packageNameFromPath(path: string): string | undefined {
  const normalized = cleanModuleId(path).replace(/\\/g, '/');
  const parts = normalized.split('/node_modules/');
  if (parts.length < 2) return undefined;
  const names: string[] = [];
  for (const segment of parts.slice(1)) {
    const bits = segment.split('/');
    if (!bits[0] || bits[0].startsWith('.')) return undefined;
    if (bits[0].startsWith('@')) {
      if (!bits[1]) return undefined;
      names.push(`${bits[0]}/${bits[1]}`);
    } else {
      names.push(bits[0]);
    }
  }
  return names.join('>');
}

/**
 * Is an observed access to `path` with permission `value` allowed by the
 * committed globals? A grant on a prefix covers everything below it
 * (`chrome` covers `chrome.storage.local.get`). `'write'` needs `'write'`.
 */
export function isGlobalCovered(
  path: string,
  value: GlobalPermission,
  committed: Record<string, GlobalPermission> | undefined,
): boolean {
  if (value === false) return true;
  if (!committed) return false;
  const parts = path.split('.');
  for (let i = parts.length; i > 0; i -= 1) {
    const grant = committed[parts.slice(0, i).join('.')];
    if (grant === 'write') return true;
    if (grant === true && value !== 'write') return true;
  }
  return false;
}

/**
 * Everything the bundle does that the committed policy does not allow.
 * An empty array means the build may proceed.
 */
export function findPolicyViolations(
  observed: LavaMoatPolicy,
  committed: LavaMoatPolicy,
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  for (const packageName of Object.keys(observed.resources).sort()) {
    const seen = observed.resources[packageName];
    const allowed = committed.resources[packageName];
    if (!allowed) {
      violations.push({ kind: 'package', packageName });
      continue;
    }
    for (const [path, value] of Object.entries(seen.globals ?? {})) {
      if (!isGlobalCovered(path, value, allowed.globals)) {
        violations.push({
          kind: 'global',
          packageName,
          item: path,
          observed: value,
        });
      }
    }
    for (const dep of Object.keys(seen.packages ?? {})) {
      if (!allowed.packages?.[dep]) {
        violations.push({ kind: 'dependency', packageName, item: dep });
      }
    }
  }
  return violations;
}

/** Committed entries the bundle no longer contains (informational only). */
export function findStaleResources(
  observed: LavaMoatPolicy,
  committed: LavaMoatPolicy,
): string[] {
  return Object.keys(committed.resources)
    .filter((name) => !observed.resources[name])
    .sort();
}

export function formatViolations(violations: PolicyViolation[]): string {
  return violations
    .map((v) => {
      if (v.kind === 'package') {
        return `  - new package in the bundle, not in the policy: ${v.packageName}`;
      }
      if (v.kind === 'global') {
        const mode = v.observed === 'write' ? ' (write)' : '';
        return `  - ${v.packageName} uses global "${v.item}"${mode}, not granted`;
      }
      return `  - ${v.packageName} imports package ${v.item}, not granted`;
    })
    .join('\n');
}

/** Shape check so a hand-edited or truncated policy fails loudly. */
export function validatePolicy(policy: unknown): policy is LavaMoatPolicy {
  if (!policy || typeof policy !== 'object') return false;
  const resources = (policy as { resources?: unknown }).resources;
  if (!resources || typeof resources !== 'object' || Array.isArray(resources)) {
    return false;
  }
  for (const entry of Object.values(resources as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return false;
    }
    const { globals, packages } = entry as ResourcePolicy;
    for (const map of [globals, packages]) {
      if (map === undefined) continue;
      if (!map || typeof map !== 'object' || Array.isArray(map)) return false;
      for (const value of Object.values(map)) {
        if (value !== true && value !== false && value !== 'write') {
          return false;
        }
      }
    }
  }
  return true;
}

/** Deterministic JSON (sorted keys at every level) with a trailing newline. */
export function stringifyPolicy(policy: LavaMoatPolicy): string {
  const sort = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sort);
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(value as object).sort()) {
        out[key] = sort((value as Record<string, unknown>)[key]);
      }
      return out;
    }
    return value;
  };
  return `${JSON.stringify(sort(policy), null, 2)}\n`;
}
