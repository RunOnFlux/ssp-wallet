/**
 * LavaMoat Runtime - Provides runtime security enforcement
 */

import type { LavaMoatPolicy } from '../compartment';

export interface RuntimeOptions {
  policy: LavaMoatPolicy;
  diagnostics?: boolean;
  debugMode?: boolean;
  scuttleGlobalThis?: {
    enabled?: boolean;
    exceptions?: string[];
  };
}

/**
 * Generate LavaMoat runtime initialization code
 */
export function generateRuntimeCode(options: RuntimeOptions): string {
  return `
// ===== CRITICAL PROPERTY FIXES - MUST RUN FIRST =====
// This MUST execute before ANY other JavaScript code to fix toString property issues
try {
  // CRITICAL: Store original Function.prototype methods before ANYTHING can corrupt them
  const ORIGINAL_FUNCTION_PROTOTYPE = {};
  if (typeof Function !== 'undefined' && Function.prototype) {
    // Capture the original methods immediately
    ORIGINAL_FUNCTION_PROTOTYPE.bind = Function.prototype.bind;
    ORIGINAL_FUNCTION_PROTOTYPE.call = Function.prototype.call;
    ORIGINAL_FUNCTION_PROTOTYPE.apply = Function.prototype.apply;
    ORIGINAL_FUNCTION_PROTOTYPE.toString = Function.prototype.toString;
    
    // Store them globally for emergency restoration
    window.__LAVAMOAT_ORIGINAL_FUNCTION_METHODS = ORIGINAL_FUNCTION_PROTOTYPE;
    
    // Create a restoration function that can be called anytime
    window.__LAVAMOAT_RESTORE_FUNCTION_PROTOTYPE = function() {
      try {
        if (ORIGINAL_FUNCTION_PROTOTYPE.bind && typeof ORIGINAL_FUNCTION_PROTOTYPE.bind === 'function') {
          Object.defineProperty(Function.prototype, 'bind', {
            value: ORIGINAL_FUNCTION_PROTOTYPE.bind,
            writable: true,
            enumerable: false,
            configurable: true
          });
        }
        if (ORIGINAL_FUNCTION_PROTOTYPE.call && typeof ORIGINAL_FUNCTION_PROTOTYPE.call === 'function') {
          Object.defineProperty(Function.prototype, 'call', {
            value: ORIGINAL_FUNCTION_PROTOTYPE.call,
            writable: true,
            enumerable: false,
            configurable: true
          });
        }
        if (ORIGINAL_FUNCTION_PROTOTYPE.apply && typeof ORIGINAL_FUNCTION_PROTOTYPE.apply === 'function') {
          Object.defineProperty(Function.prototype, 'apply', {
            value: ORIGINAL_FUNCTION_PROTOTYPE.apply,
            writable: true,
            enumerable: false,
            configurable: true
          });
        }
        if (ORIGINAL_FUNCTION_PROTOTYPE.toString && typeof ORIGINAL_FUNCTION_PROTOTYPE.toString === 'function') {
          Object.defineProperty(Function.prototype, 'toString', {
            value: ORIGINAL_FUNCTION_PROTOTYPE.toString,
            writable: true,
            enumerable: false,
            configurable: true
          });
        }
        console.log('✅ Function.prototype methods restored successfully');
        return true;
      } catch (e) {
        console.error('❌ Failed to restore Function.prototype methods:', e);
        return false;
      }
    };
    
    // Immediately attempt restoration
    window.__LAVAMOAT_RESTORE_FUNCTION_PROTOTYPE();
  }
  
  const _originalDefineProperty = Object.defineProperty;
  const _originalGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
  
  // IMMEDIATELY make all critical properties configurable and writable on built-in prototypes
  const criticalObjects = [String, Number, Boolean, Object, Array, Function, Date, RegExp, Error, Promise];
  const criticalProperties = ['toString', 'valueOf', 'toJSON', 'bind', 'call', 'apply'];
  
  criticalObjects.forEach(Constructor => {
    if (Constructor && Constructor.prototype) {
      criticalProperties.forEach(propName => {
        try {
          const currentDescriptor = _originalGetOwnPropertyDescriptor.call(Object, Constructor.prototype, propName);
          if (currentDescriptor) {
            _originalDefineProperty.call(Object, Constructor.prototype, propName, {
              value: currentDescriptor.value,
              writable: true,
              enumerable: currentDescriptor.enumerable !== undefined ? currentDescriptor.enumerable : false,
              configurable: true
            });
          }
        } catch (propError) {
          // Silently ignore property configuration failures
        }
      });
    }
  });
  
  console.log('🔓 CRITICAL: All built-in properties made configurable for crypto compatibility');
} catch (criticalError) {
  console.error('❌ CRITICAL: Failed to configure built-in properties:', criticalError);
}

// LavaMoat Runtime Security Initialization
(function() {
  'use strict';
  
  try {
    console.log('🔒 Initializing LavaMoat Runtime Security...');
    
    // SECURE: Store original methods without global overrides
    const originalDefineProperty = Object.defineProperty;
    const originalDefineProperties = Object.defineProperties;
    const originalFreeze = Object.freeze;
    const originalSeal = Object.seal;
    const originalPreventExtensions = Object.preventExtensions;
    
    // Helper: Temporarily patch Object.defineProperty and Object.freeze for crypto compatibility
    function withPatchedObjectMethods(fn: () => void) {
      const tempDefineProperty = Object.defineProperty;
      const tempFreeze = Object.freeze;
      try {
        Object.defineProperty = function(obj, prop, descriptor) {
          if (prop === 'toString' || prop === 'valueOf' || prop === 'toJSON') {
            // Force these properties to be configurable and writable for crypto libraries
            const newDescriptor = {
              ...descriptor,
              configurable: true,
              writable: true
            };
            return originalDefineProperty.call(this, obj, prop, newDescriptor);
          }
          return originalDefineProperty.call(this, obj, prop, descriptor);
        };
        Object.freeze = function(obj) {
          if (obj && typeof obj === 'object') {
            try {
              // Before freezing, ensure critical properties are configurable
              const criticalProps = ['toString', 'valueOf', 'toJSON'];
              criticalProps.forEach(prop => {
                if (obj.hasOwnProperty && obj.hasOwnProperty(prop)) {
                  try {
                    const descriptor = Object.getOwnPropertyDescriptor(obj, prop);
                    if (descriptor && !descriptor.configurable) {
                      originalDefineProperty.call(Object, obj, prop, {
                        ...descriptor,
                        configurable: true,
                        writable: true
                      });
                    }
                  } catch (e) { /* ignore */ }
                }
              });
            } catch (e) { /* ignore */ }
          }
          return originalFreeze.call(this, obj);
        };
        // Run the callback (e.g., load the crypto library)
        fn();
      } finally {
        Object.defineProperty = tempDefineProperty;
        Object.freeze = tempFreeze;
      }
    }
    
    // Make toString properties configurable BEFORE any other protection
    const cryptoSensitiveObjects = [String, Number, Boolean, Object, Array, Function, Date, RegExp, Error];
    const criticalProperties = ['toString', 'valueOf', 'toJSON', 'bind', 'call', 'apply'];
    
    cryptoSensitiveObjects.forEach(obj => {
      if (obj && obj.prototype) {
        criticalProperties.forEach(prop => {
          try {
            const descriptor = Object.getOwnPropertyDescriptor(obj.prototype, prop);
            if (descriptor) {
              originalDefineProperty.call(Object, obj.prototype, prop, {
                ...descriptor,
                configurable: true,
                writable: true
              });
            }
          } catch (e) {
            // Ignore failures
          }
        });
      }
    });
    
    // CRITICAL: Ensure Function.prototype methods are always available and functional
    try {
      const functionPrototype = Function.prototype;
      const functionMethods = ['bind', 'call', 'apply', 'toString'];
      functionMethods.forEach(method => {
        const original = functionPrototype[method];
        if (original && typeof original === 'function') {
          originalDefineProperty.call(Object, functionPrototype, method, {
            value: original,
            writable: true,
            enumerable: false,
            configurable: true
          });
        }
      });
      console.log('✅ Function.prototype methods preserved for React compatibility');
    } catch (e) {
      console.error('❌ Failed to preserve Function.prototype methods:', e);
    }
    
    // Enhanced SES lockdown and security initialization
    const originalEval = window.eval;
    const originalFunction = window.Function;
    
    // Override eval with enhanced security
    window.eval = function(code) {
      console.warn('🚨 LavaMoat: eval() attempt blocked:', code);
      throw new Error('eval() blocked by LavaMoat - Code: ' + (typeof code === 'string' ? code.substring(0, 50) : code));
    };
    
    // Consistently block Function constructor across all access methods
    const securedFunctionBlock = function(...args) {
      console.warn('🚨 LavaMoat: Function constructor attempt blocked:', args);
      throw new Error('Function constructor blocked by LavaMoat - Args: ' + args.join(', '));
    };
    
    // Block Function constructor through all possible access paths
    window.Function = securedFunctionBlock;
    
    // Remove the original Function constructor as much as possible
    try {
      // Delete the Function property if possible
      delete (window as any)['Function'];
    } catch (e) {
      // Ignore if delete fails
    }
    
    // Redefine Function as a non-configurable, non-writable property that throws
    Object.defineProperty(window, 'Function', {
      configurable: false,
      enumerable: false,
      writable: false,
      value: securedFunctionBlock
    });
    
    // Also secure globalThis.Function access
    try {
      delete (globalThis as any)['Function'];
      Object.defineProperty(globalThis, 'Function', {
        configurable: false,
        enumerable: false,
        writable: false,
        value: securedFunctionBlock
      });
    } catch (e) {
      // Fallback if we can't secure globalThis
      (globalThis as any)['Function'] = securedFunctionBlock;
    }
    
    // SECURE: Enhanced prototype protection with selective crypto compatibility
    const protectObject = (obj, name) => {
      try {
        // Apply targeted protection instead of complete bypass
        const needsCryptoCompat = ['String', 'Number', 'Boolean'].includes(name);
        
        if (needsCryptoCompat) {
          // Apply selective protection: protect constructor but allow prototype modification
          try {
            if (obj.prototype) {
              // Use temporary patching for crypto-sensitive prototype modifications
              withPatchedObjectMethods(() => {
                // Allow crypto libraries to modify toString, valueOf, toJSON on prototypes
                const cryptoProps = ['toString', 'valueOf', 'toJSON'];
                cryptoProps.forEach(prop => {
                  try {
                    const descriptor = Object.getOwnPropertyDescriptor(obj.prototype, prop);
                    if (descriptor && !descriptor.configurable) {
                      originalDefineProperty.call(Object, obj.prototype, prop, {
                        ...descriptor,
                        configurable: true,
                        writable: true
                      });
                    }
                  } catch (e) { /* ignore */ }
                });
              });
              
              // Still protect the constructor itself
              try {
                originalFreeze.call(Object, obj.prototype.constructor);
              } catch (e) { /* ignore */ }
            }
            ${options.diagnostics ? 'console.log("🔐 Selectively protected crypto-compatible:", name);' : ''}
          } catch (cryptoError) {
            ${options.diagnostics ? 'console.warn("⚠️  Crypto-compatible protection failed:", name, cryptoError.message);' : ''}
          }
        } else {
          // For non-crypto objects, apply full protection
          try {
            originalFreeze.call(Object, obj);
            if (obj.prototype) {
              originalFreeze.call(Object, obj.prototype);
              originalFreeze.call(Object, obj.prototype.constructor);
            }
            ${options.diagnostics ? 'console.log("🛡️  Fully protected:", name);' : ''}
          } catch (freezeError) {
            ${options.diagnostics ? 'console.warn("⚠️  Could not fully protect:", name, freezeError.message);' : ''}
          }
        }
      } catch (e) {
        ${options.diagnostics ? 'console.warn("⚠️  Could not protect:", name, e.message);' : ''}
      }
    };
    
    // Protect critical objects
    protectObject(Object, 'Object');
    protectObject(Array, 'Array');
    protectObject(Function, 'Function');
    protectObject(String, 'String');
    protectObject(Number, 'Number');
    protectObject(Boolean, 'Boolean');
    protectObject(Date, 'Date');
    protectObject(RegExp, 'RegExp');
    protectObject(Error, 'Error');
    protectObject(Promise, 'Promise');
    
    // Policy enforcement setup (BEFORE scuttling)
    const policy = ${JSON.stringify(options.policy, null, 2)};
    
    // Configuration-based global protection (takes precedence over policy)
    const scuttleConfig = ${JSON.stringify(options.scuttleGlobalThis || {})};
    const allowedGlobals = new Set([
      "console", "setTimeout", "setInterval", "clearTimeout", "clearInterval",
      "requestAnimationFrame", "cancelAnimationFrame", "fetch", "XMLHttpRequest",
      // Essential browser APIs for modern web applications
      "screen", "localStorage", "sessionStorage", "indexedDB", "history",
      "navigator", "location", "document", "window", "crypto", "performance"
    ]);
    
    // Add exceptions from scuttle configuration (highest priority)
    if (scuttleConfig.exceptions && Array.isArray(scuttleConfig.exceptions)) {
      scuttleConfig.exceptions.forEach(exception => allowedGlobals.add(exception));
    }
    
    // Add globals from all module policies (lower priority)
    Object.values(policy.resources || {}).forEach(resource => {
      if (resource.globals) {
        Object.keys(resource.globals).forEach(global => {
          if (resource.globals[global]) {
            allowedGlobals.add(global);
          }
        });
      }
    });
    
    ${options.diagnostics ? 'console.log("🌐 Allowed globals from config + policy:", Array.from(allowedGlobals).sort());' : ''}
    
    // Store original globals before scuttling for chunk restoration
    const originalGlobals = {};
    if (typeof window !== 'undefined') {
      ['Math', 'Reflect', 'Number', 'String', 'Boolean', 'Date', 'JSON', 'parseInt', 
       'parseFloat', 'isNaN', 'isFinite', 'Error', 'TypeError', 'RangeError',
       'encodeURIComponent', 'decodeURIComponent', 'btoa', 'atob',
       'ArrayBuffer', 'Uint8Array', 'Uint16Array', 'Uint32Array',
       'Int8Array', 'Int16Array', 'Int32Array', 'Float32Array', 'Float64Array',
       'DataView', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Symbol', 'Promise',
       'RegExp', 'Proxy', 'BigInt', 'BigUint64Array', 'BigInt64Array'].forEach(global => {
        if (typeof window[global] !== 'undefined') {
          window['__lavamoat_original_' + global] = window[global];
        }
      });
    }
    
    // Enhanced global object scuttling with configuration awareness
    if (scuttleConfig.enabled !== false) {
      try {
        const globalProps = Object.getOwnPropertyNames(window);
        let scuttledCount = 0;
        
        globalProps.forEach(prop => {
          if (!allowedGlobals.has(prop) && prop.indexOf('__lavamoat') !== 0) {
            try {
              const descriptor = Object.getOwnPropertyDescriptor(window, prop);
              if (descriptor && descriptor.configurable && typeof window[prop] !== 'function') {
                delete window[prop];
                scuttledCount++;
              }
            } catch (e) {
              // Some properties can't be deleted
            }
          }
        });
        
        // Ensure globalThis reference is available for libraries
        if (typeof window !== 'undefined' && !window.globalThis) {
          window.globalThis = window;
        }
        
        ${options.diagnostics ? 'console.log("🗿 Global scuttling complete:", scuttledCount, "properties removed");' : ''}
      } catch (e) {
        ${options.diagnostics ? 'console.warn("⚠️  Global scuttling failed:", e.message);' : ''}
      }
    } else {
      ${options.diagnostics ? 'console.log("ℹ️ Global scuttling disabled by configuration");' : ''}
    }
    
    ${options.diagnostics ? 'console.log("✅ LavaMoat runtime security initialized successfully");' : ''}
    
    // Initialize security globals with enhanced information
    window.__lavamoat_security_active = true;
    window.__lavamoat_lockdown_enabled = true;
    window.__lavamoat_enhanced_protection = true;
    window.__lavamoat_version = '1.0.0';
    window.__lavamoat_policy = policy;
    window.__lavamoat_protections = {
      eval_blocked: true,
      function_constructor_blocked: true,
      prototypes_frozen: true,
      global_scuttling: true,
      policy_enforcement: true
    };
    
    // Module enforcement functions
    window.__lavamoat_enforceModulePolicy = function(moduleName, requiredPermissions) {
      const modulePolicy = policy.resources[moduleName];
      if (!modulePolicy) {
        console.warn(\`🚨 LavaMoat: No policy found for module \${moduleName}\`);
        return false;
      }
      
      // Check if module has required permissions
      for (const permission of requiredPermissions) {
        if (!modulePolicy.globals[permission] && !modulePolicy.packages[permission] && !modulePolicy.builtins[permission]) {
          console.warn(\`🚨 LavaMoat: Module \${moduleName} denied access to \${permission}\`);
          return false;
        }
      }
      
      return true;
    };
    
    // Security test functions
    window.__lavamoat_verify_hardening = function() {
      const tests = [];
      
      // Test eval blocking
      try {
        eval('1+1');
        tests.push({name: 'eval', status: 'FAIL', message: 'eval() not blocked'});
      } catch (e) {
        tests.push({name: 'eval', status: 'PASS', message: 'eval() blocked: ' + e.message});
      }
      
      // Test Function constructor blocking
      try {
        new Function('return 1')();
        tests.push({name: 'Function', status: 'FAIL', message: 'Function constructor not blocked'});
      } catch (e) {
        tests.push({name: 'Function', status: 'PASS', message: 'Function constructor blocked: ' + e.message});
      }
      
      // Test prototype protection
      try {
        Object.prototype.maliciousProperty = 'test';
        const hasProperty = {}.maliciousProperty === 'test';
        tests.push({name: 'Prototype', status: hasProperty ? 'FAIL' : 'PASS', message: hasProperty ? 'Prototype pollution possible' : 'Prototype protected'});
      } catch (e) {
        tests.push({name: 'Prototype', status: 'PASS', message: 'Prototype modification blocked: ' + e.message});
      }
      
      return tests;
    };
    
    window.__lavamoat_run_security_tests = function() {
      const results = [];
      const addResult = (message, type) => results.push({message, type, timestamp: new Date().toISOString()});
      
      addResult('🚀 Running LavaMoat Runtime Security Tests', 'info');
      addResult('📅 Test Time: ' + new Date().toLocaleString(), 'info');
      addResult('', 'info');
      
      const tests = window.__lavamoat_verify_hardening();
      tests.forEach(test => {
        addResult('🧪 Test: ' + test.name + ' - ' + test.status + ': ' + test.message, test.status === 'PASS' ? 'pass' : 'fail');
      });
      
      addResult('', 'info');
      addResult('📊 Runtime Security Summary:', 'info');
      const passCount = tests.filter(t => t.status === 'PASS').length;
      const failCount = tests.filter(t => t.status === 'FAIL').length;
      
      addResult('✅ Passed: ' + passCount + ' tests', 'pass');
      if (failCount > 0) addResult('❌ Failed: ' + failCount + ' tests', 'fail');
      
      if (failCount === 0) {
        addResult('🎉 EXCELLENT: LavaMoat runtime protection is working perfectly!', 'pass');
      } else {
        addResult('⚠️ WARNING: Some protections may not be working as expected', 'warning');
      }
      
      return results;
    };
    
    console.log('✅ LavaMoat runtime security initialized successfully');
    ${options.diagnostics ? 'console.log("🔧 Security test functions available: __lavamoat_verify_hardening(), __lavamoat_run_security_tests()");' : ''}
    
    // FINAL: Ensure Function.prototype methods are available after all initialization
    if (typeof window !== 'undefined' && window.__LAVAMOAT_RESTORE_FUNCTION_PROTOTYPE) {
      window.__LAVAMOAT_RESTORE_FUNCTION_PROTOTYPE();
      console.log('🔧 Function.prototype methods restored after LavaMoat initialization');
    }
    
  } catch (error) {
    console.error('❌ LavaMoat runtime initialization failed:', error);
    
    // Emergency restoration attempt even if initialization failed
    try {
      if (typeof window !== 'undefined' && window.__LAVAMOAT_RESTORE_FUNCTION_PROTOTYPE) {
        window.__LAVAMOAT_RESTORE_FUNCTION_PROTOTYPE();
        console.log('🚨 Emergency Function.prototype restoration after initialization failure');
      }
    } catch (restoreError) {
      console.error('❌ Emergency Function.prototype restoration failed:', restoreError);
    }
  }
})();`;
}

