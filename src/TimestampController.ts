import {
  Contract,
  Signer,
  Provider,
  ContractTransactionResponse,
  EventLog,
} from "ethers";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { TRUSTED_HINT_REGISTRY_ABI } from "@spherity/trusted-hint-registry";
import { TypedContract } from "ethers-abitype";

type ProviderOrSigner = Signer | Provider;

interface MerkleProof {
  leaf: [[any]];
  proof: string[];
}

class TimestampControllerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimestampControllerError";
  }
}

const VerificationFailure = {
  ROOT_HASH_EXPIRED: "root_hash_expired",
  ROOT_HASH_NOT_FOUND: "root_hash_not_found",
  MERKLE_PROOF_INVALID: "merkle_proof_invalid",
} as const;

type TreeOptions = {
  leaves: any[];
  encoding: string[];
};

type RootHashOption = {
  rootHash: string;
};

type TreeOrRootOptions = TreeOptions | RootHashOption | undefined;

type ContractOptions = {
  contractAddress: string;
  namespace: string;
  list: string;
};

/**
 * TimestampController class for managing timestamps with merkle trees and the ERC-7506 trusted hint registry.
 * This class provides functionality to create, anchor, and verify timestamps using merkle trees.
 */
class TimestampController {
  private readonly provider: Provider;
  private readonly signer?: Signer;
  private readonly contract: TypedContract<typeof TRUSTED_HINT_REGISTRY_ABI>;
  private merkleTree?: StandardMerkleTree<any[]>;
  private rootHash?: string;
  private readonly contractOptions: ContractOptions;

  /**
   * Creates an instance of TimestampController.
   * @param providerOrSigner - The provider or signer to interact with the blockchain.
   * @param contractOptions - Options for the contract, including address, namespace, and list.
   * @param treeOrRootOptions - Optional. Either tree options (leaves and encoding) or a root hash.
   * @throws {TimestampControllerError} If no provider is available.
   */
  constructor(
    providerOrSigner: ProviderOrSigner,
    contractOptions: ContractOptions,
    treeOrRootOptions?: TreeOrRootOptions
  ) {
    this.contractOptions = contractOptions;

    if ("getAddress" in providerOrSigner) {
      this.signer = providerOrSigner as Signer;
      this.provider = this.signer.provider!;
    } else {
      this.provider = providerOrSigner as Provider;
    }

    if (!this.provider) {
      throw new TimestampControllerError(
        "A provider must be available either through the signer or explicitly passed."
      );
    }

    this.contract = new Contract(
      this.contractOptions.contractAddress,
      TRUSTED_HINT_REGISTRY_ABI,
      this.signer || this.provider
    ) as unknown as TypedContract<typeof TRUSTED_HINT_REGISTRY_ABI>;

    this.initializeTreeOrRoot(treeOrRootOptions);
  }

  /**
   * Initializes the merkle tree or sets the root hash based on the provided options.
   * @param treeOrRootOptions - Either tree options or a root hash.
   * @private
   */
  private initializeTreeOrRoot(treeOrRootOptions?: TreeOrRootOptions): void {
    if (!treeOrRootOptions) return;

    if ("leaves" in treeOrRootOptions) {
      this.createMerkleTree(treeOrRootOptions);
    } else if ("rootHash" in treeOrRootOptions) {
      this.rootHash = treeOrRootOptions.rootHash;
    }
  }

