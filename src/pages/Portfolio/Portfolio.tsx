import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Skeleton, Image, Tooltip } from 'antd';
import type { NoticeType } from 'antd/es/message/interface';
import {
  ArrowDown as ArrowDownIcon,
  ArrowUp as ArrowUpIcon,
  LoaderCircle as LoaderCircleIcon,
  QrCode as QrCodeIcon,
  RotateCw as RotateCwIcon,
} from 'lucide-react';
import BigNumber from 'bignumber.js';
import { useTranslation } from 'react-i18next';
import { toast } from '../../lib/toast';
import { useAppSelector } from '../../hooks';
import { usePrivacyMode } from '../../contexts/PrivacyContext';
import { sspConfig } from '@storage/ssp';
import { isTestnetChain } from '@storage/blockchains';
import { switchToChain } from '../../lib/chainSwitching';
import {
  loadPortfolio,
  updatePortfolioSnapshots,
  type PortfolioResult,
  type PortfolioChange,
} from '../../lib/portfolio';
import { formatFiatWithSymbol, formatCrypto } from '../../lib/currency';
import type { cryptos } from '../../types';
import './Portfolio.css';

// Categorical palette (DESIGN_TOKENS §chart) — amber-led, colour-blind checked.
const CHART_COLORS = [
  '#FBBF24',
  '#3B82F6',
  '#22C55E',
  '#A855F7',
  '#F97316',
  '#14B8A6',
  '#EC4899',
  '#78716C',
];

