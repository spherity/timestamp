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
  leaf: any;
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

class TimestampController {
  private readonly provider: Provider;
  private readonly signer?: Signer;
  private readonly contract: TypedContract<typeof TRUSTED_HINT_REGISTRY_ABI>;
  private merkleTree?: StandardMerkleTree<any[]>;
  private rootHash?: string;
  private readonly contractOptions: ContractOptions;

  constructor(
    providerOrSigner: ProviderOrSigner,
    contractOptions: ContractOptions,
    treeOrRootOptions?: TreeOrRootOptions,
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
        "A provider must be available either through the signer or explicitly passed.",
      );
    }

    this.contract = new Contract(
      this.contractOptions.contractAddress,
      TRUSTED_HINT_REGISTRY_ABI,
      this.signer || this.provider,
    ) as unknown as TypedContract<typeof TRUSTED_HINT_REGISTRY_ABI>;

    this.initializeTreeOrRoot(treeOrRootOptions);
  }

  private initializeTreeOrRoot(treeOrRootOptions?: TreeOrRootOptions): void {
    if (!treeOrRootOptions) return;

    if ("leaves" in treeOrRootOptions) {
      this.createMerkleTree(treeOrRootOptions);
    } else if ("rootHash" in treeOrRootOptions) {
      this.rootHash = treeOrRootOptions.rootHash;
    }
  }

  private createMerkleTree(options: TreeOptions): void {
    try {
      this.merkleTree = StandardMerkleTree.of(
        options.leaves.map((leaf) => [leaf]),
        options.encoding,
      );
      this.rootHash = this.merkleTree.root;
    } catch (error) {
      throw new TimestampControllerError(
        `Failed to create merkle tree: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  getRootHash(): string {
    if (!this.rootHash) {
      throw new TimestampControllerError(
        "No root hash available. Initialize with leaves or provide a root hash.",
      );
    }
    return this.rootHash;
  }

  async anchorRootHash(): Promise<ContractTransactionResponse> {
    if (!this.rootHash) {
      throw new TimestampControllerError(
        "No merkle tree or root hash available to anchor.",
      );
    }

    const key = this.rootHash;
    const value =
      "0x1000000000000000000000000000000000000000000000000000000000000000";

    try {
      return await this.contract.setHint(
        this.contractOptions.namespace,
        this.contractOptions.list,
        key,
        value,
      );
    } catch (error) {
      throw new TimestampControllerError(
        `Failed to anchor root hash: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  getMerkleProof(value: [any]): MerkleProof {
    if (!this.merkleTree) {
      throw new TimestampControllerError(
        "No merkle tree available. Initialize with leaves to use this method.",
      );
    }
    return {
      leaf: value,
      proof: this.merkleTree.getProof(value),
    };
  }

  getAllMerkleProofs(): MerkleProof[] {
    if (!this.merkleTree) {
      throw new TimestampControllerError(
        "No merkle tree available. Initialize with leaves to use this method.",
      );
    }
    return Array.from(this.merkleTree.entries()).map(([index, [value]]) => {
      const proof = this.merkleTree?.getProof(index);
      if (!proof) {
        throw new TimestampControllerError(
          `Failed to get proof for leaf at index ${index}`,
        );
      }
      return { leaf: value, proof };
    });
  }

  async verifyProof(
    leaf: [any],
    proof: string[],
    leafCreationTime: Date,
    maxTimeDifference: number = 30 * 24 * 3600,
    leafEncoding: string[] = ["string"],
  ): Promise<{ verified: boolean; reason?: string }> {
    if (!this.rootHash) {
      throw new TimestampControllerError(
        "No root hash available. Initialize with leaves or provide a root hash.",
      );
    }

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
        maxTimeDifference,
      )
    ) {
      return { verified: false, reason: VerificationFailure.ROOT_HASH_EXPIRED };
    }

    const verified = StandardMerkleTree.verify(
      this.rootHash,
      leafEncoding,
      leaf,
      proof,
    );
    return verified
      ? { verified: true }
      : { verified: false, reason: VerificationFailure.MERKLE_PROOF_INVALID };
  }

  private async getHintValueChangedEvents() {
    const filter = this.contract.filters.HintValueChanged(
      this.contractOptions.namespace,
      this.contractOptions.list,
      this.rootHash,
    );
    return await this.contract.queryFilter(filter);
  }

  private async getRootHashBlockTimestamp(event: EventLog): Promise<number> {
    const block = await this.provider.getBlock(event.blockNumber);
    return block!.timestamp;
  }

  private isTimestampValid(
    rootHashTimestamp: number,
    leafCreationTime: Date,
    maxTimeDifference: number,
  ): boolean {
    const leafCreationTimestamp = Math.floor(leafCreationTime.getTime());
    const timeDifference = Math.abs(rootHashTimestamp - leafCreationTimestamp);
    return timeDifference <= maxTimeDifference;
  }
}

export { TimestampController, TimestampControllerError, VerificationFailure };