  /**
   * Creates a merkle tree from the provided leaves and encoding.
   * @param options - Tree options containing leaves and encoding.
   * @throws {TimestampControllerError} If merkle tree creation fails.
   * @private
   */
  private createMerkleTree(options: TreeOptions): void {
    try {
      this.merkleTree = StandardMerkleTree.of(options.leaves, options.encoding);
      this.rootHash = this.merkleTree.root;
    } catch (error) {
      throw new TimestampControllerError(
        `Failed to create merkle tree: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Gets the current root hash.
   * @returns The current root hash.
   * @throws {TimestampControllerError} If no root hash is available.
   */
  getRootHash(): string {
    if (!this.rootHash) {
      throw new TimestampControllerError(
        "No root hash available. Initialize with leaves or provide a root hash."
      );
    }
    return this.rootHash;
  }

  /**
   * Anchors the current root hash to the trusted hint registry.
   * @returns A promise that resolves to the contract transaction response.
   * @throws {TimestampControllerError} If no root hash is available or if anchoring fails.
   */
  async anchorRootHash(): Promise<ContractTransactionResponse> {
    const key = this.getRootHash();
    const value =
      "0x1000000000000000000000000000000000000000000000000000000000000000";

    try {
      return await this.contract.setHint(
        this.contractOptions.namespace,
        this.contractOptions.list,
        key,
        value
      );
    } catch (error) {
      throw new TimestampControllerError(
        `Failed to anchor root hash: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Gets the merkle proof for a given leaf value.
   * @param leaf - The leaf value to get the proof for.
   * @returns The merkle proof for the given leaf.
   * @throws {TimestampControllerError} If no merkle tree is available.
   */
  getMerkleProof(leaf: [any]): MerkleProof {
    if (!this.merkleTree) {
      throw new TimestampControllerError(
        "No merkle tree available to generate proof"
      );
    }
    return {
      leaf,
      proof: this.merkleTree.getProof(leaf),
    };
  }

  /**
   * Gets merkle proofs for all leaves in the tree.
   * @returns An array of merkle proofs for all leaves.
   * @throws {TimestampControllerError} If no merkle tree is available or if getting a proof fails.
   */
  getAllMerkleProofs(): MerkleProof[] {
    if (!this.merkleTree) {
      throw new TimestampControllerError(
        "No merkle tree available to generate proofs"
      );
    }
    return Array.from(this.merkleTree.entries()).map(([index, [value]]) => {
      const proof = this.merkleTree?.getProof(index);
      if (!proof) {
        throw new TimestampControllerError(
          `Failed to get proof for leaf at index ${index}`
        );
      }
      return { leaf: [value], proof };
    });
  }

  /**
   * Verifies a merkle proof for a given leaf.
   * @param leaf - The leaf to verify.
   * @param proof - The merkle proof for the leaf.
   * @param leafCreationTime - The creation time of the leaf.
   * @param maxTimeDifference - Optional. The maximum allowed time difference in seconds (default: 30 days).
   * @param leafEncoding - Optional. The encoding of the leaf (default: ["string"]).
   * @returns An object indicating whether the proof is verified and the reason if not.
   * @throws {TimestampControllerError} If no root hash is available.
   */
  async verifyProof(
    leaf: [any],
    proof: string[],
    leafCreationTime: Date,
    maxTimeDifference: number,
    leafEncoding: string[] = ["string"]
  ): Promise<{ verified: boolean; reason?: string }> {
    const rootHash = this.getRootHash();

    const events = await this.getHintValueChangedEvents();
    if (events.length === 0) {
      return {
        verified: false,
        reason: VerificationFailure.ROOT_HASH_NOT_FOUND,
      };
    }

    const latestEvent = events[events.length - 1] as EventLog;
    if (
      latestEvent.args.value !==
      "0x1000000000000000000000000000000000000000000000000000000000000000"
    ) {
      return {
        verified: false,
        reason: VerificationFailure.ROOT_HASH_NOT_FOUND,
      };
    }

    const rootHashTimestamp = await this.getRootHashBlockTimestamp(latestEvent);
    if (
      !this.isTimestampValid(
        rootHashTimestamp,
        leafCreationTime,
        maxTimeDifference
      )
    ) {
      return { verified: false, reason: VerificationFailure.ROOT_HASH_EXPIRED };
    }

    const verified = StandardMerkleTree.verify(
      rootHash,
      leafEncoding,
      leaf,
      proof
    );
    return verified
      ? { verified: true }
      : { verified: false, reason: VerificationFailure.MERKLE_PROOF_INVALID };
  }

  /**
   * Gets the HintValueChanged events for the current root hash.
   * @returns A promise that resolves to an array of events.
   * @private
   */
  private async getHintValueChangedEvents() {
    const filter = this.contract.filters.HintValueChanged(
      this.contractOptions.namespace,
      this.contractOptions.list,
      this.rootHash
    );
    return await this.contract.queryFilter(filter);
  }

  /**
   * Gets the block timestamp for a given event.
   * @param event - The event to get the timestamp for.
   * @returns A promise that resolves to the block timestamp.
   * @private
   * @throws {TimestampControllerError} If no timestamp can be retrieved
   */
  private async getRootHashBlockTimestamp(event: EventLog): Promise<number> {
    const block = await this.provider.getBlock(event.blockNumber);
    if (!block?.timestamp) {
      throw new TimestampControllerError(
        `Failed to get block timestamp for event transaction ${event.transactionHash}`
      );
    }
    return block.timestamp;
  }

  /**
   * Checks if the timestamp is valid based on the root hash timestamp and leaf creation time.
   * @param rootHashTimestamp - The timestamp of the root hash.
   * @param leafCreationTime - The creation time of the leaf.
   * @param maxTimeDifference - The maximum allowed time difference in seconds.
   * @returns True if the timestamp is valid, false otherwise.
   * @private
   */
  private isTimestampValid(
    rootHashTimestamp: number,
    leafCreationTime: Date,
    maxTimeDifference: number
  ): boolean {
    const leafCreationTimestamp = Math.floor(leafCreationTime.getTime());
    const timeDifference = Math.abs(rootHashTimestamp - leafCreationTimestamp);
    return timeDifference <= maxTimeDifference;
  }
}

export { TimestampController, TimestampControllerError, VerificationFailure };
