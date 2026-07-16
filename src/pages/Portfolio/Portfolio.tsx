import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Skeleton, Image, Tooltip } from 'antd';
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import BigNumber from 'bignumber.js';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../hooks';
import { usePrivacyMode } from '../../contexts/PrivacyContext';
import { sspConfig } from '@storage/ssp';
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
  const { cryptoRates, fiatRates } = useAppSelector(
    (state) => state.fiatCryptoRates,
  );
  const [data, setData] = useState<PortfolioResult | null>(null);
  const [change, setChange] = useState<PortfolioChange | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fiatCurrency = sspConfig().fiatCurrency;

  const load = async (live: boolean) => {
    const result = await loadPortfolio(
      cryptoRates,
      fiatRates,
      fiatCurrency,
      live,
    );
    setData(result);
    setLoading(false);
    if (live) {
      const ch = await updatePortfolioSnapshots(result.totalFiat);
      setChange(ch);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Instant paint from cache, then a live concurrent refresh.
      await load(false);
      if (cancelled) return;
      await load(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-value (not re-fetch) when rates change.
  useEffect(() => {
    if (!data) return;
    void (async () => {
      const result = await loadPortfolio(
        cryptoRates,
        fiatRates,
        fiatCurrency,
        false,
      );
      setData(result);
    })();
  }, [cryptoRates, fiatRates, fiatCurrency]);

  const manualRefresh = () => {
    setRefreshing(true);
    void load(true).finally(() => setRefreshing(false));
  };

  const activeChains = useMemo(
    () => (data ? data.chains.filter((c) => !c.needsActivation) : []),
    [data],
  );
  const inactiveChains = useMemo(
    () => (data ? data.chains.filter((c) => c.needsActivation) : []),
    [data],
  );
  const totalFiat = data?.totalFiat ?? 0;

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

  const switchTo = (chain: keyof cryptos) => {
    void (async () => {
      try {
        await switchToChain(chain, passwordBlob);
        navigate('/home');
      } catch (error) {
        console.log(error);
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
            <button
              type="button"
              className={`portfolio-refresh${refreshing ? ' spinning' : ''}`}
              onClick={manualRefresh}
              aria-label={t('home:navbar.refresh')}
            >
              <ReloadOutlined />
            </button>
          </Tooltip>
        </div>
        <div
          role="button"
          tabIndex={0}
          className="portfolio-total"
          onClick={togglePrivacy}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') togglePrivacy();
          }}
          title={hidden ? t('home:balances.show') : t('home:balances.hide')}
        >
          <span className="privacy-sensitive portfolio-total-amount">
            {formatFiatWithSymbol(new BigNumber(totalFiat))}
          </span>
          {change && change.available && (
            <span
              className={`portfolio-change ${change.absolute >= 0 ? 'up' : 'down'}`}
            >
              {change.absolute >= 0 ? (
                <ArrowUpOutlined />
              ) : (
                <ArrowDownOutlined />
              )}
              <span className="privacy-sensitive">
                {formatFiatWithSymbol(new BigNumber(Math.abs(change.absolute)))}{' '}
                ({change.percent >= 0 ? '+' : ''}
                {change.percent.toFixed(2)}%) · 24h
              </span>
            </span>
          )}
        </div>
      </div>

      {allocation.length > 0 && (
        <div className="portfolio-allocation">
          <div className="allocation-bar">
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
          >
            <Image height={28} width={28} preview={false} src={c.logo} />
            <span className="portfolio-row-meta">
              <span className="portfolio-row-name">{c.name}</span>
              <span className="portfolio-row-crypto privacy-sensitive">
                {formatCrypto(c.crypto)} {c.symbol}
              </span>
            </span>
            <span className="portfolio-row-fiat privacy-sensitive">
              {formatFiatWithSymbol(new BigNumber(c.fiat))}
            </span>
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
              >
                <Image height={28} width={28} preview={false} src={c.logo} />
                <span className="portfolio-row-meta">
                  <span className="portfolio-row-name">{c.name}</span>
                  <span className="portfolio-row-crypto">
                    {t('home:portfolio.tap_to_activate', 'Tap to activate')}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default Portfolio;
