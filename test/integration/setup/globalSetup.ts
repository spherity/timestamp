import { startProxy } from "@viem/anvil";
import { FORK_BLOCK_NUMBER, FORK_URL } from "./utils";

export default async function () {
  return await startProxy({
    port: 8545,
    host: "::",
    options: {
      chainId: 11155111,
      forkUrl: FORK_URL,
      forkBlockNumber: FORK_BLOCK_NUMBER,
    },
  });
}
