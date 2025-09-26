/**
 * LavaMoat SES Lockdown Implementation
 *
 * This module provides SES (Secure ECMAScript) lockdown functionality
 * to harden the JavaScript runtime against code injection attacks.
 */

// SES import - handle different export patterns
let lockdown: any;
try {
  // Try default import first
  const sesModule = require('ses');
  lockdown = sesModule.lockdown || sesModule.default?.lockdown || sesModule;
} catch (error) {
  // Fallback for browser environments or missing SES
  lockdown = function () {
    console.warn('SES lockdown not available, using fallback hardening');

    // Basic hardening without SES
    if (typeof window !== 'undefined') {
      try {
        // Block eval and Function constructor
        window['eval'] = function () {
          throw new Error('eval() blocked by LavaMoat fallback');
        };
        (window as any)['Function'] = function () {
          throw new Error('Function constructor blocked by LavaMoat fallback');
        } as any;

        // Preserve Function.prototype methods before any freezing
        const functionPrototype = Function.prototype;
        const bindMethod = functionPrototype.bind;
        const callMethod = functionPrototype.call;
        const applyMethod = functionPrototype.apply;
        const toStringMethod = functionPrototype.toString;

        // Store them globally for restoration
        (window as any)['__LAVAMOAT_FUNCTION_BIND'] = bindMethod;
        (window as any)['__LAVAMOAT_FUNCTION_CALL'] = callMethod;
        (window as any)['__LAVAMOAT_FUNCTION_APPLY'] = applyMethod;
        (window as any)['__LAVAMOAT_FUNCTION_TOSTRING'] = toStringMethod;

        // Create restoration function
        (window as any)['__LAVAMOAT_RESTORE_FUNCTION_PROTOTYPE'] = function () {
          try {
            if (bindMethod) functionPrototype.bind = bindMethod;
            if (callMethod) functionPrototype.call = callMethod;
            if (applyMethod) functionPrototype.apply = applyMethod;
            if (toStringMethod) functionPrototype.toString = toStringMethod;
          } catch (e) {
            console.warn('Could not restore Function.prototype methods:', e);
          }
        };

        // Freeze critical prototypes (but Function.prototype methods should be accessible)
        Object.freeze(Object.prototype);
        Object.freeze(Array.prototype);
        // Don't freeze Function.prototype to keep methods accessible
        // Object.freeze(Function.prototype);
      } catch (e) {
        console.warn('Fallback hardening partially failed:', e);
      }
    }
  };
}

export interface LockdownOptions {
  /**
   * Enable console logging (should be false in production)
   */
  consoleTaming?: 'safe' | 'unsafe';

  /**
   * Error taming mode
   */
  errorTaming?: 'safe' | 'unsafe';

  /**
   * Stack filtering mode
   */
  stackFiltering?: 'concise' | 'verbose';

  /**
   * Override taming mode
   */
  overrideTaming?: 'min' | 'moderate' | 'severe';

  /**
   * Domain taming mode
   */
  domainTaming?: 'safe' | 'unsafe';
}

export interface ScuttleOptions {
  /**
   * Enable global object scuttling
   */
  enabled: boolean;

  /**
   * Properties to preserve during scuttling
   */
  exceptions?: string[];
}

/**
 * Initialize SES lockdown with security hardening
 */
export function initializeLockdown(options: LockdownOptions = {}): void {
  try {
    console.log('🔒 Initializing SES lockdown...');

    lockdown({
      consoleTaming: options.consoleTaming || 'safe',
      errorTaming: options.errorTaming || 'safe',
      stackFiltering: options.stackFiltering || 'concise',
      overrideTaming: options.overrideTaming || 'severe',
      domainTaming: options.domainTaming || 'safe',
      // Additional hardening
      mathTaming: 'safe',
      dateTaming: 'safe',
      regExpTaming: 'safe',
    });

    console.log('✅ SES lockdown initialized successfully');
  } catch (error) {
    console.error('❌ SES lockdown failed:', error);
    throw new Error(`SES lockdown initialization failed: ${error}`);
  }
}

