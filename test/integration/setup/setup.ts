import {afterEach} from "vitest";
import {fetchLogs} from "@viem/anvil";
import {FORK_BLOCK_NUMBER, FORK_URL} from "./constants";
import {pool, testClient} from "./utils";

afterEach(async (context) => {
  await testClient.reset({
    jsonRpcUrl: FORK_URL,
    blockNumber: FORK_BLOCK_NUMBER,
  });

  context.onTestFailed(async () => {
    // If a test fails, you can fetch and print the logs of your anvil instance.
    const logs = await fetchLogs("http://localhost:8545", pool);
    // Only print the 20 most recent log messages.
    console.log(...logs.slice(-20));
  });
});