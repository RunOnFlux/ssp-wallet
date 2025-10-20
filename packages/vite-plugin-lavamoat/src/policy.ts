/**
 * LavaMoat Policy Management
 *
 * This module provides policy generation, loading, and enforcement
 * for LavaMoat security rules.
 */

import { promises as fs } from 'fs';
import { dirname, resolve } from 'path';
import {
  createModuleInspector,
  parseForPolicy,
  loadPolicy as loadLavaMoatPolicy,
  mergePolicy,
} from 'lavamoat-core';

// Dynamic import for LavamoatModuleRecord - will be loaded when needed
import type { PolicyRule, LavaMoatPolicy } from './compartment';

export interface PolicyGenerationOptions {
  /**
   * Base directory for the project
   */
  projectRoot: string;

  /**
   * Dependency information from package.json
   */
  dependencies: Record<string, string>;

  /**
   * Development dependencies
   */
  devDependencies?: Record<string, string>;

  /**
   * Modules to exclude from policy generation
   */
  excludeModules?: string[];

  /**
   * Enable diagnostics
   */
  diagnostics?: boolean;

  /**
   * Custom policy overrides
   */
  customPolicies?: Record<string, Partial<PolicyRule>>;
}

/**
 * Generate LavaMoat policy from project dependencies
 */
export async function generatePolicy(
  options: PolicyGenerationOptions,
): Promise<LavaMoatPolicy> {
  console.log(
    '📋 Generating LavaMoat policy with real lavamoat-core integration...',
  );

  try {
    // Use real LavaMoat's parseForPolicy to analyze the entire project
    // Start from the main entry point (typically src/main.tsx or similar)
    const entryPoint = resolve(options.projectRoot, 'src/main.tsx');
    const policy = await parseForPolicy({
      moduleSpecifier: entryPoint,
      importHook: async (moduleSpecifier: string, parentModuleRecord?: any) => {
        // Dynamically import LavamoatModuleRecord for ESM compatibility
        let LavamoatModuleRecord: any;
        try {
          const moduleRecord = await import(
            'lavamoat-core/src/moduleRecord.js' as any
          );
          LavamoatModuleRecord = moduleRecord.LavamoatModuleRecord;
        } catch {
          // Fallback if LavamoatModuleRecord is not available
          LavamoatModuleRecord = class {
            constructor(options: any) {
              Object.assign(this, options);
            }
          };
        }

        // Try to load the module
        try {
          let modulePath = moduleSpecifier;

          // Handle node_modules resolution
          if (
            !moduleSpecifier.startsWith('.') &&
            !moduleSpecifier.startsWith('/')
          ) {
            modulePath = resolve(
              options.projectRoot,
              'node_modules',
              moduleSpecifier,
            );
          } else if (parentModuleRecord) {
            modulePath = resolve(
              dirname(parentModuleRecord.file),
              moduleSpecifier,
            );
          }

          // Try to find the actual file with various extensions
          const extensions = [
            '',
            '.js',
            '.mjs',
            '.ts',
            '.tsx',
            '.json',
            '/index.js',
            '/index.ts',
            '/index.tsx',
            '/index.mjs',
            '/package.json',
          ];
          let content = '';
          let actualPath = '';

          for (const ext of extensions) {
            try {
              actualPath = modulePath + ext;

              if (ext === '/package.json') {
                const pkg = JSON.parse(await fs.readFile(actualPath, 'utf-8'));
                const main =
                  pkg.main ||
                  pkg.module ||
                  pkg.exports?.['.']?.import ||
                  pkg.exports?.['.']?.require ||
                  'index.js';
                actualPath = resolve(modulePath, main);
              }

              content = await fs.readFile(actualPath, 'utf-8');

              // If we successfully read the file, check if it's accessible
              if (content !== undefined) {
                break;
              }
            } catch {
              continue;
            }
          }

          if (content) {
            // Parse imports from the content to build importMap
            const importMap = parseImportsFromContent(
              content,
              actualPath,
              options.projectRoot,
            );

            return new LavamoatModuleRecord({
              specifier: moduleSpecifier,
              file: actualPath,
              content: content,
              type: actualPath.endsWith('.json') ? 'json' : 'js',
              packageName: extractPackageName(moduleSpecifier),
              importMap: importMap, // This is crucial for eachNodeInTree to work
            });
          }

          // If we can't find the file, return undefined to skip this module
          // This is what eachNodeInTree expects
          console.warn(`⚠️ Module not found, skipping: ${moduleSpecifier}`);
          return undefined;
        } catch (error) {
          console.warn(`⚠️ Could not load module ${moduleSpecifier}:`, error);

          // Return undefined to skip modules that can't be loaded
          return undefined;
        }
      },
      isBuiltin: (specifier: string) => {
        const builtins = [
          'fs',
          'path',
          'crypto',
          'buffer',
          'events',
          'util',
          'url',
          'stream',
          'http',
          'https',
          'querystring',
          'zlib',
          'os',
          'process',
          'assert',
        ];
        return builtins.includes(specifier);
      },
      includeDebugInfo: Boolean(options.diagnostics),
    });

    console.log(`✅ Real LavaMoat policy generated successfully`);
    return policy as LavaMoatPolicy;
  } catch (error) {
    console.error('❌ LavaMoat policy generation failed:', error);
    console.log('🔄 Falling back to simplified policy generation...');

    // Fallback to basic policy structure
    return await generateFallbackPolicy(options);
  }
}