/**
 * Scuttle global object to prevent tampering
 */
export function scuttleGlobalThis(options: ScuttleOptions): void {
  if (!options.enabled) {
    console.log('ℹ️ Global scuttling disabled');
    return;
  }

  try {
    console.log('🗿 Scuttling global object...');

    const exceptions = new Set([
      // Essential browser APIs
      'console',
      'setTimeout',
      'setInterval',
      'clearTimeout',
      'clearInterval',
      'requestAnimationFrame',
      'cancelAnimationFrame',

      // DOM APIs
      'document',
      'window',
      'location',
      'navigator',

      // Essential constructors
      'Array',
      'Object',
      'String',
      'Number',
      'Boolean',
      'Date',
      'RegExp',
      'Error',
      'Promise',

      // Module system
      '__webpack_require__',
      'require',
      'module',
      'exports',

      // Custom exceptions
      ...(options.exceptions || []),
    ]);

    // Get all property names from global object
    const globalProps = Object.getOwnPropertyNames(globalThis);

    let scuttledCount = 0;

    for (const prop of globalProps) {
      if (!exceptions.has(prop)) {
        try {
          // Try to delete or make non-configurable
          const descriptor = Object.getOwnPropertyDescriptor(globalThis, prop);
          if (descriptor && descriptor.configurable) {
            delete (globalThis as any)[prop];
            scuttledCount++;
          }
        } catch (error) {
          // Some properties can't be deleted - that's OK
        }
      }
    }

    console.log(
      `✅ Global scuttling complete: ${scuttledCount} properties removed`,
    );
  } catch (error) {
    console.error('❌ Global scuttling failed:', error);
    // Don't throw - scuttling failure shouldn't break the app
  }
}

/**
 * Verify that security hardening is active
 */
export function verifySecurityHardening(): boolean {
  const tests = [
    {
      name: 'eval() blocked',
      test: () => {
        try {
          const evalFunction = globalThis.eval || globalThis['eval'];
          evalFunction.call(globalThis, '1 + 1');
          return false; // Should not reach here
        } catch {
          return true; // eval should be blocked
        }
      },
    },
    {
      name: 'Function constructor blocked',
      test: () => {
        try {
          const FunctionConstructor = globalThis.Function || Function;
          new FunctionConstructor('return 1')();
          return false; // Should not reach here
        } catch {
          return true; // Function constructor should be blocked
        }
      },
    },
    {
      name: 'Global object protected',
      test: () => {
        try {
          (globalThis as any)['__test_property'] = 'test';
          const hasProperty = (globalThis as any)['__test_property'] === 'test';
          delete (globalThis as any)['__test_property'];
          return !hasProperty; // Should not be able to modify global
        } catch {
          return true; // Modification should be blocked
        }
      },
    },
  ];

  const results = tests.map((test) => ({
    name: test.name,
    passed: test.test(),
  }));

  const allPassed = results.every((result) => result.passed);

  console.log('🧪 Security hardening verification:');
  results.forEach((result) => {
    console.log(`  ${result.passed ? '✅' : '❌'} ${result.name}`);
  });

  return allPassed;
}

/**
 * Runtime security test suite
 */
