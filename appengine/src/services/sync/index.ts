import BigNumber from 'bignumber.js';
import axios from 'axios';
import _ from 'lodash';
import {
  isNotEmpty,
  bodyParams,
  bodyParams2,
  changePercentage,
  sortByParams,
  externalShardsByKeys,
} from './helpers';

BigNumber.config({
  FORMAT: {
    groupSeparator: '',
  },
});

const MAX_LENGTH = 30;
const SECOND_PER_BLOCK = 8;
const SYNC_PERIOD = 60000;
const VALIDATOR_PAGE_SIZE = 100;
const SLEEP_TIME = 5;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class SyncService {
  cache = {
    VALIDATORS: [],
    ACTIVE_VALIDATORS: [],
    VALIDATOR_INFO: {},
    VALIDATOR_INFO_HISTORY: {},
    DELEGATIONS_BY_DELEGATOR: {},
    DELEGATIONS_BY_VALIDATOR: {},
    STAKING_NETWORK_INFO: {},
    STAKING_NETWORK_INFO_PREV_EPOCH: {},
    VOTING_POWER: {},
    GLOBAL_SEATS: {},
    ELECTED_KEYS: {},
    ELECTED_KEYS_SET: {},
    GLOBAL_VIEW: {},
    RAW_STAKE: {},
    LIVE_ELECTED_KEYS: [],
    LIVE_RAW_STAKES: {},
    LIVE_EFFECTIVE_STAKES: {},
    LIVE_KEYS_PER_NODE: {},
    STAKING_DISTRO_TABLE: {},
    LIVE_STAKING_DISTRO_TABLE: {},
    ELECTED_KEYS_PER_NODE: {},
    LAST_EPOCH_METRICS: {},
    LIVE_EPOCH_METRICS: {},
    VALIDATORS_TOTAL_STAKE: {},
    LIVE_VALIDATORS_CANDIDATE: {},
  };

  constructor(
    BLOCKCHAIN_SERVER,
    chainTitle,
    updateDocument,
    getCollectionDataWithLimit,
    getGlobalDataWithLimit
  ) {
    // Currently only work for OS network and testnet.
    if (
      !(
        BLOCKCHAIN_SERVER.includes('api.s0.t.hmny.io') ||
        BLOCKCHAIN_SERVER.includes('api.s0.b.hmny.io')
      )
    ) {
      return;
    }

    console.log('Blockchain server: ', BLOCKCHAIN_SERVER);

    const historyCollection = `${chainTitle}_history`;
    const globalHistory = `${chainTitle}_global`;

    const apiClient = axios.create({
      baseURL: BLOCKCHAIN_SERVER,
      // baseURL: process.env.SERVER,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });

    // const getNumberOfShards = async () => {
    //   try {
    //     const res = await apiClient.post('/', bodyParams('hmy_getShardingStructure'));
    //
    //     if (Array.isArray(res.data.result)) {
    //       return res.data.result.length;
    //     } else {
    //       return 0;
    //     }
    //   } catch (err) {
    //     console.log(err);
    //     return 0;
    //   }
    // };

    let numOfShards = 0;

    const getAllValidatorAddressesData = async () => {
      try {
        const res = await apiClient.post('/', bodyParams('hmy_getAllValidatorAddresses'));

        if (Array.isArray(res.data.result)) {
          this.cache.VALIDATORS = res.data.result;
          console.log('# of validators', this.cache.VALIDATORS.length);
        }
        return res.data.result;
      } catch (err) {
        console.log('error when doing getAllValidatorAddressesData:', err);
      }
    };

    const filterGlobalCache = async currentEpoch => {
      let epoch = parseInt(currentEpoch);
      const lastEpoch = epoch;
      while (this.cache.GLOBAL_VIEW[epoch]) {
        epoch -= 1;
      }
      console.log(`latest ${epoch}`);
      _.keys(this.cache.GLOBAL_VIEW).forEach(k => {
        const key = parseInt(k);
        if (key < epoch || key > lastEpoch) {
          console.log(`delete key ${key}`);
          delete this.cache.GLOBAL_VIEW[key];
        }
      });
      console.log(`current ${lastEpoch}, last: ${epoch}`);
      console.log(`array: ${_.keys(this.cache.GLOBAL_VIEW)}`);
    };

    // const syncStakingNetworkInfo = async () => {
    //   try {
    //     const res = await apiClient.post('/', bodyParams('hmy_getStakingNetworkInfo'));
    //
    //     const prevNetworkInfo = { ...this.cache.STAKING_NETWORK_INFO };
    //
    //     if (res.data.result) {
    //       this.cache.STAKING_NETWORK_INFO = res.data.result;
    //     }
    //     let currentEpoch = null;
    //     const res2 = await apiClient.post('/', bodyParams('hmy_latestHeader'));
    //     if (res2.data.result) {
    //       this.cache.STAKING_NETWORK_INFO.current_block_number = res2.data.result.blockNumber;
    //       this.cache.STAKING_NETWORK_INFO.current_block_hash = res2.data.result.blockHash;
    //       this.cache.STAKING_NETWORK_INFO.current_epoch = res2.data.result.epoch;
    //       currentEpoch = res2.data.result.epoch;
    //     }
    //
    //     console.log(`getting current Epoch ${currentEpoch} at `, currentEpoch);
    //
    //     if (
    //       this.cache.STAKING_NETWORK_INFO['epoch-last-block'] &&
    //       this.cache.STAKING_NETWORK_INFO.current_block_number
    //     ) {
    //       this.cache.STAKING_NETWORK_INFO.time_next_epoch =
    //         SECOND_PER_BLOCK *
    //         (this.cache.STAKING_NETWORK_INFO['epoch-last-block'] -
    //           this.cache.STAKING_NETWORK_INFO.current_block_number);
    //     }
    //
    //     if (!this.cache.STAKING_NETWORK_INFO.effective_median_stake) {
    //       const medianStakeRes = await apiClient.post(
    //         '/',
    //         bodyParams('hmy_getMedianRawStakeSnapshot')
    //       );
    //       if (medianStakeRes.data.result) {
    //         this.cache.STAKING_NETWORK_INFO.effective_median_stake = _.get(
    //           medianStakeRes,
    //           'data.result.epos-median-stake'
    //         );
    //       }
    //     }
    //
    //     if (this.cache.GLOBAL_SEATS]) {
    //       this.cache.STAKING_NETWORK_INFO.total_seats = this.cache.GLOBAL_SEATS.total_seats
    //         ? this.cache.GLOBAL_SEATS.total_seats
    //         : 0;
    //       this.cache.STAKING_NETWORK_INFO.total_seats_used = this.cache.GLOBAL_SEATS.total_seats_used
    //         ? this.cache.GLOBAL_SEATS.total_seats_used
    //         : 0;
    //       this.cache.STAKING_NETWORK_INFO.externalShards = this.cache.GLOBAL_SEATS.externalShards
    //         ? this.cache.GLOBAL_SEATS.externalShards
    //         : [];
    //     }
    //
    //     if (this.cache.STAKING_NETWORK_INFO.current_epoch > prevNetworkInfo.current_epoch) {
    //       this.cache.STAKING_NETWORK_INFO_PREV_EPOCH = prevNetworkInfo;
    //     }
    //
    //     if (!_.isEmpty(this.cache.STAKING_NETWORK_INFO_PREV_EPOCH)) {
    //       const currentMS = this.cache.STAKING_NETWORK_INFO.effective_median_stake;
    //       const prevMS = this.cache.STAKING_NETWORK_INFO_PREV_EPOCH.effective_median_stake;
    //
    //       this.cache.STAKING_NETWORK_INFO.effective_median_stake_changed = changePercentage(
    //         currentMS,
    //         prevMS
    //       );
    //
    //       const currentTS = this.cache.STAKING_NETWORK_INFO['total-staking'];
    //       const prevTS = this.cache.STAKING_NETWORK_INFO_PREV_EPOCH['total-staking'];
    //
    //       this.cache.STAKING_NETWORK_INFO['total-staking-changed'] = changePercentage(
    //         currentTS,
    //         prevTS
    //       );
    //     }
    //
    //     // Store to firestore the previous global view.
    //     if (!this.cache.GLOBAL_VIEW[currentEpoch]) {
    //       if (this.cache.GLOBAL_VIEW[currentEpoch - 1]) {
    //         await updateDocument(
    //           globalHistory,
    //           `${currentEpoch - 1}`,
    //           this.cache.GLOBAL_VIEW[currentEpoch - 1]
    //         );
    //       }
    //       await updateDocument(globalHistory, `${currentEpoch}`, this.cache.STAKING_NETWORK_INFO);
    //     }
    //
    //     this.cache.GLOBAL_VIEW[currentEpoch] = this.cache.STAKING_NETWORK_INFO;
    //     if (this.cache.GLOBAL_VIEW[currentEpoch - MAX_LENGTH]) {
    //       delete this.cache.GLOBAL_VIEW[currentEpoch - MAX_LENGTH];
    //     }
    //     await filterGlobalCache(currentEpoch);
    //     return {
    //       ...this.cache.STAKING_NETWORK_INFO,
    //       history: this.cache.GLOBAL_VIEW,
    //     };
    //   } catch (err) {
    //     console.log(err);
    //   }
    // };

    const getRecentData = async address => {
      const res = new Map();
      try {
        const recent = await getCollectionDataWithLimit(
          historyCollection,
          address,
          'index',
          MAX_LENGTH
        );
        if (!Array.isArray(recent)) {
          return;
        }
        _.forEach(recent, item => {
          res[item.index] = item;
        });
      } catch (err) {
        console.log(`error when getRecentData ${address}`, err);
      }
      return res;
    };

    const getRecentGlobalData = async () => {
      const res = new Map();
      try {
        const recent = await getCollectionDataWithLimit(globalHistory, 'index', MAX_LENGTH);
        if (!Array.isArray(recent)) {
          return;
        }
        _.forEach(recent, item => {
          res[item.index] = item;
        });
      } catch (err) {
        console.log(`error when getRecentData ${address}`, err);
      }
      return res;
    };

    const processValidatorWithPage = async page => {
      try {
        const res = await apiClient.post('/', bodyParams2('hmy_getAllValidatorInformation', page));
        if (res && res.data && res.data.result && Array.isArray(res.data.result)) {
          console.log(`hmy_getAllValidatorInformation with page ${page}: `, res.data.result.length);

          res.data.result.forEach(async elem => {
            if (elem && elem.validator && elem.validator.address) {
              await processValidatorInfoData(elem.validator.address, elem);
            }
          });
          return res.data.result.length;
        } else {
          return 0;
        }
      } catch (err) {
        console.log('error when processValidatorWithPage: ', err);
        return 0;
      }
    };

    const processValidatorInfoData = async (address, result) => {
      try {
        if (isNotEmpty(result)) {
          const res = result.validator;
          let selfStake = 0;
          let totalStake = 0;
          let averageStake = 0;
          let remainder = res['max-total-delegation'];

          if (
            this.cache.DELEGATIONS_BY_VALIDATOR[address] &&
            this.cache.DELEGATIONS_BY_VALIDATOR[address].length
          ) {
            const elem = this.cache.DELEGATIONS_BY_VALIDATOR[address].find(
              e => e.validator_address === e.delegator_address
            );
            if (elem) {
              selfStake = elem.amount;
            }
            totalStake = this.cache.DELEGATIONS_BY_VALIDATOR[address].reduce(
              (acc, val) => BigNumber(acc).plus(val.amount).toFormat(),
              0
            );

            averageStake = BigNumber(totalStake)
              .div(this.cache.DELEGATIONS_BY_VALIDATOR[address].length)
              .toFormat();

            remainder = BigNumber(remainder).minus(totalStake).toFormat();
          }

          const utcDate = new Date(Date.now());
          const epochIndex = parseInt(res['last-epoch-in-committee']);

          const validatorInfo = {
            ...res,
            self_stake: selfStake,
            total_stake: totalStake,
            average_stake: averageStake,
            average_stake_by_bls:
              Array.isArray(res['bls-public-keys']) && res['bls-public-keys'].length > 0
                ? totalStake / (1.0 * res['bls-public-keys'].length)
                : 0,
            remainder,
            voting_power: _.get(result, 'metrics.by-shard')
              ? _.sumBy(
                  _.get(result, 'metrics.by-shard'),
                  item => parseFloat(item['group-percent']) / 4.0
                )
              : null,
            signed_blocks: 50,
            blocks_should_sign: 100,
            uctDate: utcDate,
            index: epochIndex,
            address: res['one-address'] || res.address,
            active_nodes: Array.isArray(res['bls-public-keys']) ? res['bls-public-keys'].length : 1,
            elected_nodes: Array.isArray(res['bls-public-keys'])
              ? res['bls-public-keys'].filter(item => this.cache.ELECTED_KEYS_SET.has(item)).length
              : 0,
            active: this.cache.ACTIVE_VALIDATORS.includes(res.address),
            uptime_percentage:
              _.get(result, 'lifetime.blocks.signed') && _.get(result, 'lifetime.blocks.to-sign')
                ? parseFloat(_.get(result, 'lifetime.blocks.signed')) /
                  parseFloat(_.get(result, 'lifetime.blocks.to-sign'))
                : null,
            last_apr: _.get(result, 'lifetime.apr', null),
            epoch_apr: _.get(result, 'lifetime.epoch-apr', null),
            lifetime_reward_accumulated: _.get(result, 'lifetime.reward-accumulated', null),
          };

          // if (validatorInfo.active) {
          if (Array.isArray(validatorInfo.epoch_apr)) {
            const { epoch_apr } = validatorInfo;

            validatorInfo.apr =
              epoch_apr.reduce((acc, v) => acc + parseFloat(v['Value']), 0) / epoch_apr.length;
          }
          // } else {
          //   const history = _.values(
          //     this.cache.VALIDATOR_INFO_HISTORY][validatorInfo.address]
          //   )
          //     .sort((a, b) => a.index - b.index)
          //     .slice(1)
          //
          //   if (history.length) {
          //     validatorInfo.apr =
          //       history.reduce((acc, v) => {
          //         const apr =
          //           v.last_apr !== undefined
          //             ? parseFloat(v.last_apr)
          //             : parseFloat(v.apr)
          //
          //         return acc + apr
          //       }, 0) / history.length
          //   } else {
          //     validatorInfo.apr = 0
          //   }
          // }

          if (!this.cache.VALIDATORS_TOTAL_STAKE[validatorInfo.address]) {
            console.log('Total stake - NOT FOUND ' + validatorInfo.address);
          }

          // if (
          //   this.cache.VALIDATORS_TOTAL_STAKE] &&
          //   this.cache.VALIDATORS_TOTAL_STAKE][validatorInfo.address]
          // ) {
          //   const { currentTotalStake, previousTotalStake } = this.cache.
          //     VALIDATORS_TOTAL_STAKE
          //   ][validatorInfo.address]
          //
          //   if (previousTotalStake) {
          //     // console.log('--------------------------')
          //     // console.log('Address ' + validatorInfo.address)
          //     // console.log('currentTotalStake ' + currentTotalStake)
          //     // console.log('previousTotalStake ' + previousTotalStake)
          //     // console.log('validatorInfo.apr ' + validatorInfo.apr)
          //
          //     validatorInfo.apr =
          //       (validatorInfo.apr * currentTotalStake) / previousTotalStake
          //
          //     // console.log('Result ' + validatorInfo.apr)
          //   }
          // }

          // Calculating this.cache.VALIDATOR_INFO_HISTORY]
          if (!this.cache.VALIDATOR_INFO_HISTORY[address]) {
            this.cache.VALIDATOR_INFO_HISTORY[address] = await getRecentData(address);
          }

          // update the previous epochIndex if this is the first time epochIndex will be inserted.
          if (!this.cache.VALIDATOR_INFO_HISTORY[address][epochIndex]) {
            await updateDocument(historyCollection, `${address}_${epochIndex}`, validatorInfo);
            // We store the last data of the previous epoch.
            if (this.cache.VALIDATOR_INFO_HISTORY[address][epochIndex - 1]) {
              await updateDocument(
                historyCollection,
                `${address}_${epochIndex - 1}`,
                this.cache.VALIDATOR_INFO_HISTORY[address][epochIndex - 1]
              );
            }
          }
          if (
            this.cache.VALIDATOR_INFO[address] &&
            validatorInfo.rate !== this.cache.VALIDATOR_INFO[address].rate
          ) {
            validatorInfo['commision-recent-change'] = utcDate;
          } else if (
            this.cache.VALIDATOR_INFO[address] &&
            this.cache.VALIDATOR_INFO[address]['commision-recent-change']
          ) {
            validatorInfo['commision-recent-change'] =
              this.cache.VALIDATOR_INFO[address]['commision-recent-change'];
          }

          this.cache.VALIDATOR_INFO[address] = validatorInfo;

          this.cache.VALIDATOR_INFO_HISTORY[address][epochIndex] = validatorInfo;
          if (this.cache.VALIDATOR_INFO_HISTORY[address][epochIndex - MAX_LENGTH]) {
            delete this.cache.VALIDATOR_INFO_HISTORY[address][epochIndex - MAX_LENGTH];
          }
        }
      } catch (e) {
        console.log('error in processValidatorInfoData:', e);
      }
    };

    const getDelegationsByDelegatorData = async address => {
      const res = await apiClient.post('/', bodyParams('hmy_getDelegationsByDelegator', address));

      let result = res.data.result;
      result = _.forEach(result, elem => {
        elem.validator_info = this.cache.VALIDATOR_INFO][elem.validator_address];
      });
      if (isNotEmpty(result)) {
        this.cache.DELEGATIONS_BY_DELEGATOR][address] = result;
      }
      return result;
    };

    const getAllDelegationsInfo = async () => {
      try {
        let page = 0;
        while (true) {
          const res = await apiClient.post(
            '/',
            bodyParams2('hmy_getAllDelegationInformation', page)
          );

          if (res && res.data && Array.isArray(res.data.result) && isNotEmpty(res.data.result)) {
            console.log(
              `hmy_getAllDelegationInformation with page ${page}: `,
              res.data.result.length
            );
            res.data.result.forEach(elem => {
              if (Array.isArray(elem) && elem[0] && elem[0].validator_address) {
                this.cache.DELEGATIONS_BY_VALIDATOR][elem[0].validator_address] = elem;
              }
            });
            page += 1;
          } else {
            break;
          }
        }
      } catch (err) {
        console.log('error when getDelegationsFirst', err);
      }
      await sleep(SLEEP_TIME);
    };

    const getAllValidatorsInfo = async () => {
      let totalValidators = 0;
      let page = 0;
      while (totalValidators < this.cache.VALIDATORS.length) {
        const count = await processValidatorWithPage(page);
        totalValidators += count;
        console.log('get validator', count);
        if (count === 0) {
          break;
        }
        page += 1;
      }
      await sleep(SLEEP_TIME);
    };

    const getDelegationsByValidatorData = async address => {
      const res = await apiClient.post('/', bodyParams('hmy_getDelegationsByValidator', address));

      if (isNotEmpty(res.data.result)) {
        this.cache.DELEGATIONS_BY_VALIDATOR[address] = res.data.result;
      }
      // console.log("getDelegationsByValidatorData ${address}", res.data.result);
      return res.data.result;
    };

    // const callSuperCommittees = async () => {
    //   try {
    //     const res = await apiClient.post('/', bodyParams('hmy_getSuperCommittees'));
    //     if (numOfShards === 0) {
    //       numOfShards = await getNumberOfShards();
    //       console.log(`numOfShards ${numOfShards}`);
    //     }
    //     const externalShardKeys = _.range(numOfShards).map(e => {
    //       const total = _.get(
    //         res,
    //         `data.result.current.quorum-deciders.shard-${e}.committee-members`
    //       );
    //       if (!total) {
    //         return [];
    //       }
    //
    //       return total.filter(item => !item['is-harmony-slot']).map(e => e['bls-public-key']);
    //     });
    //
    //     const rawStakes = {};
    //     const electedKeys = [];
    //     const effectiveStakes = {};
    //     const electedKeysPerNode = {};
    //     const externalShards = _.range(numOfShards).map(e => {
    //       const total = _.get(
    //         res,
    //         `data.result.current.quorum-deciders.shard-${e}.committee-members`
    //       );
    //       if (total) {
    //         console.log(`total: ${total.length}`);
    //         total.forEach(item => {
    //           if (!item['is-harmony-slot']) {
    //             const blsKey = item['bls-public-key'];
    //             const address = item['earning-account'];
    //             rawStakes[blsKey] = parseFloat(item['raw-stake']);
    //             effectiveStakes[blsKey] = parseFloat(item['effective-stake']);
    //             electedKeys.push(blsKey);
    //             if (electedKeysPerNode[address]) {
    //               electedKeysPerNode[address].push(blsKey);
    //             } else {
    //               electedKeysPerNode[address] = [blsKey];
    //             }
    //           }
    //         });
    //
    //         return {
    //           total: total.length,
    //           external: total.filter(item => !item['is-harmony-slot']).length,
    //         };
    //       } else {
    //         console.log('error when getting elected bls keys');
    //       }
    //     });
    //     // TODO: add mutex to avoid requests return empty data.
    //     this.cache.RAW_STAKE = null;
    //     this.cache.RAW_STAKE = rawStakes;
    //     this.cache.ELECTED_KEYS = null;
    //     this.cache.ELECTED_KEYS = electedKeys;
    //     this.cache.EFFECTIVE_STAKE = null;
    //     this.cache.EFFECTIVE_STAKE = effectiveStakes;
    //     this.cache.ELECTED_KEYS_PER_NODE = null;
    //     this.cache.ELECTED_KEYS_PER_NODE = electedKeysPerNode;
    //     this.cache.LAST_EPOCH_METRICS = null;
    //
    //     const calculateTotalStakeByShard = (shard, type, address) => {
    //       const committeeMembers = _.get(
    //         res,
    //         `data.result.${type}.quorum-deciders.shard-${shard}.committee-members`
    //       );
    //
    //       if (!committeeMembers) {
    //         console.log('Error: not found committeeMembers');
    //
    //         return 0;
    //       }
    //
    //       return committeeMembers
    //         .filter(cm => (address ? cm['earning-account'] === address : true))
    //         .reduce((acc, e) => {
    //           if (e['is-harmony-slot']) {
    //             return acc;
    //           }
    //
    //           return acc + (e['raw-stake'] ? parseFloat(e['raw-stake']) : 0);
    //         }, 0);
    //     };
    //
    //     // for apr calculating
    //     this.cache.VALIDATORS_TOTAL_STAKE = {};
    //
    //     if (this.cache.VALIDATORS) {
    //       this.cache.VALIDATORS.forEach(address => {
    //         const currentTotalStake = _.sumBy(_.range(numOfShards), shard =>
    //           calculateTotalStakeByShard(shard, 'current', address)
    //         );
    //
    //         const previousTotalStake = _.sumBy(_.range(numOfShards), shard =>
    //           calculateTotalStakeByShard(shard, 'previous', address)
    //         );
    //
    //         this.cache.VALIDATORS_TOTAL_STAKE[address] = {
    //           currentTotalStake,
    //           previousTotalStake,
    //         };
    //       });
    //     }
    //
    //     this.cache.LAST_EPOCH_METRICS = {
    //       lastEpochTotalStake: _.sumBy(_.range(numOfShards), shard =>
    //         calculateTotalStakeByShard(shard, 'current')
    //       ),
    //       // currentEpochTotalStake: _.sumBy(_.range(numOfShards), shard =>
    //       //   calculateTotalStakeByShard(shard, 'current')
    //       // ),
    //       lastEpochEffectiveStake: parseFloat(
    //         _.get(res, 'data.result.current.epos-median-stake', 0)
    //       ),
    //     };
    //
    //     this.cache.GLOBAL_SEATS.total_seats = _.get(res, 'data.result.current.external-slot-count')
    //       ? _.get(res, 'data.result.current.external-slot-count')
    //       : 0;
    //     console.log('externalShards', externalShards);
    //     this.cache.GLOBAL_SEATS.total_seats_used = _.sumBy(externalShards, e => (e ? e.external : 0));
    //     this.cache.GLOBAL_SEATS.externalShards = externalShards.filter(x => x);
    //     this.cache.ELECTED_KEYS_SET = null;
    //
    //     this.cache.ELECTED_KEYS_SET = externalShardKeys.reduce((cur, elem) => {
    //       elem.forEach(key => cur.add(key));
    //       return cur;
    //     }, new Set());
    //   } catch (err) {
    //     console.log(`error when updatingVotingPower for ${BLOCKCHAIN_SERVER}`, err);
    //   }
    // };
    //
    // const callMedianRawStakeSnapshot = async () => {
    //   let res = null;
    //   try {
    //     res = await apiClient.post('/', bodyParams('hmy_getMedianRawStakeSnapshot'));
    //
    //     const liveRawStakes = {};
    //     const liveElectedKeys = [];
    //     const liveEffectiveStakes = {};
    //     const liveKeysPerNode = {};
    //
    //     let liveEpochTotalStake = 0;
    //
    //     res.data.result['epos-slot-winners'].forEach(e => {
    //       liveEpochTotalStake += parseFloat(e['raw-stake']);
    //
    //       if (e['slot-owner']) {
    //         const nodeAddress = e['slot-owner'];
    //         const key = e['bls-public-key'];
    //         liveElectedKeys.push(key);
    //         liveRawStakes[key] = parseFloat(e['raw-stake']);
    //         liveEffectiveStakes[key] = parseFloat(e['eposed-stake']);
    //         if (liveKeysPerNode[nodeAddress]) {
    //           liveKeysPerNode[nodeAddress].push(key);
    //         } else {
    //           liveKeysPerNode[nodeAddress] = [key];
    //         }
    //       }
    //     });
    //
    //     const candidates = [];
    //
    //     res.data.result['epos-slot-candidates'].forEach(e => {
    //       if (e['validator']) {
    //         const nodeAddress = e['validator'];
    //
    //         if (!candidates.find(v => v.address === nodeAddress)) {
    //           candidates.push({
    //             address: nodeAddress,
    //             bid: e['stake-per-key'],
    //             total_stake: e['stake'],
    //             keys: e['keys-at-auction'],
    //             num: e['keys-at-auction'].length,
    //           });
    //         }
    //       }
    //     });
    //
    //     const liveExternalShards = externalShardsByKeys(liveElectedKeys);
    //
    //     const liveTotalSeatsUsed = _.sumBy(liveExternalShards, e => (e ? e.external : 0));
    //
    //     const liveTotalSeats = _.sumBy(liveExternalShards, e => (e ? e.external : 0));
    //
    //     this.cache.LIVE_EPOCH_METRICS = {
    //       liveEpochTotalStake,
    //       liveExternalShards,
    //       liveTotalSeatsUsed,
    //       liveTotalSeats,
    //     };
    //
    //     this.cache.LIVE_ELECTED_KEYS = null;
    //     this.cache.LIVE_EFFECTIVE_STAKES = null;
    //     this.cache.LIVE_RAW_STAKES = null;
    //     this.cache.LIVE_RAW_STAKES = liveRawStakes;
    //     this.cache.LIVE_EFFECTIVE_STAKES = liveEffectiveStakes;
    //     this.cache.LIVE_ELECTED_KEYS = liveElectedKeys;
    //     this.cache.LIVE_KEYS_PER_NODE = liveKeysPerNode;
    //     this.cache.LIVE_VALIDATORS_CANDIDATE = candidates;
    //   } catch (err) {
    //     console.log(
    //       `error when callMedianRawStakeSnapshot for ${BLOCKCHAIN_SERVER}`,
    //       err,
    //       res.result
    //     );
    //   }
    // };

    // const calculateDistroTable = async () => {
    //   let table = Object.keys(this.cache.ELECTED_KEYS_PER_NODE).map(nodeAddress => {
    //     const blsKeys = this.cache.ELECTED_KEYS_PER_NODE[nodeAddress];
    //     const total_stake = _.sumBy(blsKeys, k => this.cache.RAW_STAKE[k]);
    //     if (this.cache.VALIDATOR_INFO[nodeAddress] == undefined) {
    //       console.log(`undefine is here: ${nodeAddress}`);
    //     }
    //     return {
    //       address: nodeAddress,
    //       name: this.cache.VALIDATOR_INFO[nodeAddress].name,
    //       effective_stake: this.cache.EFFECTIVE_STAKE[blsKeys[0]],
    //       bid: total_stake / blsKeys.length,
    //       total_stake,
    //       num: blsKeys.length,
    //     };
    //   });
    //
    //   table = _.sortBy(table, e => -e.bid);
    //   let slot = 0;
    //
    //   table = table.map(e => {
    //     slot += e.num;
    //     return {
    //       ...e,
    //       slot: e.num === 1 ? `${slot}` : `${slot - e.num + 1}-${slot}`,
    //     };
    //   });
    //   this.cache.STAKING_DISTRO_TABLE = table;
    //
    //   // Live TABLE
    //
    //   let liveTable = Object.keys(this.cache.LIVE_KEYS_PER_NODE).map(nodeAddress => {
    //     const blsKeys = this.cache.LIVE_KEYS_PER_NODE[nodeAddress];
    //
    //     return {
    //       address: nodeAddress,
    //       name: this.cache.VALIDATOR_INFO[nodeAddress].name,
    //       effective_stake: this.cache.LIVE_EFFECTIVE_STAKES[blsKeys[0]],
    //       bid: _.sumBy(blsKeys, k => this.cache.LIVE_RAW_STAKES[k]) / blsKeys.length,
    //       total_stake: _.sumBy(blsKeys, k => this.cache.LIVE_RAW_STAKES[k]),
    //       num: blsKeys.length,
    //     };
    //   });
    //
    //   liveTable = _.sortBy(liveTable, e => -e.bid);
    //
    //   let candidateTable = this.cache.LIVE_VALIDATORS_CANDIDATE.filter(
    //     v => !liveTable.find(val => val.address === v.address)
    //   ).map(v => ({
    //     ...v,
    //     name: this.cache.VALIDATOR_INFO[v.address] ? this.cache.VALIDATOR_INFO[v.address].name : '',
    //   }));
    //
    //   candidateTable = _.sortBy(candidateTable, e => -e.bid);
    //
    //   liveTable = liveTable.concat(candidateTable);
    //
    //   slot = 0;
    //
    //   liveTable = liveTable.map(e => {
    //     slot += e.num;
    //     return {
    //       ...e,
    //       slot: e.num === 1 ? `${slot}` : `${slot - e.num + 1}-${slot}`,
    //     };
    //   });
    //
    //   this.cache.LIVE_STAKING_DISTRO_TABLE = liveTable;
    // };

    const update = async () => {
      try {
        // Calculate voting power first.
        await callSuperCommittees();
        await callMedianRawStakeSnapshot();

        // Get global info first.
        await syncStakingNetworkInfo();

        // Call to store active validator and all validators.
        // await getActiveValidatorAddressesData()
        await getAllValidatorAddressesData();

        // Get  all delegations by validator first.
        await getAllDelegationsInfo();

        // Then get validator info, each call gets 100 validatorinfo.

        await getElectedValidators();

        await getAllValidatorsInfo();
        console.log('distro calculation starting.');
        await calculateDistroTable();
        console.log('distro calculation finished.');
      } catch (err) {
        console.log('here Error: ', err.message);
      }
    };

    const getElectedValidators = async () => {
      let res = null;
      try {
        this.cache.ACTIVE_VALIDATORS = [];

        res = await apiClient.post('/', bodyParams('hmy_getElectedValidatorAddresses'));

        if (res.data && res.data.result) {
          this.cache.ACTIVE_VALIDATORS = res.data.result;
        } else {
          console.log(`error when getElectedValidators for ${BLOCKCHAIN_SERVER}`);
        }
      } catch (err) {
        console.log(
          `error when callMedianRawStakeSnapshot for ${BLOCKCHAIN_SERVER}`,
          err,
          res.result
        );
      }
    };

    const init = async () => {
      const res = await getGlobalDataWithLimit(globalHistory, 'current_epoch', MAX_LENGTH);
      _.forEach(res, item => (this.cache.GLOBAL_VIEW[item.current_epoch] = item));
    };
    init();
    setInterval(async () => {
      console.log('--------- Updating ---------', BLOCKCHAIN_SERVER);
      await update();
    }, SYNC_PERIOD);

    update();

    // const getStakingNetworkInfo = () => {
    //   const stakingNetworkInfo = !this.cache.STAKING_NETWORK_INFO
    //     ? {}
    //     : {
    //         ...this.cache.STAKING_NETWORK_INFO,
    //         history: this.cache.GLOBAL_VIEW,
    //         raw_stake_distro: this.cache.ELECTED_KEYS.map(e => this.cache.RAW_STAKE[e]),
    //         effective_median_stake_distro: this.cache.ELECTED_KEYS.map(e => this.cache.EFFECTIVE_STAKE[e]),
    //         table: this.cache.STAKING_DISTRO_TABLE,
    //         live_table: this.cache.LIVE_STAKING_DISTRO_TABLE,
    //         live_raw_stake_distro: this.cache.LIVE_ELECTED_KEYS.map(e => this.cache.LIVE_RAW_STAKES[e]),
    //         live_effective_median_stake_distro: this.cache.LIVE_ELECTED_KEYS.map(
    //           e => this.cache.LIVE_EFFECTIVE_STAKES[e]
    //         ),
    //         ...this.cache.LAST_EPOCH_METRICS,
    //         ...this.cache.LIVE_EPOCH_METRICS,
    //       };
    //
    //   return stakingNetworkInfo;
    // };

    const getValidators = () => {
      const validators = !this.cache.VALIDATORS ? [] : this.cache.VALIDATORS;

      return validators
        .map(address => {
          return { ...this.cache.VALIDATOR_INFO[address] };
        })
        .filter(isNotEmpty);
    };

    const getValidatorsWithPage = async params => {
      const { page, size, active, sortProperty, sortOrder, search } = params;

      const pageInt = parseInt(page, 10);
      const sizeInt = parseInt(size, 10);
      let validators;

      if (active === 'true') {
        validators = !this.cache.ACTIVE_VALIDATORS ? [] : this.cache.ACTIVE_VALIDATORS;
      } else {
        validators = !this.cache.VALIDATORS ? [] : this.cache.VALIDATORS;
      }

      if (
        pageInt < 0 ||
        sizeInt < 0 ||
        sizeInt > VALIDATOR_PAGE_SIZE ||
        pageInt * sizeInt >= validators.length
      ) {
        return {
          validators: [],
          totalFound: 0,
          total: this.cache.VALIDATORS.length,
          total_active: this.cache.ACTIVE_VALIDATORS.length,
        };
      } else {
        validators = validators
          .map(address => {
            return { ...this.cache.VALIDATOR_INFO[address] };
          })
          .filter(isNotEmpty)
          .filter(
            v =>
              !search ||
              v.name.toLowerCase().includes(search.toLowerCase()) ||
              v.address.toLowerCase().includes(search.toLowerCase())
          );

        const totalFound = validators.length;

        if (sortProperty && sortOrder) {
          validators = sortByParams(validators.slice(0), sortProperty, sortOrder);
        }

        validators = validators.slice(pageInt * sizeInt, (pageInt + 1) * sizeInt);

        return {
          validators,
          totalFound,
          total: this.cache.VALIDATORS.length,
          total_active: this.cache.ACTIVE_VALIDATORS.length,
        };
      }
    };

    const getValidatorsSizes = async () => {
      return {
        total: this.cache.VALIDATORS.length,
        total_active: this.cache.ACTIVE_VALIDATORS.length,
      };
    };

    // deprecated
    const getActiveValidators = () => {
      if (!this.cache.ACTIVE_VALIDATORS) {
        return [];
      }

      return this.cache.ACTIVE_VALIDATORS.map(address => {
        return this.cache.VALIDATOR_INFO[address];
      }).filter(isNotEmpty);
    };

    const getDelegationsByDelegator = async address => await getDelegationsByDelegatorData(address);

    return {
      getStakingNetworkInfo,
      getValidators,
      getValidatorsWithPage,
      getValidatorsSizes,
      getActiveValidators,
      getValidatorInfo: address => this.cache.VALIDATOR_INFO[address],
      getValidatorHistory: address =>
        _.values(this.cache.VALIDATOR_INFO_HISTORY[address]).sort((a, b) => a.index - b.index),
      getDelegationsByDelegator,
      getDelegationsByValidator: address => this.cache.DELEGATIONS_BY_VALIDATOR[address],
    };
  }
}