/**
 * Extract package name from module specifier
 */
function extractPackageName(specifier: string): string {
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/');
    return parts.slice(0, 2).join('/');
  }
  return specifier.split('/')[0];
}

/**
 * Parse import statements from module content
 */
function parseImportsFromContent(
  content: string,
  filePath: string,
  projectRoot: string,
): Record<string, string> {
  const importMap: Record<string, string> = {};

  try {
    // Simple regex-based import parsing (this could be enhanced with proper AST parsing)
    const importPatterns = [
      // import ... from "..."
      /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?["']([^"']+)["']/g,
      // require("...")
      /require\s*\(\s*["']([^"']+)["']\s*\)/g,
      // dynamic import("...")
      /import\s*\(\s*["']([^"']+)["']\s*\)/g,
    ];

    for (const pattern of importPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const importSpecifier = match[1];

        // Skip empty or invalid imports
        if (
          !importSpecifier ||
          importSpecifier.includes('?') ||
          importSpecifier.includes('#')
        ) {
          continue;
        }

        // For relative imports, resolve them relative to the current file
        let resolvedSpecifier = importSpecifier;
        if (importSpecifier.startsWith('.')) {
          resolvedSpecifier = resolve(dirname(filePath), importSpecifier);
        }

        importMap[importSpecifier] = resolvedSpecifier;
      }
    }
  } catch (error) {
    console.warn(`⚠️ Failed to parse imports from ${filePath}:`, error);
  }

  return importMap;
}

/**
 * Generate policy for a specific package
 */
async function generatePackagePolicy(
  packageName: string,
  projectRoot: string,
  customOverrides?: Partial<PolicyRule>,
): Promise<PolicyRule> {
  // Try to read package.json for the dependency
  let packageInfo: any = {};
  try {
    const packageJsonPath = resolve(
      projectRoot,
      'node_modules',
      packageName,
      'package.json',
    );
    const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
    packageInfo = JSON.parse(packageJsonContent);
  } catch (error) {
    console.warn(`⚠️ Could not read package.json for ${packageName}`);
  }

  // Analyze package dependencies
  const dependencies = Object.keys(packageInfo.dependencies || {});

  // Determine safe globals based on package type
  const globals = determinePackageGlobals(packageName, packageInfo);

  // Determine allowed packages
  const packages: Record<string, boolean> = {};
  dependencies.forEach((dep) => {
    packages[dep] = true;
  });

  // Create base policy
  const basePolicy: PolicyRule = {
    packageName,
    globals,
    packages,
    builtins: determinePackageBuiltins(packageName, packageInfo),
  };

  // Apply custom overrides
  if (customOverrides) {
    return {
      ...basePolicy,
      ...customOverrides,
      globals: { ...basePolicy.globals, ...customOverrides.globals },
      packages: { ...basePolicy.packages, ...customOverrides.packages },
      builtins: { ...basePolicy.builtins, ...customOverrides.builtins },
    };
  }

  return basePolicy;
}

/**
 * Determine safe globals for a package
 */
