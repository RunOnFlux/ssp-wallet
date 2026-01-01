/**
 * SSP Authentication Demo
 *
 * This demo shows how to integrate SSP Identity authentication into your website.
 * It demonstrates both single-factor (wallet only) and two-factor (wallet + key) modes.
 */

// Store the last authentication response
let lastAuthResponse = null;

/**
 * Creates a valid authentication message with timestamp
 * @returns {string} Hex-encoded message
 */
function createAuthMessage() {
  // Current timestamp in milliseconds (13 digits)
  const timestamp = Date.now().toString();

  // Generate random challenge (using crypto API if available, fallback to Math.random)
  let challenge;
  if (window.crypto && window.crypto.getRandomValues) {
    const array = new Uint8Array(16);
    window.crypto.getRandomValues(array);
    challenge = Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
  } else {
    challenge = Math.random().toString(36).substring(2, 18).padEnd(16, '0');
  }

  // Combine timestamp and challenge
  const message = timestamp + challenge;

  // Convert to hex
  const hexMessage = stringToHex(message);

  console.log('Created auth message:', {
    timestamp,
    challenge,
    message,
    hexMessage
  });

  return hexMessage;
}

/**
 * Convert string to hex
 */
function stringToHex(str) {
  return Array.from(str)
    .map(c => c.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex to string
 */
function hexToString(hex) {
  let str = '';
  for (let i = 0; i < hex.length; i += 2) {
    str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
  }
  return str;
}

/**
 * Main authentication function
 * @param {number} authMode - 1 for wallet only, 2 for wallet + key
 */
async function authenticate(authMode) {
  // Check if SSP Wallet is available
  if (typeof window.ssp === 'undefined') {
    showError('SSP Wallet extension not detected. Please install SSP Wallet to continue.');
    return;
  }

  // Show loading state
  showLoading(authMode);

  try {
    // Create the authentication message
    const message = createAuthMessage();

    // Request signature from SSP Wallet
    console.log('Requesting SSP authentication...', { authMode, message });

    const response = await window.ssp.request('wk_sign_message', {
      message: message,
      authMode: authMode,
      origin: window.location.origin,
      siteName: 'SSP Auth Demo',
      description: 'Sign in to access the demo dashboard',
      iconUrl: window.location.origin + '/favicon.ico'
    });

    console.log('SSP response:', response);

    if (response.status === 'SUCCESS') {
      // Store the response
      lastAuthResponse = response.result;

      // Validate the response (client-side validation for demo)
      const validation = validateResponse(response.result, authMode);

      if (validation.valid) {
        showAuthenticated(response.result, authMode);
      } else {
        showError('Validation failed: ' + validation.error);
      }
    } else {
      showError(response.result || response.data || 'Authentication was cancelled or failed');
    }
  } catch (error) {
    console.error('Authentication error:', error);
    showError(error.message || 'An unexpected error occurred');
  }
}

/**
 * Validate the authentication response (client-side demo validation)
 * Note: In production, this should be done server-side!
 */
function validateResponse(result, authMode) {
  try {
    // Check required fields
    if (!result.walletSignature || !result.walletPubKey) {
      return { valid: false, error: 'Missing wallet signature data' };
    }

    if (!result.witnessScript || !result.wkIdentity) {
      return { valid: false, error: 'Missing identity data' };
    }

    if (!result.message) {
      return { valid: false, error: 'Missing message' };
    }

    // Validate timestamp from message
    const decodedMessage = hexToString(result.message);
    const timestamp = parseInt(decodedMessage.substring(0, 13), 10);

    if (isNaN(timestamp)) {
      return { valid: false, error: 'Invalid timestamp in message' };
    }

    const now = Date.now();
    const maxAge = 15 * 60 * 1000; // 15 minutes
    const maxFuture = 5 * 60 * 1000; // 5 minutes

    if (timestamp < now - maxAge) {
      return { valid: false, error: 'Message has expired' };
    }

    if (timestamp > now + maxFuture) {
      return { valid: false, error: 'Message timestamp is in the future' };
    }

    // For two-factor mode, check key signature
    if (authMode === 2) {
      if (!result.keySignature || !result.keyPubKey) {
        return { valid: false, error: 'Missing key signature for two-factor auth' };
      }
    }

    // Validate public key format (66 hex chars for compressed)
    if (result.walletPubKey.length !== 66) {
      return { valid: false, error: 'Invalid wallet public key format' };
    }

    if (authMode === 2 && result.keyPubKey && result.keyPubKey.length !== 66) {
      return { valid: false, error: 'Invalid key public key format' };
    }

    // Validate identity address format (bc1q for mainnet P2WSH)
    if (!result.wkIdentity.startsWith('bc1q') && !result.wkIdentity.startsWith('tb1q')) {
      return { valid: false, error: 'Invalid identity address format' };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

/**
 * Show loading state
 */
function showLoading(authMode) {
  hideAll();
  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('loadingMode').textContent =
    authMode === 2 ? 'Two-Factor Authentication' : 'Wallet Only';
}

/**
 * Show authenticated state
 */
function showAuthenticated(result, authMode) {
  hideAll();
  document.getElementById('authenticated').classList.remove('hidden');

  // Display user info
  const identity = result.wkIdentity;
  document.getElementById('userIdentity').textContent =
    identity.substring(0, 12) + '...' + identity.substring(identity.length - 12);

  document.getElementById('authModeDisplay').textContent =
    authMode === 2 ? 'Two-Factor (Wallet + Key)' : 'Wallet Only';

  document.getElementById('authTime').textContent = new Date().toLocaleString();

  // Update verification status
  document.getElementById('walletSigStatus').classList.add('success');

  if (authMode === 2 && result.keySignature) {
    document.getElementById('keySigStatus').classList.add('success');
  } else {
    document.getElementById('keySigStatus').classList.add('na');
    document.getElementById('keySigStatus').querySelector('span').textContent = 'Key Signature (N/A)';
  }

  document.getElementById('identityStatus').classList.add('success');
}

/**
 * Show error state
 */
function showError(message) {
  hideAll();
  document.getElementById('error').classList.remove('hidden');
  document.getElementById('errorMessage').textContent = message;
}

/**
 * Reset to initial state
 */
function resetState() {
  hideAll();
  document.getElementById('notConnected').classList.remove('hidden');
  lastAuthResponse = null;

  // Reset verification status classes
  ['walletSigStatus', 'keySigStatus', 'identityStatus'].forEach(id => {
    const el = document.getElementById(id);
    el.classList.remove('success', 'na');
  });
  document.getElementById('keySigStatus').querySelector('span').textContent = 'Key Signature';
}

/**
 * Logout
 */
function logout() {
  lastAuthResponse = null;
  resetState();
}

/**
 * Hide all card states
 */
function hideAll() {
  ['notConnected', 'loading', 'authenticated', 'error'].forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });
}

/**
 * Show response details modal
 */
function showDetails() {
  if (!lastAuthResponse) return;

  const formatted = JSON.stringify(lastAuthResponse, null, 2);
  document.getElementById('responseDetails').textContent = formatted;
  document.getElementById('detailsModal').classList.remove('hidden');
}

/**
 * Hide response details modal
 */
function hideDetails() {
  document.getElementById('detailsModal').classList.add('hidden');
}

/**
 * Copy response to clipboard
 */
async function copyResponse() {
  if (!lastAuthResponse) return;

  try {
    await navigator.clipboard.writeText(JSON.stringify(lastAuthResponse, null, 2));
    alert('Response copied to clipboard!');
  } catch (error) {
    console.error('Failed to copy:', error);
    alert('Failed to copy to clipboard');
  }
}

// Close modal on escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    hideDetails();
  }
});

// Close modal on backdrop click
document.getElementById('detailsModal')?.addEventListener('click', (e) => {
  if (e.target.id === 'detailsModal') {
    hideDetails();
  }
});

// Log SSP availability on load
window.addEventListener('load', () => {
  if (typeof window.ssp !== 'undefined') {
    console.log('SSP Wallet detected!');
  } else {
    console.log('SSP Wallet not detected. Please install the extension.');
  }
});
