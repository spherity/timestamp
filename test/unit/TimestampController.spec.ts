import {
  TimestampController,
  TimestampControllerError,
  VerificationFailure,
} from "../../src/TimestampController";
import {
  Contract,
  Signer,
  Provider,
  ContractTransactionResponse,
  EventLog,
} from "ethers";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("ethers");
vi.mock("@openzeppelin/merkle-tree");
vi.mock("@spherity/trusted-hint-registry", () => ({
  TRUSTED_HINT_REGISTRY_ABI: ["mockedABI"],
}));

const CURRENT_BLOCK_TIMESTAMP = 100000;

describe("TimestampController", () => {
  let mockSigner: Signer;
  let mockProvider: Provider;
  let mockContract: Contract;

  beforeEach(() => {
    mockSigner = {
      getAddress: vi.fn(),
      provider: {} as Provider,
    } as unknown as Signer;

    mockProvider = {
      getBlock: vi
        .fn()
        .mockResolvedValue({ timestamp: CURRENT_BLOCK_TIMESTAMP }),
    } as unknown as Provider;

    mockContract = {
      setHint: vi.fn(),
      filters: {
        HintValueChanged: vi.fn().mockReturnValue({}),
      },
      queryFilter: vi.fn(),
    } as unknown as Contract;

    vi.mocked(Contract).mockImplementation(() => mockContract);
    vi.mocked(StandardMerkleTree.of).mockReturnValue({
      root: "0x1234567890123456789012345678901234567890123456789012345678901234",
      getProof: vi.fn().mockReturnValue(["proof1", "proof2"]),
      entries: vi.fn().mockReturnValue([
        [0, ["leaf1"]],
        [1, ["leaf2"]],
      ]),
    } as unknown as StandardMerkleTree<any[]>);
  });

  it("should initialize with a signer and tree options", () => {
    const controller = new TimestampController(
      mockSigner,
      {
        contractAddress: "0x0000000000000000000000000000000000000000",
        namespace: "testNamespace",
        list: "testList",
      },
      { leaves: [["data1"], ["data2"]], encoding: ["string"] }
    );

    expect(controller["signer"]).toBe(mockSigner);
    expect(controller["provider"]).toBe(mockSigner.provider);
    expect(controller["contract"]).toBe(mockContract);
    expect(controller["rootHash"]).toBe(
      "0x1234567890123456789012345678901234567890123456789012345678901234"
    );
  });

  it("should initialize with a provider and root hash", () => {
    const rootHash =
      "0x1234567890123456789012345678901234567890123456789012345678901234";
    const controller = new TimestampController(
      mockProvider,
      {
        contractAddress: "0x0000000000000000000000000000000000000000",
        namespace: "testNamespace",
        list: "testList",
      },
      { rootHash }
    );

    expect(controller["signer"]).toBeUndefined();
    expect(controller["provider"]).toBe(mockProvider);
    expect(controller["contract"]).toBe(mockContract);
    expect(controller["rootHash"]).toBe(rootHash);
  });

  it("should throw an error if no provider is available", () => {
    const mockSignerWithoutProvider = {
      getAddress: vi.fn(),
    } as unknown as Signer;

    expect(
      () =>
        new TimestampController(mockSignerWithoutProvider, {
          contractAddress: "0x0000000000000000000000000000000000000000",
          namespace: "testNamespace",
          list: "testList",
        })
    ).toThrow(
      "A provider must be available either through the signer or explicitly passed."
    );
  });

  it("should create a merkle tree with the provided data", () => {
    new TimestampController(
      mockProvider,
      {
        contractAddress: "0x0000000000000000000000000000000000000000",
        namespace: "testNamespace",
        list: "testList",
      },
      {
        leaves: [["data1"], ["data2"]],
        encoding: ["string"],
      }
    );

    expect(StandardMerkleTree.of).toHaveBeenCalledWith(
      [["data1"], ["data2"]],
      ["string"]
    );
  });

  it("should create a merkle tree with the provided data with multiple encodes", () => {
    new TimestampController(
      mockProvider,
      {
        contractAddress: "0x0000000000000000000000000000000000000000",
        namespace: "testNamespace",
        list: "testList",
      },
      {
        leaves: [
          ["0x1111111111111111111111111111111111111111", "5000000000000000000"],
          ["0x2222222222222222222222222222222222222222", "2500000000000000000"],
        ],
        encoding: ["address", "uint256"],
      }
    );

    expect(StandardMerkleTree.of).toHaveBeenCalledWith(
      [
        ["0x1111111111111111111111111111111111111111", "5000000000000000000"],
        ["0x2222222222222222222222222222222222222222", "2500000000000000000"],
      ],
      ["address", "uint256"]
    );
  });

  it("should get root hash", () => {
    const controller = new TimestampController(
      mockProvider,
      {
        contractAddress: "0x0000000000000000000000000000000000000000",
        namespace: "testNamespace",
        list: "testList",
      },
      { leaves: [["data1"], ["data2"]], encoding: ["string"] }
    );

    expect(controller.getRootHash()).toBe(
      "0x1234567890123456789012345678901234567890123456789012345678901234"
    );
  });

  it("should throw error when getting root hash if not available", () => {
    const controller = new TimestampController(mockProvider, {
      contractAddress: "0x0000000000000000000000000000000000000000",
      namespace: "testNamespace",
      list: "testList",
    });

    expect(() => controller.getRootHash()).toThrow(TimestampControllerError);
  });

  it("should anchor root hash", async () => {
    const controller = new TimestampController(
      mockSigner,
      {
        contractAddress: "0x0000000000000000000000000000000000000000",
        namespace: "testNamespace",
        list: "testList",
      },
      { leaves: [["data1"], ["data2"]], encoding: ["string"] }
    );

    await controller.anchorRootHash();

    expect(mockContract.setHint).toHaveBeenCalledWith(
      "testNamespace",
      "testList",
      "0x1234567890123456789012345678901234567890123456789012345678901234",
      "0x1000000000000000000000000000000000000000000000000000000000000000"
    );
  });

  it("should get merkle proof", () => {
    const controller = new TimestampController(
      mockProvider,
      {
        contractAddress: "0x0000000000000000000000000000000000000000",
        namespace: "testNamespace",
        list: "testList",
      },
      { leaves: [["data1"], ["data2"]], encoding: ["string"] }
    );

    const proof = controller.getMerkleProof(["data1"]);

    expect(proof).toEqual({
      leaf: ["data1"],
      proof: ["proof1", "proof2"],
    });
  });

  it("should get all merkle proofs", () => {
    const controller = new TimestampController(
      mockProvider,
      {
        contractAddress: "0x0000000000000000000000000000000000000000",
        namespace: "testNamespace",
        list: "testList",
      },
      { leaves: [["data1"], ["data2"]], encoding: ["string"] }
    );

    const proofs = controller.getAllMerkleProofs();

    expect(proofs).toEqual([
      { leaf: ["leaf1"], proof: ["proof1", "proof2"] },
      { leaf: ["leaf2"], proof: ["proof1", "proof2"] },
    ]);
  });

  it("should verify proof", async () => {
    vi.mocked(StandardMerkleTree.verify).mockReturnValue(true);
    vi.mocked(mockContract.queryFilter).mockResolvedValue([
      {
        args: {
          value:
            "0x1000000000000000000000000000000000000000000000000000000000000000",
        },
      },
    ] as unknown as EventLog[]);

    const controller = new TimestampController(
      mockProvider,
      {
        contractAddress: "0x0000000000000000000000000000000000000000",
        namespace: "testNamespace",
        list: "testList",
      },
      {
        rootHash:
          "0x1234567890123456789012345678901234567890123456789012345678901234",
      }
    );
    const leafCreationTime = new Date(CURRENT_BLOCK_TIMESTAMP);
    const maxTimeDifference = 30 * 24 * 3600;

    const result = await controller.verifyProof(
      ["leaf1"],
      ["proof1", "proof2"],
      leafCreationTime,
      maxTimeDifference
    );

    expect(result).toEqual({ verified: true });
    expect(StandardMerkleTree.verify).toHaveBeenCalledWith(
      "0x1234567890123456789012345678901234567890123456789012345678901234",
      ["string"],
      ["leaf1"],
      ["proof1", "proof2"]
    );
  });

  it("should return false when root hash is not found", async () => {
    vi.mocked(mockContract.queryFilter).mockResolvedValue([]);

    const controller = new TimestampController(
      mockProvider,
      {
        contractAddress: "0x0000000000000000000000000000000000000000",
        namespace: "testNamespace",
        list: "testList",
      },
      {
        rootHash:
          "0x1234567890123456789012345678901234567890123456789012345678901234",
      }
    );

    const result = await controller.verifyProof(
      ["leaf1"],
      ["proof1", "proof2"],
      new Date(),
      30 * 24 * 3600
    );

    expect(result).toEqual({
      verified: false,
      reason: VerificationFailure.ROOT_HASH_NOT_FOUND,
    });
  });

  it("should return false when root hash is expired", async () => {
    vi.mocked(mockContract.queryFilter).mockResolvedValue([
      {
        args: {
          value:
            "0x1000000000000000000000000000000000000000000000000000000000000000",
        },
      },
    ] as unknown as EventLog[]);
    vi.mocked(mockProvider.getBlock).mockResolvedValue({
      timestamp: 1000,
    } as any);

    const controller = new TimestampController(
      mockProvider,
      {
        contractAddress: "0x0000000000000000000000000000000000000000",
        namespace: "testNamespace",
        list: "testList",
      },
      {
        rootHash:
          "0x1234567890123456789012345678901234567890123456789012345678901234",
      }
    );

    const result = await controller.verifyProof(
      ["leaf1"],
      ["proof1", "proof2"],
      new Date(0),
      1 // maxTimeDifference of 1 second
    );

    expect(result).toEqual({
      verified: false,
      reason: VerificationFailure.ROOT_HASH_EXPIRED,
    });
  });

  it("should throw an error when creating merkle tree fails", () => {
    vi.mocked(StandardMerkleTree.of).mockImplementationOnce(() => {
      throw new Error("Merkle tree creation failed");
    });

    expect(
      () =>
        new TimestampController(
          mockProvider,
          {
            contractAddress: "0x0000000000000000000000000000000000000000",
            namespace: "testNamespace",
            list: "testList",
          },
          { leaves: [["data1"], ["data2"]], encoding: ["string"] }
        )
    ).toThrow(TimestampControllerError);
  });

  it("should throw an error when trying to anchor without both merkle tree and root hash", async () => {
    const controller = new TimestampController(mockSigner, {
      contractAddress: "0x0000000000000000000000000000000000000000",
      namespace: "testNamespace",
      list: "testList",
    });

    await expect(controller.anchorRootHash()).rejects.toThrow(
      TimestampControllerError
    );

    await expect(controller.anchorRootHash()).rejects.toThrow(
      "No root hash available. Initialize with leaves or provide a root hash."
    );
  });

  it("should not throw an error when anchoring with only a root hash", async () => {
    const controller = new TimestampController(
      mockSigner,
      {
        contractAddress: "0x0000000000000000000000000000000000000000",
        namespace: "testNamespace",
        list: "testList",
      },
      {
        rootHash:
          "0x1234567890123456789012345678901234567890123456789012345678901234",
      }
    );

    vi.mocked(mockContract.setHint!).mockResolvedValueOnce(
      {} as ContractTransactionResponse
    );

    await expect(controller.anchorRootHash()).resolves.not.toThrow();
  });

  it("should throw an error when anchoring root hash fails", async () => {
    vi.mocked(mockContract.setHint!).mockRejectedValueOnce(
      new Error("Transaction failed")
    );

    const controller = new TimestampController(
      mockSigner,
      {
        contractAddress: "0x0000000000000000000000000000000000000000",
        namespace: "testNamespace",
        list: "testList",
      },
      { leaves: [["data1"], ["data2"]], encoding: ["string"] }
    );

    await expect(controller.anchorRootHash()).rejects.toThrow(
      TimestampControllerError
    );
  });

  it("should throw an error when getting merkle proof without merkle tree", () => {
    const controller = new TimestampController(
      mockProvider,
      {
        contractAddress: "0x0000000000000000000000000000000000000000",
        namespace: "testNamespace",
        list: "testList",
      },
      {
        rootHash:
          "0x1234567890123456789012345678901234567890123456789012345678901234",
      }
    );

    expect(() => controller.getMerkleProof(["data1"])).toThrow(
      TimestampControllerError
    );
  });

  it("should throw an error when getting all merkle proofs without merkle tree", () => {
    const controller = new TimestampController(
      mockProvider,
      {
        contractAddress: "0x0000000000000000000000000000000000000000",
        namespace: "testNamespace",
        list: "testList",
      },
      {
        rootHash:
          "0x1234567890123456789012345678901234567890123456789012345678901234",
      }
    );

    expect(() => controller.getAllMerkleProofs()).toThrow(
      TimestampControllerError
    );
  });

  it("should throw an error when verifying proof without root hash", async () => {
    const controller = new TimestampController(mockProvider, {
      contractAddress: "0x0000000000000000000000000000000000000000",
      namespace: "testNamespace",
      list: "testList",
    });

    await expect(
      controller.verifyProof(
        ["leaf1"],
        ["proof1", "proof2"],
        new Date(),
        30 * 24 * 3600
      )
    ).rejects.toThrow(TimestampControllerError);
  });

  it("should throw an error when failing to get proof for a specific leaf index", () => {
    vi.mocked(StandardMerkleTree.of).mockReturnValueOnce({
      root: "0x1234567890123456789012345678901234567890123456789012345678901234",
      getProof: vi.fn().mockImplementation((index) => {
        if (index === 1) return undefined;
        return ["proof1", "proof2"];
      }),
      entries: vi.fn().mockReturnValue([
        [0, ["leaf1"]],
        [1, ["leaf2"]],
      ]),
    } as unknown as StandardMerkleTree<any[]>);

    const controller = new TimestampController(
      mockProvider,
      {
        contractAddress: "0x0000000000000000000000000000000000000000",
        namespace: "testNamespace",
        list: "testList",
      },
      { leaves: [["data1"], ["data2"]], encoding: ["string"] }
    );

    expect(() => controller.getAllMerkleProofs()).toThrow(
      TimestampControllerError
    );
    expect(() => controller.getAllMerkleProofs()).toThrow(
      "Failed to get proof for leaf at index 1"
    );
  });

  it("should return false when merkle proof is invalid", async () => {
    vi.mocked(StandardMerkleTree.verify).mockReturnValue(false);
    vi.mocked(mockContract.queryFilter).mockResolvedValue([
      {
        args: {
          value:
            "0x1000000000000000000000000000000000000000000000000000000000000000",
        },
      },
    ] as unknown as EventLog[]);

    const controller = new TimestampController(
      mockProvider,
      {
        contractAddress: "0x0000000000000000000000000000000000000000",
        namespace: "testNamespace",
        list: "testList",
      },
      {
        rootHash:
          "0x1234567890123456789012345678901234567890123456789012345678901234",
      }
    );
    const leafCreationTime = new Date(CURRENT_BLOCK_TIMESTAMP);
    const maxTimeDifference = 30 * 24 * 3600;

    const result = await controller.verifyProof(
      ["leaf1"],
      ["proof1", "proof2"],
      leafCreationTime,
      maxTimeDifference
    );

    expect(result).toEqual({
      verified: false,
      reason: VerificationFailure.MERKLE_PROOF_INVALID,
    });
  });

  it("should use custom leafEncoding when provided", async () => {
    vi.mocked(StandardMerkleTree.verify).mockReturnValue(true);
    vi.mocked(mockContract.queryFilter).mockResolvedValue([
      {
        args: {
          value:
            "0x1000000000000000000000000000000000000000000000000000000000000000",
        },
      },
    ] as unknown as EventLog[]);

    const controller = new TimestampController(
      mockProvider,
      {
        contractAddress: "0x0000000000000000000000000000000000000000",
        namespace: "testNamespace",
        list: "testList",
      },
      {
        rootHash:
          "0x1234567890123456789012345678901234567890123456789012345678901234",
      }
    );

    const verified = await controller.verifyProof(
      ["leaf1"],
      ["proof1", "proof2"],
      new Date(CURRENT_BLOCK_TIMESTAMP),
      30 * 24 * 3600,
      ["bytes32"]
    );

    expect(StandardMerkleTree.verify).toHaveBeenCalledWith(
      "0x1234567890123456789012345678901234567890123456789012345678901234",
      ["bytes32"],
      ["leaf1"],
      ["proof1", "proof2"]
    );
  });

  it("should throw an error when block timestamp is not available", async () => {
    vi.mocked(mockContract.queryFilter).mockResolvedValue([
      {
        args: {
          value:
            "0x1000000000000000000000000000000000000000000000000000000000000000",
        },
        blockNumber: 12345,
        transactionHash: "0xabcdef1234567890",
      },
    ] as unknown as EventLog[]);

    vi.mocked(mockProvider.getBlock).mockResolvedValue({
      timestamp: undefined,
    } as any);

    const controller = new TimestampController(
      mockProvider,
      {
        contractAddress: "0x0000000000000000000000000000000000000000",
        namespace: "testNamespace",
        list: "testList",
      },
      {
        rootHash:
          "0x1234567890123456789012345678901234567890123456789012345678901234",
      }
    );

    await expect(
      controller.verifyProof(
        ["leaf1"],
        ["proof1", "proof2"],
        new Date(),
        30 * 24 * 3600
      )
    ).rejects.toThrow(TimestampControllerError);

    await expect(
      controller.verifyProof(
        ["leaf1"],
        ["proof1", "proof2"],
        new Date(),
        30 * 24 * 3600
      )
    ).rejects.toThrow(
      "Failed to get block timestamp for event transaction 0xabcdef1234567890"
    );
  });
});
