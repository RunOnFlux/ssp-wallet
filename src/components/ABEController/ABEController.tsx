import { useEffect, useRef } from 'react';
import { blockchains } from '@storage/blockchains';
import localForage from 'localforage';

import {
  fetchSellAssets,
  fetchBuyAssets,
  fetchZelcoreAssets,
} from '../../lib/ABEController.ts';

import { useAppDispatch } from '../../hooks';
import { setSellAssets, setBuyAssets, setAbeMapping } from '../../store';

function ABEController() {
  const dispatch = useAppDispatch();
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
  useEffect(() => {
    if (alreadyMounted.current) return;
    alreadyMounted.current = true;
    obtainABE();
    if (globalThis.refreshIntervalABE) {
      clearInterval(globalThis.refreshIntervalABE);
    }
    globalThis.refreshIntervalABE = setInterval(
      () => {
        obtainABE();
      },
      15 * 60 * 1000,
    );
    return () => {
      if (globalThis.refreshIntervalABE) {
        clearInterval(globalThis.refreshIntervalABE);
      }
    };
  });

  const obtainABE = async () => {
    try {
      // first load from localforage if we have it
      const sspMappingStored = await localForage.getItem('sspABEMapping');
      if (sspMappingStored) {
        dispatch(setAbeMapping(sspMappingStored as { [key: string]: string }));
      }
      const sellAssetsWithLimitsStored = await localForage.getItem(
        'sellAssetsWithLimits',
      );
      if (sellAssetsWithLimitsStored) {
        dispatch(
          setSellAssets(
            sellAssetsWithLimitsStored as { [key: string]: string[] },
          ),
        );
      }
      const buyAssetsWithLimitsStored = await localForage.getItem(
        'buyAssetsWithLimits',
      );
      if (buyAssetsWithLimitsStored) {
        dispatch(
          setBuyAssets(
            buyAssetsWithLimitsStored as { [key: string]: string[] },
          ),
        );
      }
      const zelcoreAssets = await fetchZelcoreAssets();
      // now we have all the information we need to display the ABE assets. We shall make nice sell assets and nice buy assets with limits for every asset we have in ssp and store it to localforage
      // now we have all the information we need to display the ABE assets. We shall make nice sell assets and nice buy assets with limits for every asset we have in ssp and store it to localforage

      // ssp mapping is chain(id)_unit_contract
      // this is a map of ssp identifier to abe asset id (zelcoreid)
      // this map shall be expanded if new chain is added to ssp
      const sspMapping: { [key: string]: string } = {};
      const abeToSspMapping: { [key: string]: string } = {};
      const chainKeys = Object.keys(blockchains);
      chainKeys.forEach((chain) => {
        if (blockchains[chain].tokens) {
          blockchains[chain].tokens.forEach((token) => {
            const identifier = `${blockchains[chain].id}_${token.symbol}_${token.contract}`;
            // find corresponding abe asset
            const zelcoreAsset = zelcoreAssets.find(
              (asset) =>
                (asset.ticker === token.symbol ||
                  asset.ticker === token.symbol + '-' + chain.toUpperCase()) && // special case for FLUX on ETH chain
                asset.chain === blockchains[chain].id && // abe asset chain 'eth' is the same as for ssp chain 'eth'
                (asset.decimals || 8) === token.decimals && // if not specified defaults to 8
                asset.contract?.toLowerCase() ===
                  (token.contract?.toLowerCase() ||
                    '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'), // this works well for tokens but not for our first asset which is ETH itself which in ssp is '' but contract in zelcore
            );
            if (zelcoreAsset) {
              sspMapping[identifier] = zelcoreAsset.idzelcore;
              abeToSspMapping[zelcoreAsset.idzelcore] = identifier;
            }
          });
        } else {
          const identifier = `${blockchains[chain].id}_${blockchains[chain].symbol}`;
          const zelcoreAsset = zelcoreAssets.find(
            (asset) =>
              asset.ticker === blockchains[chain].symbol &&
              (asset.chain === blockchains[chain].id ||
                asset.chain === 'custom') && // abe uses 'custom' chain for chains that do not have tokens
              (asset.decimals || 8) === blockchains[chain].decimals, // if not specified defaults to 8
          );
          if (zelcoreAsset) {
            sspMapping[identifier] = zelcoreAsset.idzelcore;
            abeToSspMapping[zelcoreAsset.idzelcore] = identifier;
          }
        }
      });
      // store this map to localforage
      await localForage.setItem('sspABEMapping', sspMapping);
      dispatch(setAbeMapping(sspMapping));
      const sellAssets = await fetchSellAssets();
      const buyAssets = await fetchBuyAssets();
      // now we have sell assets and buy assets
      // convert it from zelcoreid to ssp identifier with proper limits
      // { sspidentifier: [assets that are limited to be sold to by this identifier]}, if its null then all the buy assets are allowed to be sold to
      const allSellAssets = sellAssets.map((asset) => {
        return asset.idzelcore;
      });
      const allBuyAssets = buyAssets.map((asset) => {
        return asset.idzelcore;
      });
      const sellAssetsWithLimits: { [key: string]: string[] } = {};
      sellAssets.forEach((asset) => {
        let assetsPossibleToBeBought = [];
        if (
          // this actually may result in pairs that are not allowed in some rare cases, todo to be revisited later
          asset.idchangeherofixlimit === null ||
          asset.idchangeherofloatlimit === null ||
          asset.idchangenowfloatlimit === null ||
          asset.idchangenowfixlimit === null ||
          asset.idchangellyfixlimit === null ||
          asset.idchangellyfloatlimit === null ||
          asset.idsimpleswapfixlimit === null ||
          asset.idsimpleswapfloatlimit === null
        ) {
          assetsPossibleToBeBought = allBuyAssets;
        } else {
          if (asset.idchangeherofixlimit) {
            assetsPossibleToBeBought.push(...asset.idchangeherofixlimit);
          }
          if (asset.idchangeherofloatlimit) {
            assetsPossibleToBeBought.push(...asset.idchangeherofloatlimit);
          }
          if (asset.idchangenowfixlimit) {
            assetsPossibleToBeBought.push(...asset.idchangenowfixlimit);
          }
          if (asset.idchangenowfloatlimit) {
            assetsPossibleToBeBought.push(...asset.idchangenowfloatlimit);
          }
          if (asset.idchangellyfixlimit) {
            assetsPossibleToBeBought.push(...asset.idchangellyfixlimit);
          }
          if (asset.idchangellyfloatlimit) {
            assetsPossibleToBeBought.push(...asset.idchangellyfloatlimit);
          }
          if (asset.idsimpleswapfixlimit) {
            assetsPossibleToBeBought.push(...asset.idsimpleswapfixlimit);
          }
          if (asset.idsimpleswapfloatlimit) {
            assetsPossibleToBeBought.push(...asset.idsimpleswapfloatlimit);
          }
        }
        assetsPossibleToBeBought = [...new Set(assetsPossibleToBeBought)];
        const convertedAssetsPossibleToBeBought = assetsPossibleToBeBought.map(
          (asset) => {
            return abeToSspMapping[asset];
          },
        );
        sellAssetsWithLimits[abeToSspMapping[asset.idzelcore]] =
          convertedAssetsPossibleToBeBought
            .filter((x) => x)
            .filter((x) => x !== abeToSspMapping[asset.idzelcore]);
      });
      const buyAssetsWithLimits: { [key: string]: string[] } = {};
      buyAssets.forEach((asset) => {
        let assetsPossibleToBeSold: string[] = [];
        if (
          // this actually may result in pairs that are not allowed in some rare cases, todo to be revisited later
          asset.idchangeherofixlimit === null ||
          asset.idchangeherofloatlimit === null ||
          asset.idchangenowfloatlimit === null ||
          asset.idchangenowfixlimit === null ||
          asset.idchangellyfixlimit === null ||
          asset.idchangellyfloatlimit === null ||
          asset.idsimpleswapfixlimit === null ||
          asset.idsimpleswapfloatlimit === null
        ) {
          assetsPossibleToBeSold = allSellAssets;
        } else {
          if (asset.idchangeherofixlimit) {
            assetsPossibleToBeSold.push(...asset.idchangeherofixlimit);
          }
          if (asset.idchangeherofloatlimit) {
            assetsPossibleToBeSold.push(...asset.idchangeherofloatlimit);
          }
          if (asset.idchangenowfixlimit) {
            assetsPossibleToBeSold.push(...asset.idchangenowfixlimit);
          }
          if (asset.idchangenowfloatlimit) {
            assetsPossibleToBeSold.push(...asset.idchangenowfloatlimit);
          }
          if (asset.idchangellyfixlimit) {
            assetsPossibleToBeSold.push(...asset.idchangellyfixlimit);
          }
          if (asset.idchangellyfloatlimit) {
            assetsPossibleToBeSold.push(...asset.idchangellyfloatlimit);
          }
          if (asset.idsimpleswapfixlimit) {
            assetsPossibleToBeSold.push(...asset.idsimpleswapfixlimit);
          }
          if (asset.idsimpleswapfloatlimit) {
            assetsPossibleToBeSold.push(...asset.idsimpleswapfloatlimit);
          }
        }
        assetsPossibleToBeSold = [...new Set(assetsPossibleToBeSold)];
        const convertedAssetsPossibleToBeSold = assetsPossibleToBeSold.map(
          (asset) => {
            return abeToSspMapping[asset];
          },
        );
        buyAssetsWithLimits[abeToSspMapping[asset.idzelcore]] =
          convertedAssetsPossibleToBeSold
            .filter((x) => x)
            .filter((x) => x !== abeToSspMapping[asset.idzelcore]);
      });
      await localForage.setItem('sellAssetsWithLimits', sellAssetsWithLimits);
      dispatch(setSellAssets(sellAssetsWithLimits));
      await localForage.setItem('buyAssetsWithLimits', buyAssetsWithLimits);
      dispatch(setBuyAssets(buyAssetsWithLimits));
    } catch (error) {
      console.log(error);
    }
  };

  return <></>;
}

export default ABEController;
