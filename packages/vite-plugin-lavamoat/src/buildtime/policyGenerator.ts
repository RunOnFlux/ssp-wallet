/**
 * LavaMoat Policy Generation - Buildtime Component
 */

import { promises as fs } from 'fs';
import { dirname, resolve } from 'path';
import {
  parseForPolicy,
  loadPolicy as loadLavaMoatPolicy,
} from 'lavamoat-core';

// Dynamic import for LavamoatModuleRecord - will be loaded when needed
import { createModulePathResolver, type ModulePathResolver } from './aa';
import type { PolicyRule, LavaMoatPolicy } from '../compartment';

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
 * Generate LavaMoat policy using proper buildtime architecture
 */
export async function generatePolicy(
  options: PolicyGenerationOptions,
): Promise<LavaMoatPolicy> {
  console.log(
    '📋 Generating LavaMoat policy with proper buildtime architecture...',
  );

  try {
    // Create module path resolver using @lavamoat/aa
    const pathResolver = await createModulePathResolver(options.projectRoot);

    // Find the main entry point
    const entryPoint = await findEntryPoint(options.projectRoot);
    console.log(`🎯 Using entry point: ${entryPoint}`);

    // Use real LavaMoat's parseForPolicy with proper importHook
    const policy = await parseForPolicy({
      moduleSpecifier: entryPoint,
      importHook: createImportHook(pathResolver, options.projectRoot),
      isBuiltin: createBuiltinChecker(),
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
 * Find the main entry point for the application
 */
async function findEntryPoint(projectRoot: string): Promise<string> {
  const possibleEntries = [
    'src/main.tsx',
    'src/main.ts',
    'src/index.tsx',
    'src/index.ts',
    'index.html',
  ];

  for (const entry of possibleEntries) {
    const entryPath = resolve(projectRoot, entry);
    try {
      await fs.access(entryPath);
      return entryPath;
    } catch {
      continue;
    }
  }

  throw new Error('Could not find application entry point');
}

/**
 * Create importHook using @lavamoat/aa path resolver
 */
function createImportHook(
  pathResolver: ModulePathResolver,
  projectRoot: string,
) {
  // Cache the LavamoatModuleRecord class for reuse
  let LavamoatModuleRecordClass: any = null;

  const getLavamoatModuleRecord = async () => {
    if (LavamoatModuleRecordClass) {
      return LavamoatModuleRecordClass;
    }

    try {
      const moduleRecord = await import(
        'lavamoat-core/src/moduleRecord.js' as any
      );
      LavamoatModuleRecordClass = moduleRecord.LavamoatModuleRecord;
    } catch {
      // Fallback if LavamoatModuleRecord is not available
      LavamoatModuleRecordClass = class {
        constructor(options: any) {
          Object.assign(this, options);
        }
      };
    }

    return LavamoatModuleRecordClass;
  };

  return async (moduleSpecifier: string, parentModuleRecord?: any) => {
    const LavamoatModuleRecord = await getLavamoatModuleRecord();
    try {
      // Resolve the module path
      const parentPath = parentModuleRecord?.file;
      let modulePath = pathResolver.resolveModulePath(
        moduleSpecifier,
        parentPath,
      );

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

          if (content !== undefined) {
            break;
          }
        } catch {
          continue;
        }
      }

      if (content) {
        // Parse imports from the content to build importMap
        const importMap = parseImportsFromContent(content, actualPath);

        // Use @lavamoat/aa to get the proper package name
        const packageName = pathResolver.getPackageName(actualPath);

        return new LavamoatModuleRecord({
          specifier: moduleSpecifier,
          file: actualPath,
          content: content,
          type: actualPath.endsWith('.json')
            ? ('json' as const)
            : ('js' as const),
          packageName: packageName,
          importMap: importMap,
        });
      }

      // Return undefined to skip unresolvable modules
      console.warn(`⚠️ Module not found, skipping: ${moduleSpecifier}`);
      return undefined;
    } catch (error) {
      console.warn(`⚠️ Could not load module ${moduleSpecifier}:`, error);
      return undefined;
    }
  };
}

/**
 * Create builtin checker function
 */
function createBuiltinChecker() {
  return (specifier: string): boolean => {
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
  };
}

/**
 * Parse import statements from module content
 */
function parseImportsFromContent(
  content: string,
  filePath: string,
): Record<string, string> {
  const importMap: Record<string, string> = {};

  try {
    const importPatterns = [
      /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?["']([^"']+)["']/g,
      /require\s*\(\s*["']([^"']+)["']\s*\)/g,
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
 * Fallback policy generation when LavaMoat fails
 */
async function generateFallbackPolicy(
  options: PolicyGenerationOptions,
): Promise<LavaMoatPolicy> {
  const policy: LavaMoatPolicy = {
    resources: {},
  };

  const allDependencies = {
    ...options.dependencies,
    ...(options.devDependencies || {}),
  };

  // Enhanced policy generation with package-specific permissions following principle of least privilege
  console.log(`🔧 Generating policies for ${Object.keys(allDependencies).length} packages`);
  
  for (const [packageName] of Object.entries(allDependencies)) {
    const globals = getPackageSpecificGlobals(packageName);
    const packages = getPackageSpecificPackages(packageName);
    const builtins = getPackageSpecificBuiltins(packageName);
    
    console.log(`📦 ${packageName}: ${Object.keys(globals).length} globals, crypto: ${globals.crypto || false}`);
    
    policy.resources[packageName] = {
      packageName,
      globals,
      packages,
      builtins,
    };
  }

  return policy;
}

/**
 * Get package-specific global permissions following STRICT principle of least privilege
 * Each package gets ONLY the globals it absolutely needs to function
 */
function getPackageSpecificGlobals(packageName: string): Record<string, boolean> {
  // Minimal base - only the most essential JavaScript primitives
  const minimalBase = {
    console: true,    // Essential for debugging/logging
    Object: true,     // Core JavaScript object operations
    Array: true,      // Core JavaScript array operations
    Error: true,      // Error handling
    TypeError: true,  // Type error handling
  };

  // STRICT CRYPTO PACKAGES - Only essential crypto APIs
  const cryptoPackages: Record<string, Record<string, boolean>> = {
    '@scure/bip32': {
      ...minimalBase,
      crypto: true,        // WebCrypto for cryptographic operations
      Math: true,          // Mathematical operations
      Uint8Array: true,    // Byte array operations
      ArrayBuffer: true,   // Buffer operations for crypto
      BigInt: true,        // Large number operations
    },
    '@scure/bip39': {
      ...minimalBase,
      crypto: true,
      Math: true,
      Uint8Array: true,
      ArrayBuffer: true,
      String: true,        // String operations for mnemonic words
    },
    'viem': {
      ...minimalBase,
      crypto: true,        // WebCrypto for signing/hashing
      Math: true,          // Mathematical operations
      String: true,        // String operations
      Number: true,        // Number operations
      Boolean: true,       // Boolean operations
      Promise: true,       // Async operations
      Uint8Array: true,    // Byte arrays
      ArrayBuffer: true,   // Buffers
      BigInt: true,        // Large integers for blockchain
      JSON: true,          // JSON parsing for RPC
      encodeURIComponent: true,  // URL encoding
      decodeURIComponent: true,  // URL decoding
    },
    '@alchemy/aa-core': {
      ...minimalBase,
      crypto: true,
      Math: true,
      String: true,
      Number: true,
      Boolean: true,
      Promise: true,
      Uint8Array: true,
      ArrayBuffer: true,
      BigInt: true,
      JSON: true,
    },
    '@runonflux/aa-schnorr-multisig-sdk': {
      ...minimalBase,
      crypto: true,
      Math: true,
      Uint8Array: true,
      ArrayBuffer: true,
      BigInt: true,
      String: true,
    },
    'crypto-browserify': {
      ...minimalBase,
      crypto: true,
      Math: true,
      Uint8Array: true,
      ArrayBuffer: true,
      String: true,
      Number: true,
    },
    '@runonflux/utxo-lib': {
      ...minimalBase,
      crypto: true,
      Math: true,
      Uint8Array: true,
      ArrayBuffer: true,
      BigInt: true,
      String: true,
      Number: true,
    },
    'bchaddrjs': {
      ...minimalBase,
      crypto: true,
      String: true,
      Math: true,
    },
  };

  if (cryptoPackages[packageName]) {
    console.log(`🔐 STRICT: Crypto package ${packageName} - minimal crypto permissions`);
    return cryptoPackages[packageName];
  }

  // STRICT UI/REACT PACKAGES - Only what React actually needs
  const uiPackages: Record<string, Record<string, boolean>> = {
    'react': {
      ...minimalBase,
      String: true,
      Number: true,
      Boolean: true,
      Symbol: true,        // React uses symbols for element types
      Promise: true,       // For suspense/async components
    },
    'react-dom': {
      ...minimalBase,
      String: true,
      Number: true,
      Boolean: true,
      Symbol: true,
      Promise: true,
    },
    'antd': {
      ...minimalBase,
      String: true,
      Number: true,
      Boolean: true,
      Date: true,          // Date components
      Math: true,          // Mathematical calculations
      JSON: true,          // Configuration parsing
      parseInt: true,      // Number parsing
      parseFloat: true,    // Float parsing
      isNaN: true,         // Validation
      RegExp: true,        // Pattern matching
      Promise: true,       // Async operations
    },
  };

  if (uiPackages[packageName] || packageName.startsWith('@ant-design/')) {
    console.log(`🎨 STRICT: UI package ${packageName} - minimal UI permissions`);
    return uiPackages[packageName] || uiPackages['antd']; // Fallback for @ant-design packages
  }

  // STRICT UTILITY PACKAGES - Absolute minimum needed
  const utilityPackages: Record<string, Record<string, boolean>> = {
    'axios': {
      ...minimalBase,
      Promise: true,       // HTTP promises
      JSON: true,          // Response parsing
      String: true,        // URL handling
      encodeURIComponent: true,  // URL encoding
      decodeURIComponent: true,  // URL decoding
    },
    'localforage': {
      ...minimalBase,
      Promise: true,       // Async storage
      JSON: true,          // Data serialization
      String: true,        // Key operations
    },
    'i18next': {
      ...minimalBase,
      String: true,        // String interpolation
      JSON: true,          // Translation files
      RegExp: true,        // Pattern matching
      Promise: true,       // Async loading
    },
    'bignumber.js': {
      ...minimalBase,
      String: true,        // Number string parsing
      Number: true,        // Number operations
      Math: true,          // Mathematical operations
      parseInt: true,      // Integer parsing
      parseFloat: true,    // Float parsing
      isNaN: true,         // Validation
      isFinite: true,      // Validation
    },
  };

  if (utilityPackages[packageName]) {
    console.log(`🔧 STRICT: Utility package ${packageName} - minimal utility permissions`);
    return utilityPackages[packageName];
  }

  // ABSOLUTE MINIMUM for unknown packages
  console.log(`⚠️ STRICT: Unknown package ${packageName} - absolute minimum permissions`);
  return minimalBase;
}

/**
 * Get package-specific package dependencies
 */
function getPackageSpecificPackages(packageName: string): Record<string, boolean> {
  // Define common package relationships
  if (packageName === 'react-dom') {
    return { 'react': true };
  }
  if (packageName === 'react-redux') {
    return { 'react': true };
  }
  if (packageName === 'react-i18next') {
    return { 'react': true, 'i18next': true };
  }
  if (packageName === '@ant-design/icons') {
    return { 'antd': true };
  }
  
  return {};
}

/**
 * Get package-specific builtin module access
 */
function getPackageSpecificBuiltins(packageName: string): Record<string, boolean> {
  // Packages that need Node.js builtin access
  const nodeBuiltinPackages = ['buffer', 'crypto-browserify', 'stream-browserify', 'process'];
  
  if (nodeBuiltinPackages.some(pkg => packageName.includes(pkg) || packageName === pkg)) {
    return {
      'buffer': true,
      'crypto': true,
      'stream': true,
      'events': true,
      'util': true,
    };
  }

  return {};
}

/**
 * Load policy from file
 */
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
