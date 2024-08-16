import {
  type Chain, createPublicClient,
  createTestClient,
  createWalletClient,
  http,
} from "viem";
import {sepolia} from "viem/chains";
import {ALICE, BOB, CARO} from "./constants";

/**
 * The id of the current test worker.
 *
 * This is used by the anvil proxy to route requests to the correct anvil instance.
 */
export const pool = Number(process.env.VITEST_POOL_ID ?? 1);
export const anvil = {
  ...sepolia, // We are using a mainnet fork for testing.
  id: 11155111, // We configured our anvil instance to use `123` as the chain id (see `globalSetup.ts`);
  rpcUrls: {
    // These rpc urls are automatically used in the transports.
    default: {
      // Note how we append the worker id to the local rpc urls.
      http: [`http://127.0.0.1:8545/${pool}`],
      webSocket: [`ws://127.0.0.1:8545/${pool}`],
    },
    public: {
      // Note how we append the worker id to the local rpc urls.
      http: [`http://127.0.0.1:8545/${pool}`],
      webSocket: [`ws://127.0.0.1:8545/${pool}`],
    },
  },
} as const satisfies Chain;

export const testClient = createTestClient({
  chain: anvil,
  mode: "anvil",
  transport: http(),
});

export const publicClient = createPublicClient({
  chain: anvil,
  transport: http(),
});

export const aliceWalletClient = createWalletClient({
  account: ALICE,
  chain: anvil,
  transport: http(),
});

export const bobWalletClient = createWalletClient({
  account: BOB,
  chain: anvil,
  transport: http(),
});

export const caroWalletClient = createWalletClient({
  account: CARO,
  chain: anvil,
  transport: http(),
});