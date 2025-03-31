import sepoliaLogo from '../assets/teth.svg';
import fluxLogo from '../assets/flux.svg';
import ethLogo from '../assets/eth.svg';
import usdtLogo from '../assets/usdt.svg';
import usdcLogo from '../assets/usdc.svg';
import wbtcLogo from '../assets/wbtc.svg';
import wethLogo from '../assets/weth.svg';
import trxLogo from '../assets/trx.svg';
import tonLogo from '../assets/ton.svg';
import shibLogo from '../assets/shib.svg';
import linkLogo from '../assets/link.svg';
import leoLogo from '../assets/leo.svg';
import daiLogo from '../assets/dai.svg';
import uniLogo from '../assets/uni.svg';
import fetLogo from '../assets/fet.svg';
import pepeLogo from '../assets/pepe.svg';
import fdusdLogo from '../assets/fdusd.svg';
import polLogo from '../assets/pol.svg';
import rndrLogo from '../assets/rndr.svg';
import okbLogo from '../assets/okb.svg';
import croLogo from '../assets/cro.svg';
import imxLogo from '../assets/imx.svg';
import aaveLogo from '../assets/aave.svg';
import arbLogo from '../assets/arb.svg';
import mntLogo from '../assets/mnt.svg';
import injLogo from '../assets/inj.svg';
import mkrLogo from '../assets/mkr.svg';
import grtLogo from '../assets/grt.svg';
import bgbLogo from '../assets/bgb.svg';
import flokiLogo from '../assets/floki.svg';
import bonkLogo from '../assets/bonk.svg';
import jasmyLogo from '../assets/jasmy.svg';
import kcsLogo from '../assets/kcs.svg';
import omLogo from '../assets/om.svg';
import ldoLogo from '../assets/ldo.svg';
import qntLogo from '../assets/qnt.svg';
import bttLogo from '../assets/btt.svg';
import ondoLogo from '../assets/ondo.svg';
import wflowLogo from '../assets/wflow.svg';
import gtLogo from '../assets/gt.svg';
import usddLogo from '../assets/usdd.svg';
import beamLogo from '../assets/beam.svg';
import axsLogo from '../assets/axs.svg';
import strkLogo from '../assets/strk.svg';
import wldLogo from '../assets/wld.svg';
import xautLogo from '../assets/xaut.svg';
import galaLogo from '../assets/gala.svg';
import sandLogo from '../assets/sand.svg';
import ensLogo from '../assets/ens.svg';
import nexoLogo from '../assets/nexo.svg';
import manaLogo from '../assets/mana.svg';
import wLogo from '../assets/w.svg';
import pendleLogo from '../assets/pendle.svg';
import tusdLogo from '../assets/tusd.svg';
import paxgLogo from '../assets/paxg.svg';
import chzLogo from '../assets/chz.svg';
import cakeLogo from '../assets/cake.svg';
import apeLogo from '../assets/ape.svg';
import snxLogo from '../assets/snx.svg';
import pyusdLogo from '../assets/pyusd.svg';
import dexeLogo from '../assets/dexe.svg';
import enaLogo from '../assets/ena.svg';
import zroLogo from '../assets/zro.svg';
import aiozLogo from '../assets/aioz.svg';
import lptLogo from '../assets/lpt.svg';
import nftLogo from '../assets/nft.svg';
import axlLogo from '../assets/axl.svg';
import superLogo from '../assets/super.svg';
import gnoLogo from '../assets/gno.svg';
import mxLogo from '../assets/mx.svg';
import compLogo from '../assets/comp.svg';
import sfpLogo from '../assets/sfp.svg';
import babydogeLogo from '../assets/babydoge.svg';
import blurLogo from '../assets/blur.svg';
import mogLogo from '../assets/mog.svg';
import safeLogo from '../assets/safe.svg';
import osmoLogo from '../assets/osmo.svg';
import rsrLogo from '../assets/rsr.svg';
import iotxLogo from '../assets/iotx.svg';
import aevoLogo from '../assets/aevo.svg';
import crvLogo from '../assets/crv.svg';
import inchLogo from '../assets/1inch.svg';
import gmtLogo from '../assets/gmt.svg';
import wooLogo from '../assets/woo.svg';
import ampLogo from '../assets/amp.svg';
import peopleLogo from '../assets/people.svg';
import primeLogo from '../assets/prime.svg';
import hotLogo from '../assets/hot.svg';
import glmLogo from '../assets/glm.svg';
import memeLogo from '../assets/meme.svg';
import gLogo from '../assets/g.svg';
import elfLogo from '../assets/elf.svg';
import batLogo from '../assets/bat.svg';
import ankrLogo from '../assets/ankr.svg';
import zrxLogo from '../assets/zrx.svg';
import ethfiLogo from '../assets/ethfi.svg';
import zetaLogo from '../assets/zeta.svg';
import ssvLogo from '../assets/ssv.svg';
import arkmLogo from '../assets/arkm.svg';
import idLogo from '../assets/id.svg';
import maskLogo from '../assets/mask.svg';
import tracLogo from '../assets/trac.svg';
import rplLogo from '../assets/rpl.svg';
import amoyLogo from '../assets/tpol.svg';
import baseLogo from '../assets/base.svg';
import bscLogo from '../assets/bsc.svg';
import avaxLogo from '../assets/avax.svg';

