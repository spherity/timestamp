import { afterEach } from "vitest";
import { fetchLogs } from "@viem/anvil";
import { pool } from "./utils";

afterEach(async (context) => {
  // Turned this off for now because it's not working well with the ethers JSON-RPC provider
  // const provider = new JsonRpcProvider(`http://127.0.0.1:8545/${pool}`);
  // await provider.send('anvil_reset', [{
  //   forking: {
  //     jsonRpcUrl: FORK_URL,
  //     blockNumber: FORK_BLOCK_NUMBER
  //   }
  // }]);

  context.onTestFailed(async () => {
    const logs = await fetchLogs("http://localhost:8545", pool);
    console.log(...logs.slice(-20));
  });
});
