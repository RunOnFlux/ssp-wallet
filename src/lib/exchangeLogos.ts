// Local exchange provider logos
import changelly from '../assets/logos/exchanges/changelly.svg';
import changenow from '../assets/logos/exchanges/changenow.svg';
import simpleswap from '../assets/logos/exchanges/simpleswap.svg';
import changehero from '../assets/logos/exchanges/changehero.svg';
import xoswap from '../assets/logos/exchanges/xoswap.svg';
import fusion from '../assets/logos/exchanges/fusion.svg';

// Map exchange provider names to local logo imports (exact names from API)
export const exchangeLogos: Record<string, string> = {
  Changelly: changelly,
  ChangeNow: changenow,
  SimpleSwap: simpleswap,
  ChangeHero: changehero,
  XOSwap: xoswap,
  Fusion: fusion,
};

// Get logo by exchange name
export function getExchangeLogo(exchangeName: string): string {
  return exchangeLogos[exchangeName] || '';
}