export function runSecurityTests(): Array<{
  name: string;
  type: 'pass' | 'fail' | 'warning' | 'info';
  message: string;
}> {
  const results: Array<{
    name: string;
    type: 'pass' | 'fail' | 'warning' | 'info';
    message: string;
  }> = [];

  // Test 1: Function Constructor Attack
  results.push({
    name: 'Function Constructor Test',
    type: 'info',
    message: '🧪 Testing Function constructor injection...',
  });
  try {
    const FunctionConstructor = globalThis.Function || Function;
    const testPayload = 'return "SECURITY BREACH: Function constructor works"';
    const maliciousFunction = new FunctionConstructor(testPayload);
    const result = maliciousFunction();
    results.push({
      name: 'Function Constructor',
      type: 'fail',
      message: `❌ FAIL: Function constructor not blocked - ${result}`,
    });
  } catch (error) {
    results.push({
      name: 'Function Constructor',
      type: 'pass',
      message: `✅ PASS: Function constructor blocked - ${(error as Error).message}`,
    });
  }

  // Test 2: eval() Attack
  results.push({
    name: 'Eval Test',
    type: 'info',
    message: '🧪 Testing eval() injection...',
  });
  try {
    const evalFunction = globalThis.eval || globalThis['eval'];
    const testPayload = '"SECURITY BREACH: eval works"';
    const result = evalFunction.call(globalThis, testPayload);
    results.push({
      name: 'Eval Injection',
      type: 'fail',
      message: `❌ FAIL: eval() not blocked - ${result}`,
    });
  } catch (error) {
    results.push({
      name: 'Eval Injection',
      type: 'pass',
      message: `✅ PASS: eval() blocked - ${(error as Error).message}`,
    });
  }

  // Test 3: Global Object Modification
  results.push({
    name: 'Global Tampering Test',
    type: 'info',
    message: '🧪 Testing global object tampering...',
  });
  try {
    (globalThis as any)['__maliciousFlag'] =
      'SECURITY BREACH: Global modification works';
    if ((globalThis as any)['__maliciousFlag']) {
      results.push({
        name: 'Global Tampering',
        type: 'fail',
        message: '❌ FAIL: Global object can be modified',
      });
      delete (globalThis as any)['__maliciousFlag'];
    } else {
      results.push({
        name: 'Global Tampering',
        type: 'pass',
        message: '✅ PASS: Global object modification blocked',
      });
    }
  } catch (error) {
    results.push({
      name: 'Global Tampering',
      type: 'pass',
      message: `✅ PASS: Global object access blocked - ${(error as Error).message}`,
    });
  }

  // Test 4: Prototype Pollution
  results.push({
    name: 'Prototype Pollution Test',
    type: 'info',
    message: '🧪 Testing prototype pollution...',
  });
  try {
    (Object.prototype as any)['__maliciousProperty'] =
      'SECURITY BREACH: Prototype pollution works';
    const testObj = {};
    if ((testObj as any)['__maliciousProperty']) {
      results.push({
        name: 'Prototype Pollution',
        type: 'fail',
        message: '❌ FAIL: Prototype pollution successful',
      });
    } else {
      results.push({
        name: 'Prototype Pollution',
        type: 'pass',
        message: '✅ PASS: Prototype pollution blocked',
      });
    }
    delete (Object.prototype as any)['__maliciousProperty'];
  } catch (error) {
    results.push({
      name: 'Prototype Pollution',
      type: 'pass',
      message: `✅ PASS: Prototype access blocked - ${(error as Error).message}`,
    });
  }

  // Test 5: Normal Operations
  results.push({
    name: 'Normal Operations Test',
    type: 'info',
    message: '🧪 Testing normal JavaScript operations...',
  });
  try {
    const testArray = [1, 2, 3].map((x) => x * 2);
    const testDate = new Date().getTime();
    const testMath = Math.random();

    if (testArray.length === 3 && testDate > 0 && testMath >= 0) {
      results.push({
        name: 'Normal Operations',
        type: 'pass',
        message: '✅ PASS: Normal JavaScript operations working',
      });
    } else {
      results.push({
        name: 'Normal Operations',
        type: 'fail',
        message: '❌ FAIL: Normal operations impaired',
      });
    }
  } catch (error) {
    results.push({
      name: 'Normal Operations',
      type: 'fail',
      message: `❌ FAIL: Normal operations broken - ${(error as Error).message}`,
    });
  }

  return results;
}

/**
 * Make security functions available globally for testing
 */
export function exposeSecurityGlobals(): void {
  try {
    (globalThis as any)['__lavamoat_security_active'] = true;
    (globalThis as any)['__lavamoat_verify_hardening'] =
      verifySecurityHardening;
    (globalThis as any)['__lavamoat_run_security_tests'] = runSecurityTests;

    console.log('🔧 Security test functions exposed globally');
  } catch (error) {
    console.warn('⚠️ Could not expose security globals:', error);
  }
}
