#!/usr/bin/env node
/**
 * Regenerate the committed LavaMoat policy from a production build of the
 * project in the current directory. Nothing is written to dist/.
 *
 * Review the resulting diff of the policy file before committing it: every
 * new global or package edge is a new capability for that dependency.
 */
import { build } from 'vite';

process.env.LAVAMOAT_POLICY_MODE = 'write';
await build({ logLevel: 'warn', build: { write: false } });
