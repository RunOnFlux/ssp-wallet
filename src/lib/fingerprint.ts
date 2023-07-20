import crypto from 'crypto';

export function getFingerprint(): string {
  const {
    cookieEnabled,
    doNotTrack,
    hardwareConcurrency,
    language,
    languages,
    maxTouchPoints,
    platform,
    userAgent,
    vendor,
  } = window.navigator;

  const { width, height, colorDepth, pixelDepth } = window.screen;
  const timezoneOffset = new Date().getTimezoneOffset();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
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
      // return empty string if canvas element not supported
      return '';
    }
    if (ctx) {
      // https://www.browserleaks.com/canvas#how-does-it-work
      // Text with lowercase/uppercase/punctuation symbols
      const txt = 'ClientJS,org <canvas> 1.0';
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
  console.log(canvas);
  console.log(crypto);

  const fingerprint = JSON.stringify({
    canvas,
    colorDepth,
    cookieEnabled,
    devicePixelRatio,
    doNotTrack,
    hardwareConcurrency,
    height,
    language,
    languages,
    maxTouchPoints,
    pixelDepth,
    platform,
    timezone,
    timezoneOffset,
    touchSupport,
    userAgent,
    vendor,
    width,
  });
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const fingerprintHash: string = crypto
    .createHash('sha256')
    .update(fingerprint)
    .digest('hex');
  return fingerprintHash;
}