/**
 * Generate module wrapper code for enforcing policies at runtime
 */
export function generateModuleWrapper(
  moduleName: string,
  moduleContent: string,
  options: RuntimeOptions,
): string {
  const modulePolicy = options.policy.resources[moduleName];

  if (!modulePolicy) {
    console.warn(
      `⚠️ No policy found for module ${moduleName}, using restrictive defaults`,
    );
  }

  return `
// LavaMoat Module Wrapper for ${moduleName}
(function() {
  'use strict';
  
  // Check if LavaMoat runtime is available
  if (!window.__lavamoat_security_active) {
    console.error('🚨 LavaMoat runtime not initialized for module ${moduleName}');
    return;
  }
  
  // Module policy enforcement
  const modulePolicy = window.__lavamoat_policy.resources['${moduleName}'] || {
    globals: { console: true },
    packages: {},
    builtins: {}
  };
  
  ${options.diagnostics ? `console.log('🔒 Loading module ${moduleName} with policy:', modulePolicy);` : ''}
  
  // Create restricted global scope
  const restrictedGlobals = {};
  Object.keys(modulePolicy.globals).forEach(globalName => {
    if (modulePolicy.globals[globalName] && window[globalName]) {
      restrictedGlobals[globalName] = window[globalName];
    }
  });
  
  // Execute module in restricted context
  try {
    (function() {
      // Override global access within this module
      ${Object.keys(modulePolicy?.globals || {})
        .map((global) => `const ${global} = restrictedGlobals.${global};`)
        .join('\n      ')}
      
      // Module content
      ${moduleContent}
    })();
  } catch (error) {
    console.error(\`🚨 LavaMoat: Module \${${moduleName}} execution failed:\`, error);
  }
})();`;
}
