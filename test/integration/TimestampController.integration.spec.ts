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
  const leaves = [
    "data1",
    "data2",
    "data3",
    "data4",
    "data5",
    "data6",
    "data7",
    "data8",
    "data9",
    "data10",
    "data11",
  ];
  const encoding = ["string"];

  beforeAll(async () => {
    const hintRegistryAddress = deployments[0].registry;
    const provider = new JsonRpcProvider(`http://127.0.0.1:8545/${pool}`);
    signer = await provider.getSigner();

    hintRegistry = new Contract(
      hintRegistryAddress,
      TRUSTED_HINT_REGISTRY_ABI,
      signer,
    ) as unknown as TypedContract<typeof TRUSTED_HINT_REGISTRY_ABI>;
    controller = new TimestampController(signer, hintRegistryAddress, {
      leaves,
      encoding,
    });
  });

  it("should anchor root hash", async () => {
    const list = keccak256(Buffer.from("list"));

    const tx = await controller.anchorRootHash(signer.address, list);
    const hintValue = await hintRegistry.getHint(
      signer.address,
      list,
      controller.getRootHash(),
    );

    expect(tx).toBeDefined();
    expect(hintValue).toBe(
      "0x1000000000000000000000000000000000000000000000000000000000000000",
    );
  });

  it("should get and verify merkle proof", async () => {
    const proof = controller.getMerkleProof(["data1"]);
    const verified = controller.verifyProof(["data1"], proof.proof);

    expect(proof).toBeDefined();
    expect(verified).toBe(true);
  });

  it("should get and verify all merkle proofs", async () => {
    const proofs = controller.getAllMerkleProofs();
    const verified = proofs.every((proof) =>
      controller.verifyProof([proof.leaf], proof.proof),
    );

    expect(proofs).toBeDefined();
    expect(proofs.length).toBe(leaves.length);
    expect(verified).toBe(true);
  });

  it("should fail to verify wrong proof", async () => {
    const proof = controller.getMerkleProof(["data1"]);
    const verified = controller.verifyProof(["data2"], proof.proof);

    expect(proof).toBeDefined();
    expect(verified).toBe(false);
  });
});
