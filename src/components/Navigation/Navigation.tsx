import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Tooltip } from 'antd';
import {
  ArrowDown as ArrowDownIcon,
  ArrowLeftRight as ArrowLeftRightIcon,
  ArrowUp as ArrowUpIcon,
  CreditCard as CreditCardIcon,
} from 'lucide-react';
import Receive from '../Receive/Receive';
import PurchaseCrypto from '../Onramper/PurchaseCrypto';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../hooks';
import { blockchains } from '@storage/blockchains';

import './Navigation.css';

/**
 * Home action row — the wallet verbs (Send · Receive · Swap · Buy/Sell) as
 * equal-width tokenized tiles: amber-tinted surface, amber icon, neutral
 * label. No gradients, no off-brand hues (DESIGN_TOKENS §1).
 */
function Navigation() {
  const { t } = useTranslation(['home']);
  const navigate = useNavigate();
  const [openReceive, setOpenReceive] = useState(false);
  const [openBuyCryptoDialog, setOpenBuyCryptoDialog] = useState(false);
  const receiveAction = (status: boolean) => {
    setOpenReceive(status);
  };
  const openBuyAction = (status: boolean) => {
    // ANTd fix: https://github.com/ant-design/ant-design/issues/43327
    const elem = document.getElementById('root');
    if (elem) {
      elem.style.overflow = status ? 'hidden' : 'unset';
    }
    setOpenBuyCryptoDialog(status);
  };
  const { activeChain } = useAppSelector((state) => state.sspState);
  const { wallets, walletInUse } = useAppSelector(
    (state) => state[activeChain],
  );
  const { servicesAvailability } = useAppSelector(
    (state) => state.servicesAvailability,
  );
  const blockchainConfig = blockchains[activeChain];
  const isEVM = blockchainConfig.chainType === 'evm';
  const isSOL = blockchainConfig.chainType === 'sol';
  const buySellAvailable =
    servicesAvailability.onramp && servicesAvailability.offramp;
  const buySellComingSoon =
    !blockchainConfig.onramperNetwork &&
    !blockchainConfig.symbol.includes('TEST');

  const buySellButton = (
    <button
      type="button"
      className="action-row-button"
      disabled={!blockchainConfig.onramperNetwork}
      onClick={() => openBuyAction(true)}
      data-tutorial="buy-sell-button"
    >
      <CreditCardIcon className="action-row-icon" />
      <span className="action-row-label">
        {t('home:navigation.buy')} / {t('home:navigation.sell')}
      </span>
    </button>
  );

  return (
    <>
      <div className="action-row">
        <button
          type="button"
          className="action-row-button"
          onClick={() =>
            navigate(isSOL ? '/sendsol' : isEVM ? '/sendevm' : '/send', {
              state: { receiver: '' },
            })
          }
          data-tutorial="send-button"
        >
          <ArrowUpIcon className="action-row-icon" />
          <span className="action-row-label">{t('home:navigation.send')}</span>
        </button>
        <button
          type="button"
          className="action-row-button"
          onClick={() => receiveAction(true)}
          data-tutorial="receive-button"
        >
          <ArrowDownIcon className="action-row-icon" />
          <span className="action-row-label">
            {t('home:navigation.receive')}
          </span>
        </button>
        {servicesAvailability.swap && (
          <button
            type="button"
            className="action-row-button"
            onClick={() => {
              navigate('/swap', { state: { buyAsset: activeChain } });
            }}
            data-tutorial="swap-button"
          >
            <ArrowLeftRightIcon className="action-row-icon" />
            <span className="action-row-label">
              {t('home:navigation.swap')}
            </span>
          </button>
        )}
        {buySellAvailable &&
          (buySellComingSoon ? (
            <Tooltip title={t('home:buy_sell_crypto.coming_soon')}>
              {/* span wrapper: disabled native buttons swallow hover events,
                  so the tooltip must attach to a live element */}
              <span className="action-row-tooltip-target">{buySellButton}</span>
            </Tooltip>
          ) : (
            buySellButton
          ))}
      </div>
      <Receive open={openReceive} openAction={receiveAction} />
      <PurchaseCrypto
        open={openBuyCryptoDialog}
        openAction={openBuyAction}
        cryptoNetwork={blockchainConfig.onramperNetwork}
        cryptoAsset={blockchainConfig.symbol}
        wInUse={wallets[walletInUse].address}
      />
    </>
  );
}

export default Navigation;