function Portfolio() {
  const { t } = useTranslation(['home', 'common']);
  const navigate = useNavigate();
  const { hidden, togglePrivacy } = usePrivacyMode();
  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const { activeChain } = useAppSelector((state) => state.sspState);
  // The active chain's current address — empty until the shell has derived it.
  // Right after onboarding the app lands here BEFORE address generation
  // finishes; the load effect below keys on this so the freshly paired chain
  // moves out of "Not yet activated" the moment its address exists.
  const activeAddress = useAppSelector((state) => {
    const chainState = state[activeChain];
    return chainState?.wallets?.[chainState.walletInUse]?.address ?? '';
  });
  const { cryptoRates, fiatRates } = useAppSelector(
    (state) => state.fiatCryptoRates,
  );
  const [data, setData] = useState<PortfolioResult | null>(null);
  const [change, setChange] = useState<PortfolioChange | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [switching, setSwitching] = useState<keyof cryptos | null>(null);

  const fiatCurrency = sspConfig().fiatCurrency;

  const displayMessage = (type: NoticeType, content: string) => {
    void toast.open({ type, content });
  };

  // Rates readiness: the fiatCryptoRates slice initializes every rate to 0 and
  // only ever moves via setCryptoRates/setFiatRates once the controller fetch
  // lands. Until then any fiat total computes as 0 — a state that must never
  // be snapshotted or shown as a "-100%" 24h change.
  const ratesLoaded = useMemo(
    () =>
      Object.values(cryptoRates).some(
        (rate) => typeof rate === 'number' && rate > 0,
      ) && (fiatRates[fiatCurrency] ?? 0) > 0,
    [cryptoRates, fiatRates, fiatCurrency],
  );

  // Latest rates, readable at load-COMPLETION time. The mount effect captures
  // the first render's load closure (all-zero rates); a slow live load could
  // otherwise resolve AFTER real rates arrived and overwrite correctly-valued
  // data with $0 totals until the next 5-minute rates poll.
  const ratesRef = useRef({ cryptoRates, fiatRates, ratesLoaded });
  ratesRef.current = { cryptoRates, fiatRates, ratesLoaded };

  // Resolves to false when the load failed — a user-initiated refresh must be
  // able to tell the user, instead of spinning and showing the same figures.
  const load = async (live: boolean): Promise<boolean> => {
    try {
      const startRates = ratesRef.current;
      let result = await loadPortfolio(
        startRates.cryptoRates,
        startRates.fiatRates,
        fiatCurrency,
        live,
      );
      if (
        ratesRef.current.cryptoRates !== startRates.cryptoRates ||
        ratesRef.current.fiatRates !== startRates.fiatRates
      ) {
        // rates landed while the (network) load ran — revalue from the
        // just-written cache with the fresh rates before painting
        result = await loadPortfolio(
          ratesRef.current.cryptoRates,
          ratesRef.current.fiatRates,
          fiatCurrency,
          false,
        );
      }
      setData(result);
      // Snapshots/change only make sense once rates are in — with all-zero
      // rates the total is 0 because of missing rates, not missing funds.
      if (live && ratesRef.current.ratesLoaded) {
        const ch = await updatePortfolioSnapshots(
          result.totalFiat,
          fiatCurrency,
        );
        setChange(ch);
      }
      return true;
    } catch (error) {
      console.log('[portfolio] load failed', error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Instant paint from cache, then a live concurrent refresh. Re-runs if
      // the active chain's address materializes after mount (fresh pairing).
      await load(false);
      if (cancelled) return;
      await load(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeAddress]);

  // Re-value (not re-fetch) when rates change. Also re-fires once data first
  // loads, so rates that arrived while data was still null are applied. Once
  // rates are in, the 24h change is (re)computed too — the mount-time live
  // load may have run before rates existed and skipped it.
  const hasData = data !== null;
  useEffect(() => {
    if (!hasData) return;
    void (async () => {
      try {
        const result = await loadPortfolio(
          cryptoRates,
          fiatRates,
          fiatCurrency,
          false,
        );
        setData(result);
        if (ratesLoaded) {
          const ch = await updatePortfolioSnapshots(
            result.totalFiat,
            fiatCurrency,
          );
          setChange(ch);
        }
      } catch (error) {
        console.log('[portfolio] revalue failed', error);
      }
    })();
  }, [hasData, cryptoRates, fiatRates, fiatCurrency, ratesLoaded]);

  const manualRefresh = () => {
    setRefreshing(true);
    void load(true)
      .then((ok) => {
        if (!ok) {
          displayMessage(
            'error',
            t(
              'home:portfolio.refresh_failed',
              "Couldn't refresh — showing the last saved values.",
            ),
          );
        }
      })
      .finally(() => setRefreshing(false));
  };

  const activeChains = useMemo(
    () => (data ? data.chains.filter((c) => !c.needsActivation) : []),
    [data],
  );
  // Testnets stay out of the activation list unless enabled in Settings.
  // A testnet the user already synced is active and therefore always shown.
  const showTestnets = Boolean(sspConfig().showTestnets);
  const inactiveChains = useMemo(
    () =>
      data
        ? data.chains.filter(
            (c) =>
              c.needsActivation && (showTestnets || !isTestnetChain(c.chain)),
          )
        : [],
    [data, showTestnets],
  );
  const totalFiat = data?.totalFiat ?? 0;

  // Truly-empty wallet: every active chain holds zero native AND zero tokens.
  // Judged on crypto amounts, not fiat — fiat is also 0 while rates are still
  // loading, and the CTA must not flash for funded wallets during that window.
  const isEmptyWallet = useMemo(
    () =>
      activeChains.length > 0 &&
      activeChains.every(
        (c) => c.crypto.isZero() && c.tokens.every((tk) => tk.crypto.isZero()),
      ),
    [activeChains],
  );

  const allocation = useMemo(() => {
    if (!data || totalFiat <= 0) return [];
    return activeChains
      .filter((c) => c.fiat > 0)
      .map((c, i) => ({
        chain: c.chain,
        name: c.name,
        pct: (c.fiat / totalFiat) * 100,
        color: CHART_COLORS[i % CHART_COLORS.length],
      }));
  }, [data, activeChains, totalFiat]);

  // Same contract as the wallet switcher: one switch at a time, and a failed
  // derivation (bad password / seed) says so instead of doing nothing at all.
  // `switching` is deliberately NOT cleared on success — the row stays busy
  // until the /home navigation unmounts the tab.
  const switchTo = (chain: keyof cryptos) => {
    if (switching) return;
    setSwitching(chain);
    void (async () => {
      try {
        await switchToChain(chain, passwordBlob);
        navigate('/home');
      } catch (error) {
        console.log(error);
        setSwitching(null);
        displayMessage('error', t('home:chainSelect.unable_switch_chain'));
      }
    })();
  };

  if (loading) {
    return (
      <div className="portfolio-tab">
        <Skeleton.Input
          active
          size="large"
          style={{ width: 200, height: 40 }}
        />
        <div style={{ height: 24 }} />
        <Skeleton active paragraph={{ rows: 5 }} title={false} />
      </div>
    );
  }

  return (
    <div className="portfolio-tab">
      <div className="portfolio-header">
        <div className="portfolio-title-row">
          <h2 className="portfolio-title">
            {t('home:tabs.portfolio', 'Portfolio')}
          </h2>
          <Tooltip title={t('home:navbar.refresh')}>
            {/* Same glyph, tint and spin as the Activity tab's refresh — one
                action must never read as two different controls. */}
            <button
              type="button"
              className="portfolio-refresh"
              onClick={manualRefresh}
              disabled={refreshing}
              aria-label={t('home:navbar.refresh')}
            >
              <RotateCwIcon className={refreshing ? 'lucide-spin' : ''} />
            </button>
          </Tooltip>
        </div>
        <button
          type="button"
          className="portfolio-total"
          onClick={togglePrivacy}
          aria-label={
            hidden ? t('home:balances.show') : t('home:balances.hide')
          }
          title={hidden ? t('home:balances.show') : t('home:balances.hide')}
        >
          <span className="privacy-sensitive portfolio-total-amount">
            {formatFiatWithSymbol(new BigNumber(totalFiat))}
          </span>
          {change && change.available && (
            <span
              className={`portfolio-change ${change.absolute >= 0 ? 'up' : 'down'}`}
            >
              {change.absolute >= 0 ? <ArrowUpIcon /> : <ArrowDownIcon />}
              <span className="privacy-sensitive">
                {formatFiatWithSymbol(new BigNumber(Math.abs(change.absolute)))}{' '}
                ({change.percent >= 0 ? '+' : ''}
                {change.percent.toFixed(2)}%) · 24h
              </span>
            </span>
          )}
        </button>
      </div>

      {isEmptyWallet && (
        <button
          type="button"
          className="portfolio-empty-cta"
          onClick={() => navigate('/home', { state: { openReceive: true } })}
        >
          <QrCodeIcon className="portfolio-empty-cta-icon" aria-hidden="true" />
          <span className="portfolio-empty-cta-meta">
            <span className="portfolio-empty-cta-title">
              {t(
                'home:portfolio.receive_first_title',
                'Receive your first crypto',
              )}
            </span>
            <span className="portfolio-empty-cta-sub">
              {t(
                'home:portfolio.receive_first_sub',
                'Show your address to get started',
              )}
            </span>
          </span>
        </button>
      )}

      {allocation.length > 0 && (
        <div className="portfolio-allocation">
          {/* Decorative for AT — the legend below carries the same data */}
          <div className="allocation-bar" aria-hidden="true">
            {allocation.map((a) => (
              <Tooltip key={a.chain} title={`${a.name} · ${a.pct.toFixed(1)}%`}>
                <span
                  className="allocation-seg"
                  style={{ width: `${a.pct}%`, background: a.color }}
                />
              </Tooltip>
            ))}
          </div>
          <div className="allocation-legend">
            {allocation.slice(0, 6).map((a) => (
              <span key={a.chain} className="allocation-legend-item">
                <span
                  className="allocation-dot"
                  style={{ background: a.color }}
                />
                {a.name} {a.pct.toFixed(0)}%
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="portfolio-list">
        {activeChains.map((c) => (
          <button
            key={c.chain}
            type="button"
            className="portfolio-row"
            onClick={() => switchTo(c.chain)}
            disabled={switching !== null}
            aria-busy={switching === c.chain}
          >
            <Image height={28} width={28} preview={false} src={c.logo} alt="" />
            <span className="portfolio-row-meta">
              <span className="portfolio-row-name">{c.name}</span>
              <span className="portfolio-row-crypto privacy-sensitive">
                {formatCrypto(c.crypto)} {c.symbol}
              </span>
            </span>
            <span className="portfolio-row-fiat-col">
              <span className="portfolio-row-fiat privacy-sensitive">
                {formatFiatWithSymbol(new BigNumber(c.fiat))}
              </span>
              {c.tokenFiat > 0 && (
                <span className="portfolio-row-tokens privacy-sensitive">
                  {t('home:portfolio.incl_tokens', {
                    amount: formatFiatWithSymbol(new BigNumber(c.tokenFiat)),
                    defaultValue: 'incl. {{amount}} tokens',
                  })}
                </span>
              )}
            </span>
            {switching === c.chain && (
              <LoaderCircleIcon
                className="lucide-spin portfolio-row-spinner"
                aria-hidden="true"
              />
            )}
          </button>
        ))}
      </div>

      {inactiveChains.length > 0 && (
        <>
          <div className="portfolio-section-title">
            {t('home:portfolio.not_activated', 'Not yet activated')}
          </div>
          <div className="portfolio-list">
            {inactiveChains.map((c) => (
              <button
                key={c.chain}
                type="button"
                className="portfolio-row portfolio-row-inactive"
                onClick={() => switchTo(c.chain)}
                disabled={switching !== null}
                aria-busy={switching === c.chain}
              >
                <Image
                  height={28}
                  width={28}
                  preview={false}
                  src={c.logo}
                  alt=""
                />
                <span className="portfolio-row-meta">
                  <span className="portfolio-row-name">{c.name}</span>
                  <span className="portfolio-row-crypto">
                    {switching === c.chain
                      ? t('home:portfolio.activating', 'Activating…')
                      : t('home:portfolio.tap_to_activate', 'Tap to activate')}
                  </span>
                </span>
                {switching === c.chain && (
                  <LoaderCircleIcon
                    className="lucide-spin portfolio-row-spinner"
                    aria-hidden="true"
                  />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default Portfolio;
