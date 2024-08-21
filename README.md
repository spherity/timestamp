# Timestamp

This library provides a simple interface for anchoring timestamps on the Ethereum blockchain using merkle trees.

## Usage

To timestamp newly created data, you'll need to initialize the TimestampController by providing it with the leaves (your data) and the necessary encoding options. The library will then automatically generate a Merkle tree from your data.

Once you've created the timestamp, the next step is to anchor the Merkle tree's root hash to the Ethereum blockchain. This is done using the anchorRootHash method, which writes the root hash to the Ethereum blockchain's Trusted Hint Registry using the provided signer. During this process, an event is emitted that serves as proof of the data's existence at that specific point in time.

To verify the integrity of your data later on, you can use the verifyProof method. This method requires you to provide the leaf (your data) and the corresponding Merkle proof. The verification process confirms that the data hasn't been altered since it was timestamped and anchored to the blockchain.

For future verifications, you'll need to generate proofs. You can do this using either the getMerkleProof method for a single proof or the getAllMerkleProofs method if you need multiple proofs. It's highly recommended to store these proofs, along with their corresponding root hash, in a database. This practice ensures that you have easy access to the information needed for future verifications.

```typescript
import { TimestampController } from "@spherity/timestamp";
import { JsonRpcProvider, Wallet, keccak256 } from "ethers";

// Initialize provider and signer
const provider = new JsonRpcProvider("https://infura.io/v3/YOUR-PROJECT-ID");
const signer = new Wallet("YOUR-PRIVATE-KEY", provider);

// Define contract options
const contractOptions = {
  contractAddress: "0x1234567890123456789012345678901234567890", // Trusted Hint Registry contract address
  namespace: await signer.getAddress(), // Use signer's address as namespace
  list: keccak256(Buffer.from("timestampingList")); // Unique identifier for your list
};

// Define tree options with verifiable credentials
const treeOptions = {
  leaves: [
    [
      JSON.stringify({
        "@context": ["https://www.w3.org/2018/credentials/v1"],
        type: ["VerifiableCredential"],
        issuer: "did:example:123",
        issuanceDate: "2023-06-15T00:00:00Z",
        credentialSubject: {
          id: "did:example:456",
          name: "Alice",
        },
      }),
    ],
    [
      JSON.stringify({
        "@context": ["https://www.w3.org/2018/credentials/v1"],
        type: ["VerifiableCredential"],
        issuer: "did:example:789",
        issuanceDate: "2023-06-16T00:00:00Z",
        credentialSubject: {
          id: "did:example:012",
          name: "Bob",
        },
      }),
    ],
  ],
  encoding: ["string"],
};

// Create TimestampController instance
const controller = new TimestampController(signer, contractOptions, treeOptions);

// Anchor root hash
async function anchorRootHash() {
  const tx = await controller.anchorRootHash();
  console.log("Root hash anchored:", tx.hash);
}

// Get and verify merkle proof
async function verifyProof() {
  const leaf = [
    JSON.stringify({
      "@context": ["https://www.w3.org/2018/credentials/v1"],
      "type": ["VerifiableCredential"],
      "issuer": "did:example:123",
      "issuanceDate": "2023-06-15T00:00:00Z",
      "credentialSubject": {
        "id": "did:example:456",
        "name": "Alice"
      }
    })
  ];
  const merkle = controller.getMerkleProof(leaf);
  const verified = await controller.verifyProof(
    leaf,
    merkle.proof,
    new Date("2023-06-15T00:00:00Z"), // Date when the leaf was created
    7 * 24 * 3600 // Max time difference in seconds between leaf creation and timestamp of anchoring
  );
  console.log("Proof verified:", verified);
}

// Run example
(async () => {
  await anchorRootHash();
  await verifyProof();
})();

```

In case you want to verify a merkle proof later on, you can construct the TimestampController with the same contract options and an already anchored root hash.

```typescript
// Create TimestampController instance with an existing root hash
const existingRootHash = "0x1234567890..."; // Replace with actual root hash
const controllerWithExistingRoot = new TimestampController(
  provider,
  contractOptions,
  { rootHash: existingRootHash }
);

// Verify a proof using the existing root hash
async function verifyExistingProof() {
  const leaf = [
    JSON.stringify({
      "@context": ["https://www.w3.org/2018/credentials/v1"],
      type: ["VerifiableCredential"],
      issuer: "did:example:789",
      issuanceDate: "2023-06-20T00:00:00Z",
      credentialSubject: {
        id: "did:example:101112",
        name: "Bob",
      },
    }),
  ];
  const proof = ["0xabcdef...", "0x123456..."]; // Replace with actual proof
  const verified = await controllerWithExistingRoot.verifyProof(
    leaf,
    proof,
    new Date("2023-06-20T00:00:00Z"), // Date when the leaf was created
    7 * 24 * 3600 // Max time difference in seconds
  );
  console.log("Existing proof verified:", verified);
}

// Run verification with existing root hash
(async () => {
  await verifyExistingProof();
})();
```
