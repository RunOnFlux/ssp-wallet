/**
 * Derive a LavaMoat policy from the modules that actually end up in the
 * Rollup graph, using LavaMoat's own static analyser (lavamoat-core's
 * `createModuleInspector`, which uses lavamoat-tofu / Babel).
 *
 * Input is the post-transform code of every module (what the bundle really
 * contains, after commonjs conversion and polyfill injection), so the policy
 * describes the shipped code rather than a guess from package.json.
 */

import { createModuleInspector, LavamoatModuleRecord } from 'lavamoat-core';
import {
  cleanModuleId,
  packageNameFromPath,
  type LavaMoatPolicy,
  type ResourcePolicy,
} from './policy';

export interface GraphModule {
  /** Rollup module id (may carry a `\0` prefix or `?query`). */
  id: string;
  /** Post-transform source code, or null for externals/virtual modules. */
  code: string | null;
  importedIds: readonly string[];
  dynamicallyImportedIds?: readonly string[];
}

export interface ObservedPolicy {
  policy: LavaMoatPolicy;
  /** Packages whose code assigns to primordials (breaks under SES). */
  sesIncompatible: Record<string, number>;
  modulesInspected: number;
}

interface CompatWarningEvent {
  moduleRecord: { packageName: string };
  compatWarnings: { primordialMutations: unknown[] };
}

interface Inspector {
  inspectModule(record: unknown, opts?: Record<string, unknown>): void;
  generatePolicy(opts: Record<string, unknown>): {
    resources: Record<string, ResourcePolicy>;
  };
  on(event: 'compat-warning', cb: (e: CompatWarningEvent) => void): void;
}

const JS_FILE = /\.(c|m)?(j|t)sx?$/;

export function observePolicy(modules: Iterable<GraphModule>): ObservedPolicy {
  const inspector = createModuleInspector({
    isBuiltin: () => false,
    includeDebugInfo: false,
  }) as unknown as Inspector;

  const sesIncompatible: Record<string, number> = {};
  inspector.on('compat-warning', ({ moduleRecord, compatWarnings }) => {
    const n = compatWarnings.primordialMutations.length;
    if (n > 0) {
      sesIncompatible[moduleRecord.packageName] =
        (sesIncompatible[moduleRecord.packageName] ?? 0) + n;
    }
  });

  let modulesInspected = 0;
  for (const mod of modules) {
    const file = cleanModuleId(mod.id);
    const packageName = packageNameFromPath(file);
    if (!packageName || mod.code == null || !JS_FILE.test(file)) continue;

    const importMap: Record<string, string> = {};
    for (const dep of [
      ...mod.importedIds,
      ...(mod.dynamicallyImportedIds ?? []),
    ]) {
      const depFile = cleanModuleId(dep);
      if (packageNameFromPath(depFile)) importMap[depFile] = depFile;
    }

    inspector.inspectModule(
      new LavamoatModuleRecord({
        specifier: mod.id,
        file,
        type: 'js',
        packageName,
        content: mod.code,
        importMap,
      }),
    );
    modulesInspected += 1;
  }

  const generated = inspector.generatePolicy({
    moduleToPackageFallback: (requested: string) =>
      packageNameFromPath(requested),
  });

  // Keep only the fields this project reviews; drop empty entries.
  const resources: Record<string, ResourcePolicy> = {};
  for (const [name, entry] of Object.entries(generated.resources)) {
    const out: ResourcePolicy = {};
    if (entry.globals && Object.keys(entry.globals).length) {
      out.globals = entry.globals;
    }
    if (entry.packages && Object.keys(entry.packages).length) {
      out.packages = entry.packages;
    }
    if (entry.builtin && Object.keys(entry.builtin).length) {
      out.builtin = entry.builtin;
    }
    if (entry.native) out.native = true;
    if (Object.keys(out).length) resources[name] = out;
  }

  return { policy: { resources }, sesIncompatible, modulesInspected };
}