function sepolia() {
  const tokens = [
    {
      contract: '', // first is always the native 'no contract' token 0x0000000000000000000000000000000000000000
      name: 'Testnet Ethereum Sepolia',
      symbol: 'TEST-ETH',
      decimals: 18,
      logo: sepoliaLogo,
    },
    {
      contract: '0x690cc0235aBEA2cF89213E30D0F0Ea0fC054B909',
      name: 'Fake Flux',
      symbol: 'TEST-FLUX',
      decimals: 8,
      logo: fluxLogo,
    },
  ];
  return tokens;
}

function eth() {
  const tokens = [
    {
      contract: '', // first is always the native 'no contract' token 0x0000000000000000000000000000000000000000
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18,
      logo: ethLogo,
    },
    {
      contract: '0x720cd16b011b987da3518fbf38c3071d4f0d1495',
      name: 'Flux',
      symbol: 'FLUX',
      decimals: 8,
      logo: fluxLogo,
    },
    {
      contract: '0xdac17f958d2ee523a2206206994597c13d831ec7',
      name: 'Tether',
      symbol: 'USDT',
      decimals: 6,
      logo: usdtLogo,
    },
    {
      contract: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      name: 'USD Coin',
      symbol: 'USDC',
      decimals: 6,
      logo: usdcLogo,
    },
    {
      contract: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
      name: 'Wrapped Bitcoin',
      symbol: 'WBTC',
      decimals: 8,
      logo: wbtcLogo,
    },
    {
      contract: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      name: 'Wrapped Ether',
      symbol: 'WETH',
      decimals: 18,
      logo: wethLogo,
    },
    {
      contract: '0x50327c6c5a14dcade707abad2e27eb517df87ab5',
      name: 'Tron',
      symbol: 'TRX',
      decimals: 6,
      logo: trxLogo,
    },
    {
      contract: '0x582d872a1b094fc48f5de31d3b73f2d9be47def1',
      name: 'Toncoin',
      symbol: 'TON',
      decimals: 9,
      logo: tonLogo,
    },
    {
      contract: '0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce',
      name: 'Shiba Inu',
      symbol: 'SHIB',
      decimals: 18,
      logo: shibLogo,
    },
    {
      contract: '0x514910771af9ca656af840dff83e8264ecf986ca',
      name: 'ChainLink',
      symbol: 'LINK',
      decimals: 18,
      logo: linkLogo,
    },
    {
      contract: '0x2af5d2ad76741191d15dfe7bf6ac92d4bd912ca3',
      name: 'Unus Sed Leo',
      symbol: 'LEO',
      decimals: 18,
      logo: leoLogo,
    },
    {
      contract: '0x6b175474e89094c44da98b954eedeac495271d0f',
      name: 'Dai',
      symbol: 'DAI',
      decimals: 18,
      logo: daiLogo,
    },
    {
      contract: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
      name: 'Uniswap',
      symbol: 'UNI',
      decimals: 18,
      logo: uniLogo,
    },
    {
      contract: '0xaea46A60368A7bD060eec7DF8CBa43b7EF41Ad85',
      name: 'Artificial Superintelligence Alliance',
      symbol: 'FET',
      decimals: 18,
      logo: fetLogo,
    },
    {
      contract: '0x6982508145454ce325ddbe47a25d4ec3d2311933',
      name: 'Pepe',
      symbol: 'PEPE',
      decimals: 18,
      logo: pepeLogo,
    },
    {
      contract: '0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409',
      name: 'First Digital USD',
      symbol: 'FDUSD',
      decimals: 18,
      logo: fdusdLogo,
    },
    {
      contract: '0x455e53cbb86018ac2b8092fdcd39d8444affc3f6',
      name: 'Polygon Ecosystem',
      symbol: 'POL',
      decimals: 18,
      logo: polLogo,
    },
    {
      contract: '0x6de037ef9ad2725eb40118bb1702ebb27e4aeb24',
      name: 'Render',
      symbol: 'RNDR',
      decimals: 18,
      logo: rndrLogo,
    },
    {
      contract: '0x75231f58b43240c9718dd58b4967c5114342a86c',
      name: 'OKB',
      symbol: 'OKB',
      decimals: 18,
      logo: okbLogo,
    },
    {
      contract: '0xa0b73e1ff0b80914ab6fe0444e65848c4c34450b',
      name: 'Cronos',
      symbol: 'CRO',
      decimals: 8,
      logo: croLogo,
    },
    {
      contract: '0xf57e7e7c23978c3caec3c3548e3d615c346e79ff',
      name: 'Immutable',
      symbol: 'IMX',
      decimals: 18,
      logo: imxLogo,
    },
    {
      contract: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',
      name: 'Aave',
      symbol: 'AAVE',
      decimals: 18,
      logo: aaveLogo,
    },
    {
      contract: '0xB50721BCf8d664c30412Cfbc6cf7a15145234ad1',
      name: 'Arbitrum',
      symbol: 'ARB',
      decimals: 18,
      logo: arbLogo,
    },
    {
      contract: '0x3c3a81e81dc49a522a592e7622a7e711c06bf354',
      name: 'Mantle',
      symbol: 'MNT',
      decimals: 18,
      logo: mntLogo,
    },
    {
      contract: '0xe28b3b32b6c345a34ff64674606124dd5aceca30',
      name: 'Injective',
      symbol: 'INJ',
      decimals: 18,
      logo: injLogo,
    },
    {
      contract: '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2',
      name: 'Maker',
      symbol: 'MKR',
      decimals: 18,
      logo: mkrLogo,
    },
    {
      contract: '0xc944e90c64b2c07662a292be6244bdf05cda44a7',
      name: 'The Graph',
      symbol: 'GRT',
      decimals: 18,
      logo: grtLogo,
    },
    {
      contract: '0x54D2252757e1672EEaD234D27B1270728fF90581',
      name: 'Bitget Token',
      symbol: 'BGB',
      decimals: 18,
      logo: bgbLogo,
    },
    {
      contract: '0xcf0c122c6b73ff809c693db761e7baebe62b6a2e',
      name: 'Floki',
      symbol: 'FLOKI',
      decimals: 9,
      logo: flokiLogo,
    },
    {
      contract: '0x1151CB3d861920e07a38e03eEAd12C32178567F6',
      name: 'Bonk',
      symbol: 'BONK',
      decimals: 5,
      logo: bonkLogo,
    },
    {
      contract: '0x7420B4b9a0110cdC71fB720908340C03F9Bc03EC',
      name: 'JasmyCoin',
      symbol: 'JASMY',
      decimals: 18,
      logo: jasmyLogo,
    },
    {
      contract: '0xf34960d9d60be18cc1d5afc1a6f012a723a28811',
      name: 'Kucoin Token',
      symbol: 'KCS',
      decimals: 6,
      logo: kcsLogo,
    },
    {
      contract: '0x3593d125a4f7849a1b059e64f4517a86dd60c95d',
      name: 'Mantra',
      symbol: 'OM',
      decimals: 18,
      logo: omLogo,
    },
    {
      contract: '0x5a98fcbea516cf06857215779fd812ca3bef1b32',
      name: 'Lido DAO',
      symbol: 'LDO',
      decimals: 18,
      logo: ldoLogo,
    },
    {
      contract: '0x4a220e6096b25eadb88358cb44068a3248254675',
      name: 'Quant',
      symbol: 'QNT',
      decimals: 18,
      logo: qntLogo,
    },
    {
      contract: '0xc669928185dbce49d2230cc9b0979be6dc797957',
      name: 'BitTorrent',
      symbol: 'BTT',
      decimals: 18,
      logo: bttLogo,
    },
    {
      contract: '0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3',
      name: 'Ondo',
      symbol: 'ONDO',
      decimals: 18,
      logo: ondoLogo,
    },
    {
      contract: '0x5c147e74D63B1D31AA3Fd78Eb229B65161983B2b',
      name: 'Wrapped Flow',
      symbol: 'WFLOW',
      decimals: 18,
      logo: wflowLogo,
    },
    {
      contract: '0xe66747a101bff2dba3697199dcce5b743b454759',
      name: 'GateToken',
      symbol: 'GT',
      decimals: 18,
      logo: gtLogo,
    },
    {
      contract: '0x0c10bf8fcb7bf5412187a595ab97a3609160b5c6',
      name: 'Decentralized USD',
      symbol: 'USDD',
      decimals: 18,
      logo: usddLogo,
    },
    {
      contract: '0x62D0A8458eD7719FDAF978fe5929C6D342B0bFcE',
      name: 'Beam',
      symbol: 'BEAM',
      decimals: 18,
      logo: beamLogo,
    },
    {
      contract: '0xbb0e17ef65f82ab018d8edd776e8dd940327b28b',
      name: 'Axie Infinity',
      symbol: 'AXS',
      decimals: 18,
      logo: axsLogo,
    },
    {
      contract: '0xCa14007Eff0dB1f8135f4C25B34De49AB0d42766',
      name: 'Starknet',
      symbol: 'STRK',
      decimals: 18,
      logo: strkLogo,
    },
    {
      contract: '0x163f8c2467924be0ae7b5347228cabf260318753',
      name: 'Worldcoin',
      symbol: 'WLD',
      decimals: 18,
      logo: wldLogo,
    },
    {
      contract: '0x68749665FF8D2d112Fa859AA293F07A622782F38',
      name: 'Tether Gold',
      symbol: 'XAUt',
      decimals: 6,
      logo: xautLogo,
    },
    {
      contract: '0xd1d2Eb1B1e90B638588728b4130137D262C87cae',
      name: 'Gala',
      symbol: 'GALA',
      decimals: 8,
      logo: galaLogo,
    },
    {
      contract: '0x3845badAde8e6dFF049820680d1F14bD3903a5d0',
      name: 'The Sandbox',
      symbol: 'SAND',
      decimals: 18,
      logo: sandLogo,
    },
    {
      contract: '0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72',
      name: 'Ethereum Name Service',
      symbol: 'ENS',
      decimals: 18,
      logo: ensLogo,
    },
    {
      contract: '0xb62132e35a6c13ee1ee0f84dc5d40bad8d815206',
      name: 'Nexo',
      symbol: 'NEXO',
      decimals: 18,
      logo: nexoLogo,
    },
    {
      contract: '0x0f5d2fb29fb7d3cfee444a200298f468908cc942',
      name: 'Decentraland',
      symbol: 'MANA',
      decimals: 18,
      logo: manaLogo,
    },
    {
      contract: '0xB0fFa8000886e57F86dd5264b9582b2Ad87b2b91',
      name: 'Wormhole',
      symbol: 'W',
      decimals: 18,
      logo: wLogo,
    },
    {
      contract: '0x808507121b80c02388fad14726482e061b8da827',
      name: 'Pendle',
      symbol: 'PENDLE',
      decimals: 18,
      logo: pendleLogo,
    },
    {
      contract: '0x0000000000085d4780B73119b644AE5ecd22b376',
      name: 'TrueUSD',
      symbol: 'TUSD',
      decimals: 18,
      logo: tusdLogo,
    },
    {
      contract: '0x45804880de22913dafe09f4980848ece6ecbaf78',
      name: 'Paxos Gold',
      symbol: 'PAXG',
      decimals: 18,
      logo: paxgLogo,
    },
    {
      contract: '0x3506424f91fd33084466f402d5d97f05f8e3b4af',
      name: 'Chiliz',
      symbol: 'CHZ',
      decimals: 18,
      logo: chzLogo,
    },
    {
      contract: '0x152649eA73beAb28c5b49B26eb48f7EAD6d4c898',
      name: 'PancakeSwap',
      symbol: 'CAKE',
      decimals: 18,
      logo: cakeLogo,
    },
    {
      contract: '0x4d224452801aced8b2f0aebe155379bb5d594381',
      name: 'ApeCoin',
      symbol: 'APE',
      decimals: 18,
      logo: apeLogo,
    },
    {
      contract: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f',
      name: 'Synthetix',
      symbol: 'SNX',
      decimals: 18,
      logo: snxLogo,
    },
    {
      contract: '0x6c3ea9036406852006290770BEdFcAbA0e23A0e8',
      name: 'PayPal USD',
      symbol: 'PYUSD',
      decimals: 6,
      logo: pyusdLogo,
    },
    {
      contract: '0xde4EE8057785A7e8e800Db58F9784845A5C2Cbd6',
      name: 'DeXe',
      symbol: 'DEXE',
      decimals: 18,
      logo: dexeLogo,
    },
    {
      contract: '0x57e114B691Db790C35207b2e685D4A43181e6061',
      name: 'Ethena',
      symbol: 'ENA',
      decimals: 18,
      logo: enaLogo,
    },
    {
      contract: '0x6985884C4392D348587B19cb9eAAf157F13271cd',
      name: 'LayerZero',
      symbol: 'ZRO',
      decimals: 18,
      logo: zroLogo,
    },
    {
      contract: '0x626E8036dEB333b408Be468F951bdB42433cBF18',
      name: 'AIOZ Network',
      symbol: 'AIOZ',
      decimals: 18,
      logo: aiozLogo,
    },
    {
      contract: '0x58b6a8a3302369daec383334672404ee733ab239',
      name: 'Livepeer',
      symbol: 'LPT',
      decimals: 18,
      logo: lptLogo,
    },
    {
      contract: '0x198d14f2ad9ce69e76ea330b374de4957c3f850a',
      name: 'APENFT',
      symbol: 'NFT',
      decimals: 6,
      logo: nftLogo,
    },
    {
      contract: '0x467719aD09025FcC6cF6F8311755809d45a5E5f3',
      name: 'Axelar',
      symbol: 'AXL',
      decimals: 6,
      logo: axlLogo,
    },
    {
      contract: '0xe53ec727dbdeb9e2d5456c3be40cff031ab40a55',
      name: 'SuperVerse',
      symbol: 'SUPER',
      decimals: 18,
      logo: superLogo,
    },
    {
      contract: '0x6810e776880c02933d47db1b9fc05908e5386b96',
      name: 'Gnosis',
      symbol: 'GNO',
      decimals: 18,
      logo: gnoLogo,
    },
    {
      contract: '0x11eef04c884e24d9b7b4760e7476d06ddf797f36',
      name: 'MX Token',
      symbol: 'MX',
      decimals: 18,
      logo: mxLogo,
    },
    {
      contract: '0xc00e94cb662c3520282e6f5717214004a7f26888',
      name: 'Compound',
      symbol: 'COMP',
      decimals: 18,
      logo: compLogo,
    },
    {
      contract: '0x12e2b8033420270db2f3b328e32370cb5b2ca134',
      name: 'SafePal',
      symbol: 'SFP',
      decimals: 18,
      logo: sfpLogo,
    },
    {
      contract: '0xac57de9c1a09fec648e93eb98875b212db0d460b',
      name: 'Baby Doge Coin',
      symbol: 'BabyDoge',
      decimals: 9,
      logo: babydogeLogo,
    },
    {
      contract: '0x5283d291dbcf85356a21ba090e6db59121208b44',
      name: 'Blur',
      symbol: 'BLUR',
      decimals: 18,
      logo: blurLogo,
    },
    {
      contract: '0xaaeE1A9723aaDB7afA2810263653A34bA2C21C7a',
      name: 'Mog Coin',
      symbol: 'MOG',
      decimals: 18,
      logo: mogLogo,
    },
    {
      contract: '0x5afe3855358e112b5647b952709e6165e1c1eeee',
      name: 'Safe',
      symbol: 'SAFE',
      decimals: 18,
      logo: safeLogo,
    },
    {
      contract: '0x93A62Ccfcf1EfCB5f60317981F71ed6Fb39F4BA2',
      name: 'Osmosis',
      symbol: 'OSMO',
      decimals: 6,
      logo: osmoLogo,
    },
    {
      contract: '0x320623b8e4ff03373931769a31fc52a4e78b5d70',
      name: 'Reserve Rights',
      symbol: 'RSR',
      decimals: 18,
      logo: rsrLogo,
    },
    {
      contract: '0x6fb3e0a217407efff7ca062d46c26e5d60a14d69',
      name: 'IoTeX',
      symbol: 'IOTX',
      decimals: 18,
      logo: iotxLogo,
    },
    {
      contract: '0xB528edBef013aff855ac3c50b381f253aF13b997',
      name: 'Aevo',
      symbol: 'AEVO',
      decimals: 18,
      logo: aevoLogo,
    },
    {
      contract: '0xD533a949740bb3306d119CC777fa900bA034cd52',
      name: 'Curve DAO Token',
      symbol: 'CRV',
      decimals: 18,
      logo: crvLogo,
    },
    {
      contract: '0x111111111117dc0aa78b770fa6a738034120c302',
      name: '1inch Network',
      symbol: '1INCH',
      decimals: 18,
      logo: inchLogo,
    },
    {
      contract: '0xe3c408bd53c31c085a1746af401a4042954ff740',
      name: 'GMT',
      symbol: 'GMT',
      decimals: 8,
      logo: gmtLogo,
    },
    {
      contract: '0x4691937a7508860f876c9c0a2a617e7d9e945d4b',
      name: 'WOO',
      symbol: 'WOO',
      decimals: 18,
      logo: wooLogo,
    },
    {
      contract: '0xff20817765cb7f73d4bde2e66e067e58d11095c2',
      name: 'Amp',
      symbol: 'AMP',
      decimals: 18,
      logo: ampLogo,
    },
    {
      contract: '0x7a58c0be72be218b41c608b7fe7c5bb630736c71',
      name: 'ConstitutionDAO',
      symbol: 'PEOPLE',
      decimals: 18,
      logo: peopleLogo,
    },
    {
      contract: '0xb23d80f5fefcddaa212212f028021b41ded428cf',
      name: 'Echelon Prime',
      symbol: 'PRIME',
      decimals: 18,
      logo: primeLogo,
    },
    {
      contract: '0x6c6ee5e31d828de241282b9606c8e98ea48526e2',
      name: 'Holo',
      symbol: 'HOT',
      decimals: 18,
      logo: hotLogo,
    },
    {
      contract: '0x7DD9c5Cba05E151C895FDe1CF355C9A1D5DA6429',
      name: 'Golem',
      symbol: 'GLM',
      decimals: 18,
      logo: glmLogo,
    },
    {
      contract: '0xb131f4a55907b10d1f0a50d8ab8fa09ec342cd74',
      name: 'Memecoin',
      symbol: 'MEME',
      decimals: 18,
      logo: memeLogo,
    },
    {
      contract: '0x9C7BEBa8F6eF6643aBd725e45a4E8387eF260649',
      name: 'Gravity',
      symbol: 'G',
      decimals: 18,
      logo: gLogo,
    },
    {
      contract: '0xbf2179859fc6D5BEE9Bf9158632Dc51678a4100e',
      name: 'aelf',
      symbol: 'ELF',
      decimals: 18,
      logo: elfLogo,
    },
    {
      contract: '0x0d8775f648430679a709e98d2b0cb6250d2887ef',
      name: 'Basic Attention Token',
      symbol: 'BAT',
      decimals: 18,
      logo: batLogo,
    },
    {
      contract: '0x8290333cef9e6d528dd5618fb97a76f268f3edd4',
      name: 'Ankr',
      symbol: 'ANKR',
      decimals: 18,
      logo: ankrLogo,
    },
    {
      contract: '0xe41d2489571d322189246dafa5ebde1f4699f498',
      name: '0x Protocol',
      symbol: 'ZRX',
      decimals: 18,
      logo: zrxLogo,
    },
    {
      contract: '0xFe0c30065B384F05761f15d0CC899D4F9F9Cc0eB',
      name: 'ether.fi',
      symbol: 'ETHFI',
      decimals: 18,
      logo: ethfiLogo,
    },
    {
      contract: '0xf091867ec603a6628ed83d274e835539d82e9cc8',
      name: 'ZetaChain',
      symbol: 'ZETA',
      decimals: 18,
      logo: zetaLogo,
    },
    {
      contract: '0x9D65fF81a3c488d585bBfb0Bfe3c7707c7917f54',
      name: 'ssv.network',
      symbol: 'SSV',
      decimals: 18,
      logo: ssvLogo,
    },
    {
      contract: '0x6e2a43be0b1d33b726f0ca3b8de60b3482b8b050',
      name: 'Arkham',
      symbol: 'ARKM',
      decimals: 18,
      logo: arkmLogo,
    },
    {
      contract: '0x2dfF88A56767223A5529eA5960Da7A3F5f766406',
      name: 'Space ID',
      symbol: 'ID',
      decimals: 18,
      logo: idLogo,
    },
    {
      contract: '0x69af81e73a73b40adf4f3d4223cd9b1ece623074',
      name: 'Mask Network',
      symbol: 'MASK',
      decimals: 18,
      logo: maskLogo,
    },
    {
      contract: '0xaa7a9ca87d3694b5755f213b5d04094b8d0f0a6f',
      name: 'OriginTrail',
      symbol: 'TRAC',
      decimals: 18,
      logo: tracLogo,
    },
    {
      contract: '0xd33526068d116ce69f19a9ee46f0bd304f21a51f',
      name: 'Rocket Pool',
      symbol: 'RPL',
      decimals: 18,
      logo: rplLogo,
    },
  ];
  return tokens;
}

