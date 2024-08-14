import { TimestampController } from '../src/TimestampController';
import { Contract, Signer, Provider } from 'ethers';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { vi, describe, it, beforeEach } from 'vitest';

vi.mock('ethers');
vi.mock('@openzeppelin/merkle-tree');
vi.mock('@spherity/trusted-hint-registry', () => ({
  TRUSTED_HINT_REGISTRY_ABI: ['mockedABI'],
}));

describe('TimestampController', () => {
  let mockSigner: Signer;
  let mockProvider: Provider;
  let mockContract: Contract;

  beforeEach(() => {
    mockSigner = {
      getAddress: vi.fn(),
      provider: {} as Provider,
    } as unknown as Signer;

    mockProvider = {} as Provider;

    mockContract = {} as Contract;

    vi.mocked(Contract).mockImplementation(() => mockContract);
    vi.mocked(StandardMerkleTree.of).mockReturnValue({
      root: 'mockedRoot',
    } as unknown as StandardMerkleTree<string[]>);
  });

  it('should initialize with a signer', () => {
    const controller = new TimestampController(
      mockSigner,
      '0x0000000000000000000000000000000000000000',
      ['data1', 'data2'],
      ['string']
    );

    expect(controller['signer']).toBe(mockSigner);
    expect(controller['provider']).toBe(mockSigner.provider);
    expect(controller['contract']).toBe(mockContract);
    expect(controller['root']).toBe('mockedRoot');
  });

  it('should initialize with a provider', () => {
    const controller = new TimestampController(
      mockProvider,
      '0x0000000000000000000000000000000000000000',
      ['data1', 'data2'],
      ['string']
    );

    expect(controller['signer']).toBeUndefined();
    expect(controller['provider']).toBe(mockProvider);
    expect(controller['contract']).toBe(mockContract);
    expect(controller['root']).toBe('mockedRoot');
  });

  it('should throw an error if no provider is available', () => {
    const mockSignerWithoutProvider = { getAddress: vi.fn() } as Signer;

    expect(() =>
      new TimestampController(
        mockSignerWithoutProvider,
        '0x0000000000000000000000000000000000000000',
        ['data1', 'data2'],
        ['string']
      )
    ).toThrow('A provider must be available either through the signer or explicitly passed.');
  });

  it('should create a merkle tree with the provided data', () => {
    const data = ['data1', 'data2'];
    const encoding = ['encoding'];

    new TimestampController(mockProvider, 'contractAddress', data, encoding);

    expect(StandardMerkleTree.of).toHaveBeenCalledWith(
      data.map(x => [x]),
      encoding
    );
  });

  it('should create a contract with the correct parameters', () => {
    const contractAddress = 'contractAddress';

    new TimestampController(mockSigner, contractAddress, ['data'], ['encoding']);

    expect(Contract).toHaveBeenCalledWith(
      contractAddress,
      ['mockedABI'],
      mockSigner
    );
  });
});