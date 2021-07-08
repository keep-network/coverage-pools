#!/bin/bash
set -euo pipefail

LOG_START='\n\e[1;36m'  # new line + bold + cyan
LOG_END='\n\e[0m'       # new line + reset
DONE_START='\n\e[1;32m' # new line + bold + green
DONE_END='\n\n\e[0m'    # new line + reset

COVERAGE_POOL_PATH=$(realpath $(dirname $0)/../)

# Defaults, can be overwritten by env variables/input parameters
NETWORK_DEFAULT="local"
KEEP_TOKEN_ADDRESS=${KEEP_TOKEN_ADDRESS:-""}
TBTC_TOKEN_ADDRESS=${TBTC_TOKEN_ADDRESS:-""}
TBTC_DEPOSIT_TOKEN_ADDRESS=${TBTC_DEPOSIT_TOKEN_ADDRESS:-""}
UNISWAP_ROUTER_V2_ADDRESS=${UNISWAP_ROUTER_V2_ADDRESS:-""}
INITIAL_SWAP_STRATEGY=${INITIAL_SWAP_STRATEGY:-""}

help() {
  echo -e "\nUsage: ENV_VAR(S) $0" \
    "--network <network>"

  echo -e "\nEnvironment variables:\n"
  echo -e "\tKEEP_TOKEN_ADDRESS: Determines the address of KEEP token contract"
  echo -e "\tTBTC_TOKEN_ADDRESS: Determines the address of TBTC token contract"
  echo -e "\tTBTC_DEPOSIT_TOKEN_ADDRESS: Determines the address of TDT token contract"
  echo -e "\tUNISWAP_ROUTER_V2_ADDRESS: Determines the address of Uniswap v2 router"
  echo -e "\tINITIAL_SWAP_STRATEGY: Allows setting the initial swap strategy which will be used by the risk manager." \
    "This should be the name of one of the ISignerBondsSwapStrategy implementations."


  echo -e "\nCommand line arguments:\n"
  echo -e "\t--network: Ethereum network." \
    "Available networks and settings are specified in 'hardhat.config.js'"
  exit 1 # Exit script after printing help
}

# Transform long options to short ones
for arg in "$@"; do
  shift
  case "$arg" in
  "--network") set -- "$@" "-n" ;;
  "--help") set -- "$@" "-h" ;;
  *) set -- "$@" "$arg" ;;
  esac
done

# Parse short options
OPTIND=1
while getopts "n:mh" opt; do
  case "$opt" in
  n) network="$OPTARG" ;;
  m) contracts_only=true ;;
  h) help ;;
  ?) help ;; # Print help in case parameter is non-existent
  esac
done
shift $(expr $OPTIND - 1) # remove options from positional parameters

# Overwrite default properties
NETWORK=${network:-$NETWORK_DEFAULT}

printf "${LOG_START}Network: $NETWORK ${LOG_END}"

# Run script.
printf "${LOG_START}Starting installation...${LOG_END}"

printf "${LOG_START}Installing dependencies...${LOG_END}"
yarn install

printf "${LOG_START}Migrating contracts...${LOG_END}"
KEEP_TOKEN_ADDRESS=$KEEP_TOKEN_ADDRESS \
TBTC_TOKEN_ADDRESS=$TBTC_TOKEN_ADDRESS \
TBTC_DEPOSIT_TOKEN_ADDRESS=$TBTC_DEPOSIT_TOKEN_ADDRESS \
UNISWAP_ROUTER_V2_ADDRESS=$UNISWAP_ROUTER_V2_ADDRESS \
INITIAL_SWAP_STRATEGY=$INITIAL_SWAP_STRATEGY \
yarn deploy --reset --network $NETWORK

printf "${LOG_START}Creating links...${LOG_END}"
ln -sf "deployments/${NETWORK}" artifacts

printf "${DONE_START}Installation completed!${DONE_END}"