function amoy() {
  const tokens = [
    {
      contract: '', // first is always the native 'no contract' token 0x0000000000000000000000000000000000000000
      name: 'Testnet Polygon Amoy',
      symbol: 'TEST-POL',
      decimals: 18,
      logo: amoyLogo,
    },
  ];
  return tokens;
}

function polygon() {
  const tokens = [
    {
      contract: '', // first is always the native 'no contract' token 0x0000000000000000000000000000000000000000
      name: 'Polygon',
      symbol: 'POL',
      decimals: 18,
      logo: polLogo,
    },
    {
      contract: '0xA2bb7A68c46b53f6BbF6cC91C865Ae247A82E99B',
      name: 'Flux',
      symbol: 'FLUX',
      decimals: 8,
      logo: fluxLogo,
    },
    {
      contract: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
      name: 'Tether',
      symbol: 'USDT',
      decimals: 6,
      logo: usdtLogo,
    },
    {
      contract: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      name: 'USD Coin',
      symbol: 'USDC',
      decimals: 6,
      logo: usdcLogo,
    },
    {
      contract: '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6',
      name: 'Wrapped Bitcoin',
      symbol: 'WBTC',
      decimals: 8,
      logo: wbtcLogo,
    },
    {
      contract: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
      name: 'Wrapped Ether',
      symbol: 'WETH',
      decimals: 18,
      logo: wethLogo,
    },
    {
      contract: '0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39',
      name: 'ChainLink',
      symbol: 'LINK',
      decimals: 18,
      logo: linkLogo,
    },
    {
      contract: '0xb33eaad8d922b1083446dc23f610c2567fb5180f',
      name: 'Uniswap',
      symbol: 'UNI',
      decimals: 18,
      logo: uniLogo,
    },
    {
      contract: '0xd6df932a45c0f255f85145f286ea0b292b21c90b',
      name: 'Aave',
      symbol: 'AAVE',
      decimals: 18,
      logo: aaveLogo,
    },
    {
      contract: '0xc3ec80343d2bae2f8e680fdadde7c17e71e114ea',
      name: 'Mantra',
      symbol: 'OM',
      decimals: 18,
      logo: omLogo,
    },
  ];
  return tokens;
}

