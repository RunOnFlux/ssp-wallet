/**
 * LavaMoat Compartment Implementation
 *
 * This module provides compartmentalization functionality to isolate
 * modules in secure sandboxes with policy-based access control.
 */

// Define compartment interface for type safety
interface ICompartment {
  evaluate(code: string, options?: any): any;
}

// SES Compartment import - handle different export patterns
let CompartmentClass: new (options?: any) => ICompartment;
try {
  const sesModule = require('ses');
  CompartmentClass = sesModule.Compartment || sesModule.default?.Compartment;
} catch (error) {
  // Fallback compartment implementation
  CompartmentClass = class FallbackCompartment implements ICompartment {
    private globals: Record<string, any>;
    private transforms: Array<(source: string) => string>;

    constructor(options: any = {}) {
      this.globals = options.globals || {};
      this.transforms = options.transforms || [];
    }

    evaluate(code: string, options: any = {}) {
      console.warn('Using fallback compartment - limited security isolation');

      // Simple eval with limited globals
      const func = new Function(...Object.keys(this.globals), code);
      return func(...Object.values(this.globals));
    }
  };
}

// Export the class for use
const Compartment = CompartmentClass;

export interface CompartmentOptions {
  /**
   * Module name for identification
   */
  name: string;

  /**
   * Allowed globals for this compartment
   */
  globals?: Record<string, any>;

  /**
   * Module transform functions
   */
  transforms?: Array<(source: string) => string>;

  /**
   * Import resolution function
   */
  resolveHook?: (specifier: string, referrer?: string) => string;

  /**
   * Module import function
   */
  importHook?: (specifier: string) => Promise<any>;
}

export interface PolicyRule {
  /**
   * Package name this rule applies to
   */
  packageName: string;

  /**
   * Allowed globals
   */
  globals?: Record<string, boolean | 'write'>;

  /**
   * Allowed built-ins
   */
  builtins?: Record<string, boolean>;

  /**
   * Allowed packages to import
   */
  packages?: Record<string, boolean>;
}

export interface LavaMoatPolicy {
  /**
   * Resources (packages) and their permissions
   */
  resources: Record<string, PolicyRule>;

  /**
   * Version of the policy format
   */
  version?: string;
}

/**
 * Create a secure compartment for a module
 */
export function createSecureCompartment(
  options: CompartmentOptions,
): ICompartment {
  try {
    console.log(`🏗️ Creating compartment for: ${options.name}`);

    const compartment = new Compartment({
      // Provide minimal globals needed for the module
      globals: {
        // Essential for module system
        console: console,

        // Timing functions (safe subset)
        setTimeout: globalThis.setTimeout,
        setInterval: globalThis.setInterval,
        clearTimeout: globalThis.clearTimeout,
        clearInterval: globalThis.clearInterval,

        // Safe built-ins
        Array: globalThis.Array,
        Object: globalThis.Object,
        String: globalThis.String,
        Number: globalThis.Number,
        Boolean: globalThis.Boolean,
        Date: globalThis.Date,
        RegExp: globalThis.RegExp,
        Error: globalThis.Error,
        Promise: globalThis.Promise,
        JSON: globalThis.JSON,
        Math: globalThis.Math,

        // Custom globals for this module
        ...options.globals,
      },

      // Module resolution
      resolveHook:
        options.resolveHook ||
        ((specifier: string) => {
          // Default resolution logic
          if (specifier.startsWith('./') || specifier.startsWith('../')) {
            return specifier;
          }
          return specifier;
        }),

      // Module import
      importHook:
        options.importHook ||
        (async (specifier: string) => {
          // Default import logic - this would be replaced by Vite's module system
          throw new Error(
            `Module import not allowed in compartment: ${specifier}`,
          );
        }),

      // Module transforms
      transforms: options.transforms || [],
    });

    console.log(`✅ Compartment created for: ${options.name}`);
    return compartment;
  } catch (error) {
    console.error(
      `❌ Failed to create compartment for ${options.name}:`,
      error,
    );
    throw new Error(`Compartment creation failed: ${error}`);
  }
}

/**
 * Execute code in a secure compartment
 */
export async function executeInCompartment(
  compartment: ICompartment,
  code: string,
  filename?: string,
): Promise<any> {
  try {
    console.log(`🚀 Executing code in compartment: ${filename || 'anonymous'}`);

    // Execute the code in the compartment
    const result = compartment.evaluate(code, {
      // Add source information for debugging
      ...(filename && { filename }),
    });

    console.log(
      `✅ Code executed successfully in compartment: ${filename || 'anonymous'}`,
    );
    return result;
  } catch (error) {
    console.error(
      `❌ Code execution failed in compartment: ${filename || 'anonymous'}`,
      error,
    );
    throw new Error(`Compartment execution failed: ${error}`);
  }
}

