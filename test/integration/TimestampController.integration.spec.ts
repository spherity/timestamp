import { describe, it, expect, beforeAll } from "vitest";
import { TimestampController } from "../../src";
import {
  deployments,
  TRUSTED_HINT_REGISTRY_ABI,
} from "@spherity/trusted-hint-registry";
import { JsonRpcProvider, Contract, keccak256, JsonRpcSigner } from "ethers";
import { pool } from "./setup/utils";
import { TypedContract } from "ethers-abitype";

describe("TimestampController (Integration)", () => {
  let hintRegistry: TypedContract<typeof TRUSTED_HINT_REGISTRY_ABI>;
  let controller: TimestampController;
  let signer: JsonRpcSigner;
  let provider: JsonRpcProvider;
  let namespace: string;
  const list = keccak256(Buffer.from("list"));
  const leaves = [["data1"], ["data2"], ["data3"]];
  const encoding = ["string"];

  beforeAll(async () => {
    const hintRegistryAddress = deployments[0]!.registry;
    provider = new JsonRpcProvider(`http://127.0.0.1:8545/${pool}`);
    signer = await provider.getSigner();
    namespace = await signer.getAddress();

    hintRegistry = new Contract(
      hintRegistryAddress,
      TRUSTED_HINT_REGISTRY_ABI,
      signer
    ) as unknown as TypedContract<typeof TRUSTED_HINT_REGISTRY_ABI>;

    controller = new TimestampController(
      signer,
      { contractAddress: hintRegistryAddress, namespace, list },
      {
        leaves,
        encoding,
      }
    );
  });

  it("should anchor root hash", async () => {
    const tx = await controller.anchorRootHash();
    const hintValue = await hintRegistry.getHint(
      namespace,
      list,
      controller.getRootHash()
    );

    expect(tx).toBeDefined();
    expect(hintValue).toBe(
      "0x1000000000000000000000000000000000000000000000000000000000000000"
    );
  });

  it("should get and verify merkle proof", async () => {
    const currentBlockTime = await provider
      .getBlock("latest")
      .then((block) => block!.timestamp);
    await controller.anchorRootHash();
    const proof = controller.getMerkleProof(["data1"]);
    const verified = await controller.verifyProof(
      proof.leaf,
      proof.proof,
      new Date(currentBlockTime)
    );

    expect(proof).toBeDefined();
    expect(verified.verified).toBe(true);
  });

  it("should get and verify all merkle proofs", async () => {
    const currentBlockTime = await provider
      .getBlock("latest")
      .then((block) => block!.timestamp);
    await controller.anchorRootHash();
    const proofs = controller.getAllMerkleProofs();
    const verified = await Promise.all(
      proofs.map((proof) =>
        controller.verifyProof(
          proof.leaf,
          proof.proof,
          new Date(currentBlockTime)
        )
      )
    );

    expect(proofs).toBeDefined();
    expect(proofs.length).toBe(leaves.length);
    expect(verified.every((v) => v.verified)).toBe(true);
  });

  it("should fail to verify wrong proof", async () => {
    await controller.anchorRootHash();
    const proof = controller.getMerkleProof(["data1"]);
    const verified = await controller.verifyProof(
      ["data2"],
      proof.proof,
      new Date()
    );

    expect(proof).toBeDefined();
    expect(verified.verified).toBe(false);
  });

  it("should fail to verify proof for non-anchored root hash", async () => {
    const proof = controller.getMerkleProof(["data1"]);
    const verified = await controller.verifyProof(
      proof.leaf,
      proof.proof,
      new Date()
    );

    expect(proof).toBeDefined();
    expect(verified.verified).toBe(false);
  });

  it("should fail to get proof for non-existent leaf", () => {
    expect(() => controller.getMerkleProof(["non-existent-data"])).toThrow();
  });
});
