import {
  Contract,
  Signer,
  Provider,
  ContractTransactionResponse,
} from "ethers";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { TRUSTED_HINT_REGISTRY_ABI } from "@spherity/trusted-hint-registry";
import { TypedContract } from "ethers-abitype";

export type ProviderOrSigner = Signer | Provider;

export interface MerkleProof {
  leaf: any;
  proof: string[];
}

export class TimestampControllerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimestampControllerError";
  }
}

type TreeOptions = {
  leaves: any[];
  encoding: string[];
};

type RootHashOption = {
  rootHash: string;
};

type TreeOrRootOptions = TreeOptions | RootHashOption | undefined;

export class TimestampController {
  private readonly provider: Provider;
  private readonly signer?: Signer;
  private readonly contract: TypedContract<typeof TRUSTED_HINT_REGISTRY_ABI>;
  private readonly merkleTree?: StandardMerkleTree<any[]>;
  private readonly rootHash?: string;

  /**
   * Creates a new instance of the TimestampController class.
   * @param providerOrSigner - The provider or signer to use for interacting with the contract.
   * @param contractAddress - The address of the contract to interact with.
   * @param treeOrRootOptions - Optional. Either TreeOptions to create a new tree, RootHashOption to use an existing root hash, or undefined.
   * @throws {TimestampControllerError} If invalid options are provided or if tree creation fails.
   */
  constructor(
    providerOrSigner: ProviderOrSigner,
    contractAddress: string,
    treeOrRootOptions?: TreeOrRootOptions,
  ) {
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
      contractAddress,
      TRUSTED_HINT_REGISTRY_ABI,
      this.signer || this.provider,
    ) as unknown as TypedContract<typeof TRUSTED_HINT_REGISTRY_ABI>;

    if (treeOrRootOptions) {
      if ("leaves" in treeOrRootOptions) {
        try {
          this.merkleTree = StandardMerkleTree.of(
            treeOrRootOptions.leaves.map((leaf) => [leaf]),
            treeOrRootOptions.encoding,
          );
          this.rootHash = this.merkleTree.root;
        } catch (error) {
          throw new TimestampControllerError(
            `Failed to create merkle tree: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      } else if ("rootHash" in treeOrRootOptions) {
        this.rootHash = treeOrRootOptions.rootHash;
      }
    }
  }

  /**
   * Get the root hash of the merkle tree.
   * @returns The root hash as a HexString.
   * @throws {TimestampControllerError} If no root hash is available.
   */
  getRootHash(): string {
    if (!this.rootHash) {
      throw new TimestampControllerError(
        "No root hash available. Initialize with leaves or provide a root hash.",
      );
    }
    return this.rootHash;
  }

  /**
   * Anchor the root hash to the contract.
   * @param namespace - The namespace to use for anchoring.
   * @param list - The list identifier.
   * @returns A promise that resolves to the transaction response.
   * @throws {TimestampControllerError} If the transaction fails or no root hash is available.
   */
  async anchorRootHash(
    namespace: string,
    list: string,
  ): Promise<ContractTransactionResponse> {
    if (!this.merkleTree && !this.rootHash) {
      throw new TimestampControllerError(
        "No merkle tree or root hash available to anchor.",
      );
    }

    const key = this.rootHash!;
    const value =
      "0x1000000000000000000000000000000000000000000000000000000000000000";

    try {
      const txResponse = await this.contract.setHint(
        namespace,
        list,
        key,
        value,
      );
      return txResponse;
    } catch (error) {
      throw new TimestampControllerError(
        `Failed to anchor root hash: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get the merkle proof for a specific value.
   * @param value - The value to get the proof for.
   * @returns An object containing the leaf value and the proof.
   * @throws {TimestampControllerError} If no merkle tree is available.
   */
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

  /**
   * Get all merkle proofs in the tree.
   * @returns An array of objects, each containing a leaf value and its corresponding proof.
   * @throws {TimestampControllerError} If no merkle tree is available.
   */
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
      return {
        leaf: value,
        proof: proof,
      };
    });
  }
  /**
   * Verify a merkle proof for a given value.
   * @param leaf - The leaf value.
   * @param proof - The merkle proof.
   * @returns True if the proof is valid, false otherwise.
   * @throws {TimestampControllerError} If no root hash is available.
   */
  verifyProof(
    leaf: [any],
    proof: string[],
    leafEncoding: string[] = ["string"],
  ): boolean {
    // TODO: Check root hash existence on chain
    if (!this.rootHash) {
      throw new TimestampControllerError(
        "No root hash available. Initialize with leaves or provide a root hash.",
      );
    }
    return StandardMerkleTree.verify(this.rootHash, leafEncoding, leaf, proof);
  }
}
