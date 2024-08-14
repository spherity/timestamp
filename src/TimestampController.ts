import { Contract, Signer, Provider } from 'ethers';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { TRUSTED_HINT_REGISTRY_ABI } from '@spherity/trusted-hint-registry';

export type ProviderOrSigner = Signer | Provider;

export class TimestampController {
  private provider: Provider;
  private signer?: Signer;
  private contract: Contract;
  private merkleTree?: StandardMerkleTree<string[]>;
  private root?: string;

  /**
   * Creates a new instance of the TimestampController class.
   * @param providerOrSigner - The provider or signer to use for interacting with the contract.
   * @param contractAddress - The address of the contract to interact with.
   * @param data - The data to be included in the merkle tree.
   * @param dataEncoding - The encoding of the data.
   */
  constructor(providerOrSigner: ProviderOrSigner, contractAddress: string, data: any[], dataEncoding: string[]) {
    if ('getAddress' in providerOrSigner) {
      this.signer = providerOrSigner as Signer;
      this.provider = this.signer.provider!;
    } else {
      this.provider = providerOrSigner as Provider;
    }

    if (!this.provider) {
      throw new Error('A provider must be available either through the signer or explicitly passed.');
    }

    this.contract = new Contract(
      contractAddress,
      TRUSTED_HINT_REGISTRY_ABI,
      this.signer || this.provider
    );

    this.merkleTree = StandardMerkleTree.of(data.map(x => [x]), dataEncoding);
    this.root = this.merkleTree.root;
  }
}