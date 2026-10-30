// Local exchange provider logos
import changelly from '../assets/logos/exchanges/changelly.svg';
import changenow from '../assets/logos/exchanges/changenow.svg';
import simpleswap from '../assets/logos/exchanges/simpleswap.svg';
import changehero from '../assets/logos/exchanges/changehero.svg';
import xoswap from '../assets/logos/exchanges/xoswap.svg';
import fusion from '../assets/logos/exchanges/fusion.svg';
import exolix from '../assets/logos/exchanges/exolix.svg';
import instaswap from '../assets/logos/exchanges/instaswap.svg';
import rango from '../assets/logos/exchanges/rango.svg';
import binanceweb3 from '../assets/logos/exchanges/binanceweb3.svg';

// Map exchange provider names to local logo imports (exact names from API)
export const exchangeLogos: Record<string, string> = {
  Changelly: changelly,
  ChangeNow: changenow,
  SimpleSwap: simpleswap,
  ChangeHero: changehero,
  XOSwap: xoswap,
  Fusion: fusion,
  Exolix: exolix,
  // One provider, three settlement rails (ABE idinstaswapfloat/private/zk).
  InstaSwap: instaswap,
  'InstaSwap Private': instaswap,
  'InstaSwap ZK': instaswap,
  Rango: rango,
  'Binance Web3': binanceweb3,
};

// Get logo by exchange name, falling back to the logo URL served by the API
// so providers added to ABE later don't render as an empty avatar
export function getExchangeLogo(
  exchangeName: string,
  apiLogo?: string,
): string {
  return exchangeLogos[exchangeName] || apiLogo || '';
}