function base() {
  const tokens = [
    {
      contract: '', // first is always the native 'no contract' token 0x0000000000000000000000000000000000000000
      name: 'Base',
      symbol: 'ETH',
      decimals: 18,
      logo: baseLogo,
    },
    {
      contract: '0xb008bdcf9cdff9da684a190941dc3dca8c2cdd44',
      name: 'Flux',
      symbol: 'FLUX',
      decimals: 8,
      logo: fluxLogo,
    },
    {
      contract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      name: 'USD Coin',
      symbol: 'USDC',
      decimals: 6,
      logo: usdcLogo,
    },
  ];
  return tokens;
}

function avax() {
  const tokens = [
    {
      contract: '', // first is always the native 'no contract' token 0x0000000000000000000000000000000000000000
      name: 'Avalanche C-Chain',
      symbol: 'AVAX',
      decimals: 18,
      logo: avaxLogo,
    },
    {
      contract: '0xc4B06F17ECcB2215a5DBf042C672101Fc20daF55',
      name: 'Flux',
      symbol: 'FLUX',
      decimals: 8,
      logo: fluxLogo,
    },
    {
      contract: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
      name: 'Tether',
      symbol: 'USDT',
      decimals: 6,
      logo: usdtLogo,
    },
  ];
  return tokens;
}

function bsc() {
  const tokens = [
    {
      contract: '', // first is always the native 'no contract' token 0x0000000000000000000000000000000000000000
      name: 'Binance Smart Chain',
      symbol: 'BNB',
      decimals: 18,
      logo: bscLogo,
    },
    {
      contract: '0xaff9084f2374585879e8b434c399e29e80cce635',
      name: 'Flux',
      symbol: 'FLUX',
      decimals: 8,
      logo: fluxLogo,
    },
    {
      contract: '0x55d398326f99059ff775485246999027b3197955',
      name: 'Tether',
      symbol: 'USDT',
      decimals: 18,
      logo: usdtLogo,
    },
    {
      contract: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
      name: 'USD Coin',
      symbol: 'USDC',
      decimals: 18,
      logo: usdcLogo,
    },
  ];
  return tokens;
}

export const tokens = {
  eth,
  sepolia,
  amoy,
  polygon,
  base,
  avax,
  bsc,
};
