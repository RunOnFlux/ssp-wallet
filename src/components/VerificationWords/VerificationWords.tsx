import { theme } from 'antd';

import { VERIFY_ACCENTS } from '../../lib/pairingVerification';
import './VerificationWords.css';

/**
 * Verification-code display — the out-of-band cross-check that defeats a
 * malicious relay swapping values in transit. Both SSP Wallet and SSP Key
 * derive the same 6 words from their own view of the exchange (see
 * lib/verificationCode); the user compares them across the two devices.
 *
 * Presentational only — words are computed by the caller and passed in.
 * Rendering matches SSP Key's copy (same order, casing, accents, mono face) so
 * a side-by-side eyeball comparison is fast. NEVER log the words.
 */
function VerificationWords({
  words,
  testId = 'verify-words',
}: {
  words: string[];
  testId?: string;
}) {
  const { token } = theme.useToken();

  const renderChip = (word: string, index: number) => (
    <span
      key={`${index}-${word}`}
      className="sspVerifyChip"
      style={{
        background: token.colorBgContainer,
        borderColor: token.colorBorder,
      }}
    >
      <span
        className="sspVerifyChipIndex"
        style={{
          color: '#0c0a09',
          background: VERIFY_ACCENTS[index % VERIFY_ACCENTS.length],
        }}
      >
        {index + 1}
      </span>
      <span className="sspVerifyChipWord" style={{ color: token.colorText }}>
        {word}
      </span>
    </span>
  );

  return (
    <div
      className="sspVerifyGroups"
      data-testid={testId}
      aria-label={words.join(' ')}
    >
      <div className="sspVerifyChips">
        {words.slice(0, 3).map((word, index) => renderChip(word, index))}
      </div>
      <div className="sspVerifyChips">
        {words.slice(3).map((word, index) => renderChip(word, index + 3))}
      </div>
    </div>
  );
}

export default VerificationWords;
