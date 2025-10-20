/**
 * Module path resolution using @lavamoat/aa
 */

import {
  getPackageNameForModulePath,
  loadCanonicalNameMap,
} from '@lavamoat/aa';
import type { CanonicalNameMap } from '@lavamoat/aa';
import { resolve } from 'path';

export interface ModulePathResolver {
  getPackageName(modulePath: string): string;
  resolveModulePath(specifier: string, parentPath?: string): string;
}

/**
 * Create module path resolver using @lavamoat/aa
 */
export async function createModulePathResolver(
  projectRoot: string,
): Promise<ModulePathResolver> {
  // Load canonical name map from the project
  const canonicalNameMap = await loadCanonicalNameMap({
    rootDir: projectRoot,
    includeDevDeps: true,
  });

  return {
    getPackageName(modulePath: string): string {
      try {
        return getPackageNameForModulePath(canonicalNameMap, modulePath);
      } catch (error) {
        console.warn(
          `⚠️ Could not resolve package name for ${modulePath}:`,
          error,
        );
        // Fallback to extracting package name from path
        return extractPackageNameFromPath(modulePath);
      }
    },

    resolveModulePath(specifier: string, parentPath?: string): string {
      // Handle relative imports
      if (specifier.startsWith('.') && parentPath) {
        return resolve(parentPath, '..', specifier);
      }

      // Handle absolute node_modules paths
      if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
        return resolve(projectRoot, 'node_modules', specifier);
      }

      return specifier;
    },
  };
}

/**
 * Fallback function to extract package name from module path
 */
function extractPackageNameFromPath(modulePath: string): string {
  const parts = modulePath.split('/');
  const nodeModulesIndex = parts.lastIndexOf('node_modules');

  if (nodeModulesIndex !== -1 && nodeModulesIndex + 1 < parts.length) {
    const packagePart = parts[nodeModulesIndex + 1];

    // Handle scoped packages
    if (packagePart.startsWith('@') && nodeModulesIndex + 2 < parts.length) {
      return `${packagePart}/${parts[nodeModulesIndex + 2]}`;
    }

    return packagePart;
  }

  // Fallback for non-node_modules paths
  if (parts.length > 0) {
    return parts[parts.length - 1] || 'unknown';
  }

  return 'unknown';
}

export type { CanonicalNameMap };
