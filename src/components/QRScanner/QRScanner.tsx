import { useEffect, useRef, useState } from 'react';
import { Modal, Alert, Typography } from 'antd';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

// Minimal typings for the experimental BarcodeDetector API, which is not yet
// part of the TS DOM lib. We only use the small surface we need.
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?(): Promise<string[]>;
}

/**
 * Returns true when the browser exposes the BarcodeDetector API, which lets us
 * scan QR codes without bundling a heavy QR-decoding dependency.
 */
export function isQrScanSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'BarcodeDetector' in window &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}

function QRScanner(props: {
  open: boolean;
  onClose: () => void;
  onResult: (value: string) => void;
}) {
  const { open, onClose, onResult } = props;
  const { t } = useTranslation(['send', 'common']);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;

    const stop = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };

    const start = async () => {
      setError(null);
      try {
        const BarcodeDetectorCtor = (
          window as unknown as {
            BarcodeDetector?: BarcodeDetectorConstructor;
          }
        ).BarcodeDetector;
        if (!BarcodeDetectorCtor) {
          setError(t('send:qr_not_supported'));
          return;
        }
        const detector = new BarcodeDetectorCtor({ formats: ['qr_code'] });
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();

        const scan = async () => {
          if (cancelled || !videoRef.current) {
            return;
          }
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0 && barcodes[0].rawValue) {
              onResult(barcodes[0].rawValue);
              return;
            }
          } catch {
            // transient detection error — keep scanning
          }
          rafRef.current = requestAnimationFrame(() => {
            void scan();
          });
        };
        rafRef.current = requestAnimationFrame(() => {
          void scan();
        });
      } catch {
        if (!cancelled) {
          setError(t('send:qr_camera_error'));
        }
      }
    };

    void start();

    return () => {
      cancelled = true;
      stop();
    };
  }, [open, onResult, t]);

  return (
    <Modal
      title={t('send:scan_qr')}
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnClose
    >
      {error ? (
        <Alert type="warning" showIcon message={error} />
      ) : (
        <>
          <video
            ref={videoRef}
            style={{
              width: '100%',
              borderRadius: 8,
              background: '#000',
            }}
            muted
            playsInline
          />
          <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
            {t('send:qr_hint')}
          </Text>
        </>
      )}
    </Modal>
  );
}

export default QRScanner;
