import crypto, { randomBytes } from 'crypto';

export function getFingerprint(extraText = ''): string {
  const {
    cookieEnabled,
    doNotTrack,
    hardwareConcurrency,
    maxTouchPoints,
    platform,
    vendor,
  } = window.navigator;

  const { width, height, colorDepth, pixelDepth } = window.screen;
  const touchSupport = 'ontouchstart' in window;

  function getCanvasPrint() {
    // create a canvas element
    const canvas = document.createElement('canvas');

    // define a context let that will be used for browsers with canvas support
    let ctx;

    // try/catch for older browsers that don't support the canvas element
    try {
      // attempt to give ctx a 2d canvas context value
      ctx = canvas.getContext('2d');
    } catch (e) {
      console.log(e);
      // return empty string if canvas element not supported
      return '';
    }
    if (ctx) {
      // https://www.browserleaks.com/canvas#how-does-it-work
      // Text with lowercase/uppercase/punctuation symbols
      const txt = 'ClientJS,org <canvas> 1.0' + extraText;
      ctx.textBaseline = 'top';
      // The most common type

      ctx.font = "14px 'Arial'";
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      // Some tricks for color mixing to increase the difference in rendering
      ctx.fillStyle = '#069';
      ctx.fillText(txt, 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText(txt, 4, 17);
    }
    return canvas.toDataURL();
  }
  const canvas = getCanvasPrint();

  const fingerprint = JSON.stringify({
    canvas,
    colorDepth,
    cookieEnabled,
    doNotTrack,
    hardwareConcurrency,
    height,
    maxTouchPoints,
    pixelDepth,
    platform,
    touchSupport,
    vendor,
    width,
  });
  const fingerprintHash: string = crypto
    .createHash('sha256')
    .update(fingerprint)
    .digest('hex');
  return fingerprintHash;
}

export function getRandomParams(): string {
  const randomParams = randomBytes(64).toString('hex');
  return randomParams;
}
