#!/bin/bash
set -euo pipefail

LOG_START='\n\e[1;36m'  # new line + bold + cyan
LOG_END='\n\e[0m'       # new line + reset
DONE_START='\n\e[1;32m' # new line + bold + green
DONE_END='\n\n\e[0m'    # new line + reset

# Defaults, can be overwritten by env variables/input parameters
NETWORK_DEFAULT="development"
INITIAL_SWAP_STRATEGY=${INITIAL_SWAP_STRATEGY:-""}

ROOT_DIR="$(realpath "$(dirname $0)"/../)"

help() {
  echo -e "\nUsage: ENV_VAR(S) $0" \
    "--network <network>"

  echo -e "\nEnvironment variables:\n"
  echo -e "\tINITIAL_SWAP_STRATEGY: Allows setting the initial swap strategy which will be used by the risk manager." \
    "This should be the name of one of the ISignerBondsSwapStrategy implementations."

  echo -e "\nCommand line arguments:\n"
  echo -e "\t--network: Ethereum network." \
    "Available networks and settings are specified in 'hardhat.config.ts'"
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
while getopts "n:h" opt; do
  case "$opt" in
    n) network="$OPTARG" ;;
    h) help ;;
    ?) help ;; # Print help in case parameter is non-existent
  esac
done
shift $(expr $OPTIND - 1) # remove options from positional parameters

# Overwrite default properties
NETWORK=${network:-$NETWORK_DEFAULT}

printf "${LOG_START}Network: $NETWORK${LOG_END}"

# Run script.
printf "${LOG_START}Starting installation...${LOG_END}"

cd "$ROOT_DIR"

printf "${LOG_START}Installing dependencies...${LOG_END}"
yarn install

printf "${LOG_START}Linking local dependencies...${LOG_END}"
yarn link @keep-network/keep-core @keep-network/tbtc

printf "${LOG_START}Migrating contracts...${LOG_END}"
INITIAL_SWAP_STRATEGY=$INITIAL_SWAP_STRATEGY \
  yarn deploy --reset --network $NETWORK

printf "${LOG_START}Preparing deployment artifacts...${LOG_END}"
./prepare-artifacts.sh --network $NETWORK

printf "${DONE_START}Installation completed!${DONE_END}"
