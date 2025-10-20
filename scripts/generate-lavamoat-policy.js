#!/usr/bin/env node

/**
 * Generate Static LavaMoat Policy
 * 
 * This script generates a strict, minimal LavaMoat policy that follows
 * the principle of least privilege for maximum security.
 * 
 * Usage: npm run generate-policy
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔒 Generating strict LavaMoat security policy...\n');

// Step 1: Build the plugin to ensure latest policy generator
console.log('📦 Building LavaMoat plugin...');
try {
  execSync('npm run build', { 
    cwd: path.join(__dirname, '../packages/vite-plugin-lavamoat'),
    stdio: 'inherit'
  });
  console.log('✅ Plugin built successfully\n');
} catch (error) {
  console.error('❌ Failed to build plugin:', error.message);
  process.exit(1);
}

// Step 2: Remove existing policy to force regeneration
const policyPath = path.join(__dirname, '../security/vite-lavamoat-policy.json');
if (fs.existsSync(policyPath)) {
  fs.unlinkSync(policyPath);
  console.log('🗑️  Removed existing policy file\n');
}

// Step 3: Generate new policy with strict mode
console.log('🔧 Generating strict security policy...');
try {
  // Temporarily enable policy generation for this run
  const viteConfigPath = path.join(__dirname, '../vite.config.ts');
  const originalConfig = fs.readFileSync(viteConfigPath, 'utf8');
  
  // Ensure generatePolicy is enabled
  const configWithGeneration = originalConfig.replace(
    /generatePolicy:\s*false/,
    'generatePolicy: true'
  );
  fs.writeFileSync(viteConfigPath, configWithGeneration);
  
  // Run the build to generate policy
  execSync('npm run build > /tmp/policy-gen.log 2>&1', { 
    cwd: path.join(__dirname, '..'),
    stdio: 'pipe'
  });
  
  // Restore original config
  fs.writeFileSync(viteConfigPath, originalConfig);
  
  console.log('✅ Policy generation completed\n');
} catch (error) {
  console.error('❌ Failed to generate policy. Check /tmp/policy-gen.log for details');
  console.error('Error:', error.message);
  process.exit(1);
}

// Step 4: Analyze generated policy
if (fs.existsSync(policyPath)) {
  const policyContent = fs.readFileSync(policyPath, 'utf8');
  const policy = JSON.parse(policyContent);
  
  const packageCount = Object.keys(policy.resources).length;
  const cryptoPackages = Object.keys(policy.resources).filter(pkg => 
    pkg.includes('@scure') || 
    pkg.includes('viem') || 
    pkg.includes('crypto') || 
    pkg.includes('@alchemy')
  );
  
  const cryptoWithAccess = cryptoPackages.filter(pkg => 
    policy.resources[pkg].globals.crypto === true
  );
  
  console.log('📊 Policy Analysis:');
  console.log(`   Total packages: ${packageCount}`);
  console.log(`   Crypto packages: ${cryptoPackages.length}`);
  console.log(`   Crypto with access: ${cryptoWithAccess.length}`);
  console.log(`   Policy size: ${Math.round(policyContent.length / 1024)}KB`);
  console.log(`   File: ${path.relative(process.cwd(), policyPath)}`);
  
  if (cryptoWithAccess.length > 0) {
    console.log('\n🔐 Crypto packages with WebCrypto access:');
    cryptoWithAccess.forEach(pkg => console.log(`   ✓ ${pkg}`));
  }
  
  console.log('\n✅ Static LavaMoat policy generated successfully!');
  console.log('🔒 Security: Strict minimal permissions applied');
  console.log('📝 Next: Set generatePolicy: false in vite.config.ts');
  
} else {
  console.error('❌ Policy file was not generated');
  process.exit(1);
}