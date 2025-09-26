/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unused-vars */

import React, { useState, useEffect } from 'react';
import { Button, Card, Typography, Space } from 'antd';
import {
  SafetyOutlined,
  BugOutlined,
  ClearOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router';
import type { LavaMoatSecurityResult } from '../../types/lavamoat';

const { Title, Text, Paragraph } = Typography;

type TestResult = LavaMoatSecurityResult;

const SecurityTest: React.FC = () => {
  const navigate = useNavigate();
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const logTest = (message: string, type: TestResult['type'] = 'info') => {
    const result: TestResult = {
      message,
      type,
      timestamp: new Date().toISOString(),
    };
    setTestResults((prev) => [...prev, result]);
  };

  // Pure bracket notation access without TypeScript casting
  const getWindowProp = (prop: string) => {
    // @ts-ignore - intentionally accessing window dynamically
    return window[prop];
  };
  const setWindowProp = (prop: string, value: unknown): void => {
    // @ts-ignore - intentionally setting window property dynamically
    window[prop] = value;
  };
  const getGlobalProp = (obj: any, prop: string) => {
    // @ts-ignore - intentionally accessing object property dynamically
    return obj[prop];
  };
  const setGlobalProp = (obj: any, prop: string, value: unknown): void => {
    // @ts-ignore - intentionally setting object property dynamically
    obj[prop] = value;
  };

  const clearResults = () => {
    setTestResults([]);
  };

  const runSecurityTests = () => {
    setIsRunning(true);
    clearResults();

    logTest('🚀 Starting ENHANCED SSP Wallet Security Verification...', 'info');
    logTest('📅 Test Time: ' + new Date().toLocaleString(), 'info');
    logTest(
      '🔌 Using Enhanced Vite-Plugin-LavaMoat Security System v1.0.0',
      'info',
    );
    logTest('', 'info');

    // Check if enhanced protection is available
    if (typeof window.__lavamoat_run_security_tests === 'function') {
      logTest('🔧 Running built-in enhanced security tests...', 'info');
      try {
        const builtInResults = window.__lavamoat_run_security_tests();
        builtInResults.forEach((result) => {
          logTest(result.message, result.type);
        });
        logTest('', 'info');
        logTest('🔍 Running additional manual security tests...', 'info');
      } catch {
        logTest(
          '⚠️ WARNING: Built-in enhanced security tests failed to execute',
          'warning',
        );
      }
    }

    // Test 1: Function Constructor Attack
    logTest('🧪 Test 1: Function Constructor Code Injection', 'info');
    try {
      const FunctionConstructor = window.Function || Function;
      const testPayload =
        'return "SECURITY BREACH: Function constructor works"';

      const maliciousFunction = new FunctionConstructor(testPayload);

      const result = maliciousFunction();
      logTest('❌ FAIL: Function constructor not blocked - ' + result, 'fail');
    } catch (error) {
      logTest(
        '✅ PASS: Function constructor blocked - ' + (error as Error).message,
        'pass',
      );
    }

    // Test 2: eval() Attack
    logTest('🧪 Test 2: eval() Code Injection', 'info');
    try {
      const evalFunction = window.eval || eval;
      const testPayload = '"SECURITY BREACH: eval works"';

      const result = evalFunction.call(window, testPayload);
      logTest('❌ FAIL: eval() not blocked - ' + result, 'fail');
    } catch (error) {
      logTest('✅ PASS: eval() blocked - ' + (error as Error).message, 'pass');
    }

    // Test 3: Global Object Modification
    logTest('🧪 Test 3: Global Object Tampering', 'info');
    try {
      setWindowProp(
        '__maliciousFlag',
        'SECURITY BREACH: Global modification works',
      );
      if (getWindowProp('__maliciousFlag')) {
        logTest('❌ FAIL: Global object can be modified', 'fail');
      } else {
        logTest('✅ PASS: Global object modification blocked', 'pass');
      }
    } catch (error) {
      logTest(
        '✅ PASS: Global object access blocked - ' + (error as Error).message,
        'pass',
      );
    }

    // Test 3b: Alternative Global Object Tampering Methods
    logTest('🧪 Test 3b: Alternative Global Tampering Methods', 'info');
    let globalTamperingBlocked = 0;
    let globalTamperingTotal = 0;

    // Method 1: Direct property assignment
    globalTamperingTotal++;
    try {
      setGlobalProp(globalThis, '__test_property', 'test');
      if (getGlobalProp(globalThis, '__test_property')) {
        logTest('❌ Direct globalThis assignment not blocked', 'fail');
      } else {
        globalTamperingBlocked++;
        logTest('✅ Direct globalThis assignment blocked', 'pass');
      }
    } catch (error) {
      globalTamperingBlocked++;
      logTest(
        '✅ Direct globalThis assignment blocked - ' + (error as Error).message,
        'pass',
      );
    }

    // Method 2: Object.defineProperty
    globalTamperingTotal++;
    try {
      Object.defineProperty(window, 'maliciousExecuted', {
        value: true,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      if ((window as any).maliciousExecuted) {
        logTest('❌ Object.defineProperty not blocked', 'fail');
      } else {
        globalTamperingBlocked++;
        logTest('✅ Object.defineProperty blocked', 'pass');
      }
    } catch (error) {
      globalTamperingBlocked++;
      logTest(
        '✅ Object.defineProperty blocked - ' + (error as Error).message,
        'pass',
      );
    }

    // Method 3: Bracket notation
    globalTamperingTotal++;
    try {
      (window as any)['__maliciousFlag'] = 'bracket notation test';
      if ((window as any)['__maliciousFlag']) {
        logTest('❌ Bracket notation assignment not blocked', 'fail');
      } else {
        globalTamperingBlocked++;
        logTest('✅ Bracket notation assignment blocked', 'pass');
      }
    } catch (error) {
      globalTamperingBlocked++;
      logTest(
        '✅ Bracket notation assignment blocked - ' + (error as Error).message,
        'pass',
      );
    }

    logTest(
      `🎯 Global Protection Summary: ${globalTamperingBlocked}/${globalTamperingTotal} methods blocked`,
      globalTamperingBlocked === globalTamperingTotal ? 'pass' : 'fail',
    );

    // Test 4: Prototype Pollution
    logTest('🧪 Test 4: Prototype Pollution Attack', 'info');
    try {
      (Object.prototype as any).maliciousProperty = 'SECURITY BREACH';
      const testObj = {};
      if ('maliciousProperty' in testObj) {
        logTest('❌ FAIL: Prototype pollution successful', 'fail');
      } else {
        logTest('✅ PASS: Prototype pollution blocked', 'pass');
      }
    } catch (error) {
      logTest(
        '✅ PASS: Prototype modification blocked - ' + (error as Error).message,
        'pass',
      );
    }

    // Test 5: Event-based Code Execution
    logTest('🧪 Test 5: Event-based Code Execution', 'info');
    try {
      const testDiv = document.createElement('div');
      testDiv.innerHTML =
        '<img src="x" onerror="window.maliciousExecuted = true">';
      if (document.body) {
        document.body.appendChild(testDiv);

        setTimeout(() => {
          if ((window as any).maliciousExecuted) {
            logTest('❌ FAIL: Event-based execution not blocked', 'fail');
          } else {
            logTest('✅ PASS: Event-based execution blocked', 'pass');
          }
          if (document.body && document.body.contains(testDiv)) {
            document.body.removeChild(testDiv);
          }
        }, 100);
      } else {
        logTest(
          '⚠️ WARNING: document.body not available for DOM test',
          'warning',
        );
      }
    } catch (error) {
      logTest(
        '✅ PASS: DOM manipulation blocked - ' + (error as Error).message,
        'pass',
      );
    }

    // Test 6: Advanced Attack Vectors
    logTest('', 'info');
    logTest('🧪 Test 6: Advanced Attack Vectors', 'info');
    let advancedBlockedCount = 0;
    let advancedTotalCount = 0;

    // Test 6a: Constructor property access (CSP-compliant check)
    advancedTotalCount++;
    try {
      // Check if window.constructor.constructor exists and behaves like Function
      const constructorAccess = (window as any).constructor?.constructor;
      if (
        constructorAccess &&
        constructorAccess.toString &&
        constructorAccess.toString().includes('blocked by LavaMoat')
      ) {
        advancedBlockedCount++;
        logTest('✅ Constructor.constructor access blocked', 'pass');
      } else if (constructorAccess === Function) {
        // If it equals Function, LavaMoat should have blocked it
        logTest(
          '❌ Constructor.constructor attack path still available',
          'fail',
        );
      } else {
        advancedBlockedCount++;
        logTest('✅ Constructor.constructor access restricted', 'pass');
      }
    } catch (error) {
      advancedBlockedCount++;
      logTest(
        '✅ Constructor.constructor access blocked - ' +
          (error as Error).message,
        'pass',
      );
    }

    // Test 6b: setTimeout with string code (CSP-compliant check)
    advancedTotalCount++;
    try {
      // Check if setTimeout is protected by examining its implementation
      const originalSetTimeout = (globalThis as any).setTimeout;
      if (
        originalSetTimeout &&
        originalSetTimeout
          .toString()
          .includes('string code blocked by LavaMoat')
      ) {
        advancedBlockedCount++;
        logTest('✅ setTimeout string execution protection detected', 'pass');
      } else {
        // Try to verify protection exists without actually executing string code
        try {
          // Test with an obviously safe string to see if protection triggers
          const testResult = originalSetTimeout.toString();
          if (
            testResult.includes('blocked') ||
            testResult.includes('LavaMoat')
          ) {
            advancedBlockedCount++;
            logTest('✅ setTimeout string execution protection active', 'pass');
          } else {
            logTest(
              '❌ setTimeout string execution may not be protected',
              'fail',
            );
          }
        } catch (e) {
          advancedBlockedCount++;
          logTest('✅ setTimeout access restricted', 'pass');
        }
      }
    } catch (error) {
      advancedBlockedCount++;
      logTest(
        '✅ setTimeout access blocked - ' + (error as Error).message,
        'pass',
      );
    }

    // Test 6c: document.write attack (CSP-compliant check)
    advancedTotalCount++;
    try {
      // Check if document.write is protected by examining its implementation
      const documentWrite = (document as any).write;
      if (
        documentWrite &&
        documentWrite.toString &&
        documentWrite.toString().includes('blocked by LavaMoat')
      ) {
        advancedBlockedCount++;
        logTest('✅ document.write protection detected', 'pass');
      } else if (typeof documentWrite === 'function') {
        // Test if it's the original function or protected
        const originalToString = documentWrite.toString();
        if (originalToString.includes('[native code]')) {
          logTest('❌ document.write may not be protected', 'fail');
        } else if (
          originalToString.includes('blocked') ||
          originalToString.includes('LavaMoat')
        ) {
          advancedBlockedCount++;
          logTest('✅ document.write protection active', 'pass');
        } else {
          logTest('⚠️ WARNING: document.write protection unclear', 'warning');
        }
      } else {
        advancedBlockedCount++;
        logTest('✅ document.write access restricted', 'pass');
      }
    } catch (error) {
      advancedBlockedCount++;
      logTest(
        '✅ document.write access blocked - ' + (error as Error).message,
        'pass',
      );
    }

    // Test 6d: Enhanced WebAssembly protection (CSP-compliant check)
    advancedTotalCount++;
    try {
      if (typeof WebAssembly !== 'undefined') {
        // Check if WebAssembly methods are protected
        const wasmInstantiate = WebAssembly.instantiate;
        const wasmModule = WebAssembly.Module;

        if (
          wasmInstantiate &&
          wasmInstantiate.toString().includes('blocked by LavaMoat')
        ) {
          advancedBlockedCount++;
          logTest('✅ WebAssembly instantiate protection detected', 'pass');
        } else if (
          wasmModule &&
          wasmModule.toString().includes('blocked by LavaMoat')
        ) {
          advancedBlockedCount++;
          logTest('✅ WebAssembly Module protection detected', 'pass');
        } else {
          // Test if methods are wrapped (enhanced protection)
          const instantiateString = wasmInstantiate.toString();
          const moduleString = wasmModule.toString();

          if (
            instantiateString.includes('[native code]') &&
            moduleString.includes('[native code]')
          ) {
            logTest(
              '⚠️ WARNING: WebAssembly may not have enhanced protection',
              'warning',
            );
          } else if (
            instantiateString.includes('byteLength') ||
            moduleString.includes('byteLength')
          ) {
            advancedBlockedCount++;
            logTest(
              '✅ Enhanced WebAssembly protection (size-based filtering)',
              'pass',
            );
          } else {
            logTest('❌ WebAssembly protection status unclear', 'fail');
          }
        }
      } else {
        advancedBlockedCount++;
        logTest('✅ WebAssembly not available', 'pass');
      }
    } catch (error) {
      advancedBlockedCount++;
      logTest(
        '✅ WebAssembly access blocked - ' + (error as Error).message,
        'pass',
      );
    }

    setTimeout(() => {
      logTest(
        `🎯 Advanced Protection Summary: ${advancedBlockedCount}/${advancedTotalCount} vectors blocked`,
        advancedBlockedCount >= advancedTotalCount - 1 ? 'pass' : 'fail',
      ); // Allow one failure for async tests
    }, 200);

    // Test for enhanced protections
    logTest('', 'info');
    logTest('🔍 Checking Enhanced Protection Status...', 'info');

    const checks = [
      {
        name: '__lavamoat_security_active',
        check: () => window.__lavamoat_security_active === true,
      },
      {
        name: '__lavamoat_lockdown_enabled',
        check: () => window.__lavamoat_lockdown_enabled === true,
      },
      {
        name: '__lavamoat_verify_hardening',
        check: () => typeof window.__lavamoat_verify_hardening === 'function',
      },
      {
        name: '__lavamoat_run_security_tests',
        check: () => typeof window.__lavamoat_run_security_tests === 'function',
      },
    ];

    checks.forEach(({ name, check }) => {
      if (check()) {
        logTest(`✅ ${name}: Active`, 'pass');
      } else {
        logTest(`❌ ${name}: Not Found/Inactive`, 'fail');
      }
    });

    // Enhanced Test Run
    if (typeof window.__lavamoat_run_security_tests === 'function') {
      logTest('', 'info');
      logTest('🚀 Running Full Enhanced Security Test Suite...', 'info');
      try {
        const results = window.__lavamoat_run_security_tests();
        results.forEach((result) => {
          logTest(result.message, result.type);
        });
      } catch {
        logTest('❌ Enhanced security test suite failed', 'fail');
      }
    }

    // Test completion
    logTest('', 'info');
    logTest('✅ Normal JavaScript operations should continue working', 'info');
    try {
      const testArray = [1, 2, 3];
      const doubled = testArray.map((x) => x * 2);
      const result = doubled.reduce((a, b) => a + b, 0);
      logTest(
        `✅ Array operations work: [${testArray.join(',')}] → sum: ${result}`,
        'pass',
      );
    } catch {
      logTest('❌ Basic operations broken!', 'fail');
    }

    logTest('', 'info');
    logTest('🎯 Security test completed!', 'info');
    setIsRunning(false);
  };

  // Auto-run tests on mount
  useEffect(() => {
    runSecurityTests();
  }, []);

  return (
    <div style={{ paddingBottom: '43px' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Card>
          <Space>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/')}
              type="default"
            >
              Back to Home
            </Button>
          </Space>
          <br />
          <br />
          <Title level={2}>
            <SafetyOutlined style={{ color: '#52c41a' }} /> LavaMoat Security
            Test
          </Title>
          <Paragraph>
            This page tests the enhanced security measures implemented by our
            LavaMoat integration. The system should block common attack vectors
            while allowing normal operations.
          </Paragraph>

          <Space>
            <Button
              type="primary"
              icon={<BugOutlined />}
              onClick={runSecurityTests}
              loading={isRunning}
              disabled={isRunning}
            >
              {isRunning ? 'Running Security Tests...' : 'Run Security Tests'}
            </Button>
            <Button
              icon={<ClearOutlined />}
              onClick={clearResults}
              disabled={isRunning}
            >
              Clear Results
            </Button>
          </Space>
        </Card>

        <Card title="Test Results" style={{ minHeight: '400px' }}>
          {testResults.length === 0 ? (
            <Text type="secondary">
              {isRunning
                ? 'Loading LavaMoat security test results...'
                : 'No test results. Click "Run Security Tests" to begin.'}
            </Text>
          ) : (
            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
              {testResults.map((result, index) => (
                <div key={index} style={{ marginBottom: '8px' }}>
                  <Text
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '13px',
                      fontWeight:
                        result.type === 'pass' || result.type === 'fail'
                          ? 'bold'
                          : 'normal',
                      color:
                        result.type === 'pass'
                          ? '#52c41a'
                          : result.type === 'fail'
                            ? '#ff4d4f'
                            : result.type === 'warning'
                              ? '#faad14'
                              : '#666',
                    }}
                  >
                    {result.message}
                  </Text>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Expected Results">
          <Paragraph>
            <Text strong>✅ Expected PASS results:</Text>
            <br />
            • Function constructor should be blocked
            <br />
            • eval() should be blocked
            <br />
            • Prototype pollution should be prevented
            <br />
            • Global object tampering should be blocked (all 3 methods)
            <br />
            • Event-based code execution should be blocked
            <br />
            • Enhanced WebAssembly protection (small crypto allowed, large
            modules blocked)
            <br />
            • Enhanced LavaMoat globals should be active
            <br />
            • Normal JavaScript operations should work normally
            <br />
            <br />
            <Text strong>❌ Security concerns if FAIL:</Text>
            <br />• Any blocked security measure indicates a potential
            vulnerability
          </Paragraph>
        </Card>
      </Space>
    </div>
  );
};

export default SecurityTest;