function determinePackageGlobals(
  packageName: string,
  packageInfo: any,
): Record<string, boolean | 'write'> {
  const globals: Record<string, boolean | 'write'> = {
    // Always safe
    console: true,
    Array: true,
    Object: true,
    String: true,
    Number: true,
    Boolean: true,
    Date: true,
    RegExp: true,
    Error: true,
    Promise: true,
    JSON: true,
    Math: true,
  };

  // Browser-specific packages
  if (isBrowserPackage(packageName, packageInfo)) {
    Object.assign(globals, {
      document: true,
      window: true,
      location: true,
      navigator: true,
      localStorage: true,
      sessionStorage: true,
      setTimeout: true,
      setInterval: true,
      clearTimeout: true,
      clearInterval: true,
      requestAnimationFrame: true,
      cancelAnimationFrame: true,
      XMLHttpRequest: true,
      fetch: true,
    });
  }

  // React-specific packages
  if (isReactPackage(packageName)) {
    Object.assign(globals, {
      React: true,
      ReactDOM: true,
    });
  }

  // Crypto packages
  if (isCryptoPackage(packageName)) {
    Object.assign(globals, {
      crypto: true,
      Buffer: true,
    });
  }

  // Utility packages typically need minimal globals
  if (isUtilityPackage(packageName)) {
    // Keep only the base globals
  }

  return globals;
}

/**
 * Determine allowed built-ins for a package
 */
function determinePackageBuiltins(
  packageName: string,
  packageInfo: any,
): Record<string, boolean> {
  const builtins: Record<string, boolean> = {
    // Generally safe
    path: true,
    url: true,
    util: true,
    events: true,
    crypto: true,
    buffer: true,
  };

  // Dangerous built-ins blocked by default
  const dangerousBuiltins = {
    fs: false,
    child_process: false,
    os: false,
    cluster: false,
    worker_threads: false,
    vm: false,
    module: false,
    process: false, // Restrict process access
  };

  Object.assign(builtins, dangerousBuiltins);

  // Some packages may legitimately need specific built-ins
  if (isNodeUtilityPackage(packageName)) {
    builtins['process'] = true; // Allow process for legitimate utility packages
  }

  return builtins;
}

/**
 * Package type detection helpers
 */
function isBrowserPackage(packageName: string, packageInfo: any): boolean {
  const browserKeywords = [
    'dom',
    'browser',
    'client',
    'frontend',
    'ui',
    'react',
    'vue',
    'angular',
  ];
  const packageKeywords = packageInfo.keywords || [];

  return browserKeywords.some(
    (keyword) =>
      packageName.includes(keyword) ||
      packageKeywords.includes(keyword) ||
      packageInfo.description?.toLowerCase().includes(keyword),
  );
}

function isReactPackage(packageName: string): boolean {
  return (
    packageName.startsWith('react') ||
    packageName.includes('react') ||
    packageName.startsWith('@react')
  );
}

function isCryptoPackage(packageName: string): boolean {
  const cryptoKeywords = [
    'crypto',
    'hash',
    'cipher',
    'encrypt',
    'decrypt',
    'sign',
    'verify',
  ];
  return cryptoKeywords.some((keyword) => packageName.includes(keyword));
}

function isUtilityPackage(packageName: string): boolean {
  const utilityKeywords = ['util', 'helper', 'tool', 'lib', 'core'];
  return utilityKeywords.some((keyword) => packageName.includes(keyword));
}

function isNodeUtilityPackage(packageName: string): boolean {
  const nodeUtilityPackages = [
    'chalk',
    'debug',
    'minimist',
    'commander',
    'inquirer',
  ];
  return nodeUtilityPackages.includes(packageName);
}

/**
 * Create minimal safe policy for unknown packages
 */
function createMinimalPolicy(packageName: string): PolicyRule {
  return {
    packageName,
    globals: {
      console: true,
      Array: true,
      Object: true,
      String: true,
      Number: true,
      Boolean: true,
      Date: true,
      RegExp: true,
      Error: true,
      Promise: true,
      JSON: true,
      Math: true,
    },
    packages: {},
    builtins: {
      path: true,
      url: true,
      fs: false,
      child_process: false,
      os: false,
    },
  };
}

/**
 * Create policy for application entry point
 */
