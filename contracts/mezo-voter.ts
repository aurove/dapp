// Generated from packages/core/tigris/solidity/deployments/mainnet/Voter.json.
import { MEZO_VOTER_INCENTIVE_ABI } from "./mezo-voting-incentives";
export const MEZO_VOTER_ABI = [
  ...MEZO_VOTER_INCENTIVE_ABI,
  ...[
    {
      inputs: [],
      name: "AlreadyVotedOrDeposited",
      type: "error",
    },
    {
      inputs: [],
      name: "DistributeWindow",
      type: "error",
    },
    {
      inputs: [],
      name: "FactoryPathNotApproved",
      type: "error",
    },
    {
      inputs: [],
      name: "GaugeAlreadyKilled",
      type: "error",
    },
    {
      inputs: [],
      name: "GaugeAlreadyRevived",
      type: "error",
    },
    {
      inputs: [
        {
          internalType: "address",
          name: "_pool",
          type: "address",
        },
      ],
      name: "GaugeDoesNotExist",
      type: "error",
    },
    {
      inputs: [],
      name: "GaugeExists",
      type: "error",
    },
    {
      inputs: [
        {
          internalType: "address",
          name: "_gauge",
          type: "address",
        },
      ],
      name: "GaugeNotAlive",
      type: "error",
    },
    {
      inputs: [],
      name: "InactiveManagedNFT",
      type: "error",
    },
    {
      inputs: [],
      name: "MaximumVotingNumberTooLow",
      type: "error",
    },
    {
      inputs: [],
      name: "NonZeroVotes",
      type: "error",
    },
    {
      inputs: [],
      name: "NotAPool",
      type: "error",
    },
    {
      inputs: [],
      name: "NotApprovedOrOwner",
      type: "error",
    },
    {
      inputs: [],
      name: "NotEmergencyCouncil",
      type: "error",
    },
    {
      inputs: [],
      name: "NotGovernor",
      type: "error",
    },
    {
      inputs: [],
      name: "NotSplitter",
      type: "error",
    },
    {
      inputs: [],
      name: "NotWhitelistedNFT",
      type: "error",
    },
    {
      inputs: [],
      name: "NotWhitelistedToken",
      type: "error",
    },
    {
      inputs: [],
      name: "SameValue",
      type: "error",
    },
    {
      inputs: [],
      name: "SpecialVotingWindow",
      type: "error",
    },
    {
      inputs: [],
      name: "TooManyPools",
      type: "error",
    },
    {
      inputs: [],
      name: "UnequalLengths",
      type: "error",
    },
    {
      inputs: [],
      name: "ZeroAddress",
      type: "error",
    },
    {
      inputs: [],
      name: "ZeroBalance",
      type: "error",
    },
    {
      inputs: [
        {
          internalType: "uint256",
          name: "_timestamp",
          type: "uint256",
        },
      ],
      name: "epochNext",
      outputs: [
        {
          internalType: "uint256",
          name: "",
          type: "uint256",
        },
      ],
      stateMutability: "pure",
      type: "function",
    },
    {
      inputs: [
        {
          internalType: "uint256",
          name: "_timestamp",
          type: "uint256",
        },
      ],
      name: "epochStart",
      outputs: [
        {
          internalType: "uint256",
          name: "",
          type: "uint256",
        },
      ],
      stateMutability: "pure",
      type: "function",
    },
    {
      inputs: [
        {
          internalType: "uint256",
          name: "_timestamp",
          type: "uint256",
        },
      ],
      name: "epochVoteEnd",
      outputs: [
        {
          internalType: "uint256",
          name: "",
          type: "uint256",
        },
      ],
      stateMutability: "pure",
      type: "function",
    },
    {
      inputs: [
        {
          internalType: "uint256",
          name: "_timestamp",
          type: "uint256",
        },
      ],
      name: "epochVoteStart",
      outputs: [
        {
          internalType: "uint256",
          name: "",
          type: "uint256",
        },
      ],
      stateMutability: "pure",
      type: "function",
    },
    {
      inputs: [
        {
          internalType: "address",
          name: "",
          type: "address",
        },
      ],
      name: "gaugeToFees",
      outputs: [
        {
          internalType: "address",
          name: "",
          type: "address",
        },
      ],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [
        {
          internalType: "uint256",
          name: "",
          type: "uint256",
        },
      ],
      name: "isWhitelistedNFT",
      outputs: [
        {
          internalType: "bool",
          name: "",
          type: "bool",
        },
      ],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [
        {
          internalType: "uint256",
          name: "",
          type: "uint256",
        },
      ],
      name: "lastVoted",
      outputs: [
        {
          internalType: "uint256",
          name: "",
          type: "uint256",
        },
      ],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [],
      name: "maxVotingNum",
      outputs: [
        {
          internalType: "uint256",
          name: "",
          type: "uint256",
        },
      ],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [
        {
          internalType: "uint256",
          name: "",
          type: "uint256",
        },
        {
          internalType: "uint256",
          name: "",
          type: "uint256",
        },
      ],
      name: "poolVote",
      outputs: [
        {
          internalType: "address",
          name: "",
          type: "address",
        },
      ],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [],
      name: "totalWeight",
      outputs: [
        {
          internalType: "uint256",
          name: "",
          type: "uint256",
        },
      ],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [
        {
          internalType: "uint256",
          name: "",
          type: "uint256",
        },
      ],
      name: "usedWeights",
      outputs: [
        {
          internalType: "uint256",
          name: "",
          type: "uint256",
        },
      ],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [],
      name: "ve",
      outputs: [
        {
          internalType: "address",
          name: "",
          type: "address",
        },
      ],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [
        {
          internalType: "uint256",
          name: "_tokenId",
          type: "uint256",
        },
        {
          internalType: "address[]",
          name: "_poolVote",
          type: "address[]",
        },
        {
          internalType: "uint256[]",
          name: "_weights",
          type: "uint256[]",
        },
      ],
      name: "vote",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    {
      inputs: [
        {
          internalType: "uint256",
          name: "",
          type: "uint256",
        },
        {
          internalType: "address",
          name: "",
          type: "address",
        },
      ],
      name: "votes",
      outputs: [
        {
          internalType: "uint256",
          name: "",
          type: "uint256",
        },
      ],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [
        {
          internalType: "address",
          name: "",
          type: "address",
        },
      ],
      name: "weights",
      outputs: [
        {
          internalType: "uint256",
          name: "",
          type: "uint256",
        },
      ],
      stateMutability: "view",
      type: "function",
    },
  ],
] as const;
