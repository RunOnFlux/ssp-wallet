import { Table } from 'antd';
import { useEffect, useRef, useState } from 'react';
const { Column } = Table;
import BigNumber from 'bignumber.js';
import { ClockCircleOutlined } from '@ant-design/icons';
import './Transactions.css';
import { useTranslation } from 'react-i18next';
import { fetchRate } from '../../lib/currency.ts';
import CountdownTimer from './CountDownTimer.tsx';
import axios from 'axios';
import { sspConfig } from '@storage/ssp';
import { useAppSelector } from '../../hooks.ts';
import { VerticalAlignTopOutlined } from '@ant-design/icons';
import ConfirmTxKey from '../ConfirmTxKey/ConfirmTxKey.tsx';
import { decodeTransactionForApproval } from '../../lib/transactions.ts';
import { actionSSPRelay } from '../../types';

function PendingTransactionsTable() {
  const alreadyMounted = useRef(false);
  const { t } = useTranslation(['home', 'common']);
  const { address: sender, sspWalletKeyIdentity } = useAppSelector(
    (state) => state.flux,
  );
  const [fiatRate, setFiatRate] = useState(0);
  const [pendingTxs, setPendingTxs] = useState<Record<string, string>[]>([]);
  const [txHex, setTxHex] = useState('');
  const [openConfirmTx, setOpenConfirmTx] = useState(false);

  useEffect(() => {
    if (alreadyMounted.current) return;
    alreadyMounted.current = true;
    obtainRate();
    getPendingTx();
  });

  const obtainRate = () => {
    fetchRate('flux')
      .then((rate) => {
        console.log(rate);
        setFiatRate(rate.USD);
      })
      .catch((error) => {
        console.log(error);
      });
  };

  const getPendingTx = () => {
    axios
      .get<actionSSPRelay>(
        `https://${sspConfig().relay}/v1/action/${sspWalletKeyIdentity}`,
      )
      .then((res) => {
        if (res.data.action === 'tx') {
          const decoded = decodeTransactionForApproval(
            res.data.payload,
            sender,
          );
          setPendingTxs([{ ...decoded, ...res.data }]);
        } else {
          setPendingTxs([]);
        }
      })
      .catch((error) => {
        console.log(error);
      });
  };

  const confirmTxAction = (status: boolean) => {
    setOpenConfirmTx(status);
  };

  const onFinishCountDown = () => {
    setPendingTxs([]);
    setTimeout(() => {
      getPendingTx();
    }, 500);
  };

  return (
    <>
      {pendingTxs.length ? (
        <Table
          className="adjustedWidth"
          pagination={false}
          showHeader={false}
          rowKey="expireAt"
          bordered={false}
          loading={false}
          dataSource={pendingTxs}
          onRow={(record, rowIndex) => {
            console.log(record);
            console.log(rowIndex);
            return {
              onClick: () => {
                setTxHex(record.payload);
                setOpenConfirmTx(true);
              }, // click row
            };
          }}
        >
          <Column
            title={t('home:transactionsTable.direction')}
            dataIndex="amount"
            className="table-icon"
            render={() => (
              <>
                <VerticalAlignTopOutlined style={{ fontSize: '16px' }} />
              </>
            )}
          />
          <Column
            title={t('home:transactionsTable.date')}
            className="table-time"
            dataIndex="createdAt"
            render={(time: string) => (
              <>
                {new Date(time).toLocaleTimeString()}
                <br />
                {new Date(time).toLocaleDateString()}
              </>
            )}
          />
          <Column
            title={t('home:transactionsTable.amount')}
            className="table-amount"
            dataIndex="amount"
            render={(amnt: string) => (
              <>
                {amnt} FLUX
                <br />
                <div style={{ color: 'grey', fontSize: 12 }}>
                  {+amnt < 0 ? '-' : ''}$
                  {new BigNumber(Math.abs(+amnt))
                    .dividedBy(1e8)
                    .multipliedBy(new BigNumber(fiatRate))
                    .toFixed(2)}{' '}
                  USD
                </div>
              </>
            )}
          />
          <Column
            title={t('home:transactionsTable.confirmations')}
            className={'table-icon'}
            dataIndex="expireAt"
            render={(expireAt: string, row: actionSSPRelay) => (
              <>
                {expireAt ? (
                  <CountdownTimer
                    onFinish={() => onFinishCountDown()}
                    expireAtDateTime={expireAt}
                    createdAtDateTime={row.createdAt}
                  />
                ) : (
                  <ClockCircleOutlined style={{ fontSize: '18px' }} />
                )}
              </>
            )}
          />
        </Table>
      ) : null}

      <ConfirmTxKey
        open={openConfirmTx}
        openAction={confirmTxAction}
        txHex={txHex}
      />
    </>
  );
}

export default PendingTransactionsTable;