function createEntryPointPolicy(): PolicyRule {
  return {
    packageName: '<entry>',
    globals: {
      // Full browser API access for main application
      console: 'write',
      document: 'write',
      window: 'write',
      location: 'write',
      navigator: true,
      localStorage: 'write',
      sessionStorage: 'write',
      setTimeout: true,
      setInterval: true,
      clearTimeout: true,
      clearInterval: true,
      requestAnimationFrame: true,
      cancelAnimationFrame: true,
      XMLHttpRequest: true,
      fetch: true,
      Array: true,
      Object: true,
      String: true,
      Number: true,
      Boolean: true,
      Date: true,
      RegExp: true,
      Error: true,
      Promise: true,
      JSON: true,
      Math: true,
      crypto: true,
      Buffer: true,
    },
    packages: {}, // Entry point can import any package
    builtins: {
      path: true,
      url: true,
      crypto: true,
      buffer: true,
      fs: false,
      child_process: false,
      os: false,
    },
  };
}

/**
 * Load policy from file
 */
/**
 * Fallback policy generation when LavaMoat fails
 */
async function generateFallbackPolicy(
  options: PolicyGenerationOptions,
): Promise<LavaMoatPolicy> {
  // Keep the existing fallback logic for now
  const policy: LavaMoatPolicy = {
    resources: {},
  };

  const allDependencies = {
    ...options.dependencies,
    ...(options.devDependencies || {}),
  };

  // Simple fallback policy
  for (const [packageName] of Object.entries(allDependencies)) {
    policy.resources[packageName] = {
      packageName,
      globals: {
        console: true,
        Object: true,
        Array: true,
      },
      packages: {},
      builtins: {},
    };
  }

  return policy;
}

export async function loadPolicy(policyPath: string): Promise<LavaMoatPolicy> {
  try {
    console.log(`📖 Loading policy from: ${policyPath}`);

    const policyContent = await fs.readFile(policyPath, 'utf-8');
    const policy = JSON.parse(policyContent) as LavaMoatPolicy;

    console.log(
      `✅ Policy loaded with ${Object.keys(policy.resources).length} resources`,
    );
    return policy;
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      console.log('📋 No existing policy found, will generate new one');
      throw new Error('Policy file not found');
    }

    console.error('❌ Failed to load policy:', error);
    throw new Error(`Policy loading failed: ${error}`);
  }
}

/**
 * Save policy to file
 */
export async function savePolicy(
  policy: LavaMoatPolicy,
  policyPath: string,
): Promise<void> {
  try {
    console.log(`💾 Saving policy to: ${policyPath}`);

    // Ensure directory exists
    await fs.mkdir(dirname(policyPath), { recursive: true });

    // Write policy with nice formatting
    const policyContent = JSON.stringify(policy, null, 2);
    await fs.writeFile(policyPath, policyContent, 'utf-8');

    console.log(
      `✅ Policy saved with ${Object.keys(policy.resources).length} resources`,
    );
  } catch (error) {
    console.error('❌ Failed to save policy:', error);
    throw new Error(`Policy saving failed: ${error}`);
  }
}

/**
 * Merge two policies using lavamoat-core's mergePolicy
 */
export function mergePolicies(
  base: LavaMoatPolicy,
  override: LavaMoatPolicy,
): LavaMoatPolicy {
  console.log('🔄 Merging policies...');
  const merged = mergePolicy(base, override);
  console.log('✅ Policies merged successfully');
  return merged as LavaMoatPolicy;
}

/**
 * Validate policy structure
 */
export function validatePolicy(policy: LavaMoatPolicy): boolean {
  try {
    if (!policy.resources || typeof policy.resources !== 'object') {
      throw new Error('Policy must have resources object');
    }

    for (const [packageName, rule] of Object.entries(policy.resources)) {
      if (!rule.packageName) {
        throw new Error(`Resource ${packageName} missing packageName`);
      }

      if (rule.globals && typeof rule.globals !== 'object') {
        throw new Error(`Resource ${packageName} has invalid globals`);
      }

      if (rule.packages && typeof rule.packages !== 'object') {
        throw new Error(`Resource ${packageName} has invalid packages`);
      }

      if (rule.builtins && typeof rule.builtins !== 'object') {
        throw new Error(`Resource ${packageName} has invalid builtins`);
      }
    }

    console.log('✅ Policy validation passed');
    return true;
  } catch (error) {
    console.error('❌ Policy validation failed:', error);
    return false;
  }
}