/**
 * Wrap module code for compartment execution
 */
export function wrapModuleForCompartment(
  code: string,
  moduleName: string,
  policy?: PolicyRule,
): string {
  // Analyze policy to determine allowed globals
  const allowedGlobals = policy?.globals || {};

  // Create globals whitelist
  const globalsCheck = Object.keys(allowedGlobals)
    .map(
      (globalName) =>
        `  ${globalName}: ${allowedGlobals[globalName] === 'write' ? 'globalThis.' + globalName : 'globalThis.' + globalName}`,
    )
    .join(',\n');

  const wrappedCode = `
// LavaMoat Compartment Wrapper for: ${moduleName}
(function(compartmentGlobals) {
  'use strict';
  
  // Policy-enforced globals
  const allowedGlobals = {
${globalsCheck}
  };
  
  // Apply allowed globals to local scope
  Object.keys(allowedGlobals).forEach(key => {
    if (typeof allowedGlobals[key] !== 'undefined') {
      globalThis[key] = allowedGlobals[key];
    }
  });
  
  // Original module code
  ${code}
  
})(this);
`;

  return wrappedCode;
}

/**
 * Generate default policy for a module
 */
export function generateDefaultPolicy(
  moduleName: string,
  dependencies: string[],
): PolicyRule {
  // Basic safe globals that most modules need
  const safeGlobals: Record<string, boolean | 'write'> = {
    console: true,
    setTimeout: true,
    setInterval: true,
    clearTimeout: true,
    clearInterval: true,
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

  // Allow access to dependencies
  const allowedPackages: Record<string, boolean> = {};
  dependencies.forEach((dep) => {
    allowedPackages[dep] = true;
  });

  return {
    packageName: moduleName,
    globals: safeGlobals,
    packages: allowedPackages,
    builtins: {
      fs: false, // File system access blocked by default
      child_process: false, // Process spawning blocked
      os: false, // OS info blocked
      path: true, // Path utilities allowed
      url: true, // URL utilities allowed
      crypto: true, // Crypto allowed (for web apps)
      buffer: true, // Buffer allowed
    },
  };
}

/**
 * Validate module execution against policy
 */
export function validateModuleAccess(
  moduleName: string,
  requestedGlobal: string,
  policy: PolicyRule,
): boolean {
  // Check if global is allowed by policy
  const globalPolicy = policy.globals?.[requestedGlobal];

  if (globalPolicy === undefined) {
    console.warn(
      `⚠️ Global '${requestedGlobal}' not in policy for module '${moduleName}'`,
    );
    return false;
  }

  if (globalPolicy === false) {
    console.warn(
      `❌ Global '${requestedGlobal}' explicitly blocked for module '${moduleName}'`,
    );
    return false;
  }

  return true;
}

/**
 * Create compartment registry for managing multiple compartments
 */
export class CompartmentRegistry {
  private compartments = new Map<string, ICompartment>();
  private policies = new Map<string, PolicyRule>();

  /**
   * Register a compartment with its policy
   */
  register(
    moduleName: string,
    compartment: ICompartment,
    policy: PolicyRule,
  ): void {
    this.compartments.set(moduleName, compartment);
    this.policies.set(moduleName, policy);
    console.log(`📝 Registered compartment: ${moduleName}`);
  }

  /**
   * Get compartment by module name
   */
  getCompartment(moduleName: string): ICompartment | undefined {
    return this.compartments.get(moduleName);
  }

  /**
   * Get policy by module name
   */
  getPolicy(moduleName: string): PolicyRule | undefined {
    return this.policies.get(moduleName);
  }

  /**
   * Execute code in a registered compartment
   */
  async executeInModule(moduleName: string, code: string): Promise<any> {
    const compartment = this.getCompartment(moduleName);
    if (!compartment) {
      throw new Error(`No compartment registered for module: ${moduleName}`);
    }

    return executeInCompartment(compartment, code, moduleName);
  }

  /**
   * List all registered compartments
   */
  listCompartments(): string[] {
    return Array.from(this.compartments.keys());
  }

  /**
   * Clean up all compartments
   */
  cleanup(): void {
    console.log('🧹 Cleaning up compartment registry');
    this.compartments.clear();
    this.policies.clear();
  }
}

/**
 * Global compartment registry instance
 */
export const compartmentRegistry = new CompartmentRegistry();
