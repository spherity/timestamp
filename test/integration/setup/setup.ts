import { afterEach } from "vitest";
import { fetchLogs } from "@viem/anvil";
import { FORK_BLOCK_NUMBER, FORK_URL, pool } from "./utils";
import { JsonRpcProvider } from "ethers";

afterEach(async (context) => {
  const provider = new JsonRpcProvider(`http://127.0.0.1:8545/${pool}`);
  await provider.send("anvil_reset", [
    {
      forking: {
        jsonRpcUrl: FORK_URL,
        blockNumber: FORK_BLOCK_NUMBER,
      },
    },
  ]);

  context.onTestFailed(async () => {
    const logs = await fetchLogs("http://127.0.0.1:8545", pool);
    console.log(...logs.slice(-20));
  });
});
