import { TimestampController, TimestampControllerError, HexString } from '../../src/TimestampController';
import {Contract, Signer, Provider, ContractTransactionResponse} from 'ethers';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { vi, describe, it, expect, beforeEach } from 'vitest';

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

    mockContract = {
      setHint: vi.fn(),
    } as unknown as Contract;

    vi.mocked(Contract).mockImplementation(() => mockContract);
    vi.mocked(StandardMerkleTree.of).mockReturnValue({
      root: '0x1234567890123456789012345678901234567890123456789012345678901234' as HexString,
      getProof: vi.fn().mockReturnValue(['proof1', 'proof2']),
      entries: vi.fn().mockReturnValue([[0, ['leaf1']], [1, ['leaf2']]]),
    } as unknown as StandardMerkleTree<any[]>);
  });

  it('should initialize with a signer and tree options', () => {
    const controller = new TimestampController(
      mockSigner,
      '0x0000000000000000000000000000000000000000',
      { leaves: ['data1', 'data2'], encoding: ['string'] }
    );

    expect(controller['signer']).toBe(mockSigner);
    expect(controller['provider']).toBe(mockSigner.provider);
    expect(controller['contract']).toBe(mockContract);
    expect(controller['rootHash']).toBe('0x1234567890123456789012345678901234567890123456789012345678901234');
  });

  it('should initialize with a provider and root hash', () => {
    const rootHash = '0x1234567890123456789012345678901234567890123456789012345678901234' as HexString;
    const controller = new TimestampController(
      mockProvider,
      '0x0000000000000000000000000000000000000000',
      { rootHash }
    );

    expect(controller['signer']).toBeUndefined();
    expect(controller['provider']).toBe(mockProvider);
    expect(controller['contract']).toBe(mockContract);
    expect(controller['rootHash']).toBe(rootHash);
  });

  it('should throw an error if no provider is available', () => {
    const mockSignerWithoutProvider = { getAddress: vi.fn() } as unknown as Signer;

    expect(() =>
      new TimestampController(
        mockSignerWithoutProvider,
        '0x0000000000000000000000000000000000000000'
      )
    ).toThrow('A provider must be available either through the signer or explicitly passed.');
  });

  it('should create a merkle tree with the provided data', () => {
    new TimestampController(mockProvider, '0x0000000000000000000000000000000000000000', {
      leaves: ['data1', 'data2'],
      encoding: ['string']
    });

    expect(StandardMerkleTree.of).toHaveBeenCalledWith(
      [['data1'], ['data2']],
      ['string']
    );
  });

  it('should get root hash', () => {
    const controller = new TimestampController(
      mockProvider,
      '0x0000000000000000000000000000000000000000',
      { leaves: ['data1', 'data2'], encoding: ['string'] }
    );

    expect(controller.getRootHash()).toBe('0x1234567890123456789012345678901234567890123456789012345678901234');
  });

  it('should throw error when getting root hash if not available', () => {
    const controller = new TimestampController(
      mockProvider,
      '0x0000000000000000000000000000000000000000'
    );

    expect(() => controller.getRootHash()).toThrow(TimestampControllerError);
  });

  it('should anchor root hash', async () => {
    const controller = new TimestampController(
      mockSigner,
      '0x0000000000000000000000000000000000000000',
      { leaves: ['data1', 'data2'], encoding: ['string'] }
    );

    await controller.anchorRootHash('0x1234' as HexString, '0x5678' as HexString);

    expect(mockContract.setHint).toHaveBeenCalledWith(
      '0x1234',
      '0x5678',
      '0x1234567890123456789012345678901234567890123456789012345678901234',
      '0x1000000000000000000000000000000000000000000000000000000000000000'
    );
  });

  it('should get merkle proof', () => {
    const controller = new TimestampController(
      mockProvider,
      '0x0000000000000000000000000000000000000000',
      { leaves: ['data1', 'data2'], encoding: ['string'] }
    );

    const proof = controller.getMerkleProof('data1');

    expect(proof).toEqual({
      leaf: 'data1',
      proof: ['proof1', 'proof2']
    });
  });

  it('should get all merkle proofs', () => {
    const controller = new TimestampController(
      mockProvider,
      '0x0000000000000000000000000000000000000000',
      { leaves: ['data1', 'data2'], encoding: ['string'] }
    );

    const proofs = controller.getAllMerkleProofs();

    expect(proofs).toEqual([
      { leaf: 'leaf1', proof: ['proof1', 'proof2'] },
      { leaf: 'leaf2', proof: ['proof1', 'proof2'] }
    ]);
  });

  it('should verify proof', () => {
    vi.mocked(StandardMerkleTree.verify).mockReturnValue(true);

    const controller = new TimestampController(
      mockProvider,
      '0x0000000000000000000000000000000000000000',
      { rootHash: '0x1234567890123456789012345678901234567890123456789012345678901234' as HexString }
    );

    const result = controller.verifyProof('leaf1', ['string'], ['proof1', 'proof2']);

    expect(result).toBe(true);
    expect(StandardMerkleTree.verify).toHaveBeenCalledWith(
      '0x1234567890123456789012345678901234567890123456789012345678901234',
      ['string'],
      'leaf1',
      ['proof1', 'proof2']
    );
  });

  it('should throw an error when creating merkle tree fails', () => {
    vi.mocked(StandardMerkleTree.of).mockImplementationOnce(() => {
      throw new Error('Merkle tree creation failed');
    });

    expect(() =>
      new TimestampController(
        mockProvider,
        '0x0000000000000000000000000000000000000000',
        { leaves: ['data1', 'data2'], encoding: ['string'] }
      )
    ).toThrow(TimestampControllerError);
  });

  it('should throw an error when trying to anchor without both merkle tree and root hash', async () => {
    const controller = new TimestampController(
      mockSigner,
      '0x0000000000000000000000000000000000000000'
    );

    await expect(controller.anchorRootHash('0x1234' as HexString, '0x5678' as HexString))
      .rejects.toThrow(TimestampControllerError);

    await expect(controller.anchorRootHash('0x1234' as HexString, '0x5678' as HexString))
      .rejects.toThrow('No merkle tree or root hash available to anchor.');
  });

  it('should not throw an error when anchoring with only a root hash', async () => {
    const controller = new TimestampController(
      mockSigner,
      '0x0000000000000000000000000000000000000000',
      { rootHash: '0x1234567890123456789012345678901234567890123456789012345678901234' as HexString }
    );

    vi.mocked(mockContract.setHint!).mockResolvedValueOnce({} as ContractTransactionResponse);

    await expect(controller.anchorRootHash('0x1234' as HexString, '0x5678' as HexString))
      .resolves.not.toThrow();
  });

  it('should not throw an error when anchoring with only a merkle tree', async () => {
    vi.mocked(StandardMerkleTree.of).mockReturnValueOnce({
      root: '0x1234567890123456789012345678901234567890123456789012345678901234' as HexString,
      getProof: vi.fn(),
      entries: vi.fn(),
    } as unknown as StandardMerkleTree<any[]>);

    const controller = new TimestampController(
      mockSigner,
      '0x0000000000000000000000000000000000000000',
      { leaves: ['leaf1', 'leaf2'], encoding: ['string'] }
    );

    vi.mocked(mockContract.setHint!).mockResolvedValueOnce({} as ContractTransactionResponse);

    await expect(controller.anchorRootHash('0x1234' as HexString, '0x5678' as HexString))
      .resolves.not.toThrow();
  });

  it('should throw an error when anchoring root hash fails', async () => {
    vi.mocked(mockContract.setHint!).mockRejectedValueOnce(new Error('Transaction failed'));

    const controller = new TimestampController(
      mockSigner,
      '0x0000000000000000000000000000000000000000',
      { leaves: ['data1', 'data2'], encoding: ['string'] }
    );

    await expect(controller.anchorRootHash('0x1234' as HexString, '0x5678' as HexString))
      .rejects.toThrow(TimestampControllerError);
  });

  it('should throw an error when getting merkle proof without merkle tree', () => {
    const controller = new TimestampController(
      mockProvider,
      '0x0000000000000000000000000000000000000000',
      { rootHash: '0x1234567890123456789012345678901234567890123456789012345678901234' as HexString }
    );

    expect(() => controller.getMerkleProof('data1')).toThrow(TimestampControllerError);
  });

  it('should throw an error when getting all merkle proofs without merkle tree', () => {
    const controller = new TimestampController(
      mockProvider,
      '0x0000000000000000000000000000000000000000',
      { rootHash: '0x1234567890123456789012345678901234567890123456789012345678901234' as HexString }
    );

    expect(() => controller.getAllMerkleProofs()).toThrow(TimestampControllerError);
  });

  it('should throw an error when verifying proof without root hash', () => {
    const controller = new TimestampController(
      mockProvider,
      '0x0000000000000000000000000000000000000000'
    );

    expect(() => controller.verifyProof('leaf1', ['string'], ['proof1', 'proof2']))
      .toThrow(TimestampControllerError);
  });

  it('should throw an error when failing to get proof for a specific leaf index', () => {
    vi.mocked(StandardMerkleTree.of).mockReturnValueOnce({
      root: '0x1234567890123456789012345678901234567890123456789012345678901234' as HexString,
      getProof: vi.fn().mockImplementation((index) => {
        if (index === 1) return undefined;
        return ['proof1', 'proof2'];
      }),
      entries: vi.fn().mockReturnValue([[0, ['leaf1']], [1, ['leaf2']]]),
    } as unknown as StandardMerkleTree<any[]>);

    const controller = new TimestampController(
      mockProvider,
      '0x0000000000000000000000000000000000000000',
      { leaves: ['leaf1', 'leaf2'], encoding: ['string'] }
    );

    expect(() => controller.getAllMerkleProofs()).toThrow(TimestampControllerError);
    expect(() => controller.getAllMerkleProofs()).toThrow('Failed to get proof for leaf at index 1');
  });
});