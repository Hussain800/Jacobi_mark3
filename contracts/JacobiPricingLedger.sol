// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title JacobiPricingLedger
/// @author Jacobi Protocol
/// @notice Decentralized pricing transparency ledger that stores Merkle roots of
///         price-audit batches and allows on-chain verification of individual
///         price records via Merkle inclusion proofs.
/// @dev    All proof verification is performed in Yul assembly for minimal gas
///         overhead. Leaf construction follows `keccak256(abi.encodePacked(...))`
///         and proof hashing uses sorted-pair ordering (OpenZeppelin standard).
contract JacobiPricingLedger {
    // ──────────────────────────────────────────────
    //  State
    // ──────────────────────────────────────────────

    /// @notice Contract owner; the only address permitted to commit new roots.
    address public owner;

    /// @notice Maps a committed Merkle root to the block timestamp at which it
    ///         was recorded. A zero value indicates the root has never been committed.
    mapping(bytes32 => uint256) public roots;

    /// @notice Nullifier registry — each leaf hash may only be verified once,
    ///         preventing replay of the same price record across multiple calls.
    mapping(bytes32 => bool) public spentLeaves;

    /// @notice Monotonically increasing counter of committed roots.
    uint256 public rootCount;

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    /// @notice Emitted when a new Merkle root is committed to the ledger.
    /// @param root      The 32-byte Merkle root of the price-audit batch.
    /// @param timestamp The `block.timestamp` at the moment of commitment.
    /// @param batchSize The number of price records represented by this root.
    event RootCommitted(
        bytes32 indexed root,
        uint256 timestamp,
        uint256 batchSize
    );

    /// @notice Emitted when a caller successfully verifies a price record
    ///         against a previously committed Merkle root.
    /// @param root     The Merkle root the leaf was verified against.
    /// @param leaf     The keccak256 hash of the price record.
    /// @param verifier The `msg.sender` who performed the verification.
    event PriceVerified(
        bytes32 indexed root,
        bytes32 indexed leaf,
        address indexed verifier
    );

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    /// @dev Thrown when a non-owner address calls an `onlyOwner` function.
    error Unauthorized();

    /// @dev Thrown when a Merkle root has not been committed to the ledger.
    error RootNotFound();

    /// @dev Thrown when a leaf has already been verified (nullifier spent).
    error LeafAlreadySpent();

    /// @dev Thrown when the Merkle inclusion proof is invalid.
    error InvalidProof();

    /// @dev Thrown when `transferOwnership` is called with the zero address.
    error ZeroAddress();

    // ──────────────────────────────────────────────
    //  Modifiers
    // ──────────────────────────────────────────────

    /// @dev Restricts access to the current `owner`.
    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    /// @notice Deploys the ledger and sets the deployer as the initial owner.
    constructor() {
        owner = msg.sender;
    }

    // ──────────────────────────────────────────────
    //  External — Root Management
    // ──────────────────────────────────────────────

    /// @notice Commits a new Merkle root representing a batch of price-audit
    ///         records. Only callable by the contract owner.
    /// @param root      The 32-byte Merkle root to store.
    /// @param batchSize The number of individual price records in this batch.
    function commitRoot(bytes32 root, uint256 batchSize) external onlyOwner {
        roots[root] = block.timestamp;

        // Safe from overflow for any practical root count.
        unchecked {
            ++rootCount;
        }

        emit RootCommitted(root, block.timestamp, batchSize);
    }

    // ──────────────────────────────────────────────
    //  External — Price Verification
    // ──────────────────────────────────────────────

    /// @notice Verifies that a price record is included in a previously
    ///         committed Merkle root. Each leaf (price record) can only be
    ///         verified once to prevent replay attacks.
    /// @param root        The Merkle root to verify against.
    /// @param proof       The Merkle inclusion proof (array of sibling hashes).
    /// @param sessionId   The unique session identifier of the price audit.
    /// @param domain      The domain (retailer / service) from which the price
    ///                    was captured.
    /// @param priceCents  The observed price in USD cents.
    /// @param spreadCents The price spread (deviation) in USD cents.
    /// @param salt        Random salt used when the leaf was originally hashed,
    ///                    binding the record to a specific audit run.
    /// @return valid `true` if the proof is valid and the leaf was successfully
    ///         marked as spent.
    function verifyPriceAudit(
        bytes32 root,
        bytes32[] calldata proof,
        bytes32 sessionId,
        string calldata domain,
        uint64 priceCents,
        uint32 spreadCents,
        bytes32 salt
    ) external returns (bool valid) {
        // 1. Ensure the root has been committed.
        if (roots[root] == 0) revert RootNotFound();

        // 2. Reconstruct the leaf from the supplied price-record fields.
        bytes32 leaf = keccak256(
            abi.encodePacked(sessionId, domain, priceCents, spreadCents, salt)
        );

        // 3. Nullifier check — each leaf may only be consumed once.
        if (spentLeaves[leaf]) revert LeafAlreadySpent();

        // 4. Verify the Merkle inclusion proof (Yul-optimized).
        if (!verifyProofYul(root, proof, leaf)) revert InvalidProof();

        // 5. Mark the leaf as spent.
        spentLeaves[leaf] = true;

        emit PriceVerified(root, leaf, msg.sender);

        return true;
    }

    // ──────────────────────────────────────────────
    //  External — Ownership
    // ──────────────────────────────────────────────

    /// @notice Transfers ownership of the contract to a new address.
    /// @param newOwner The address of the new owner. Must not be the zero address.
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
    }

    // ──────────────────────────────────────────────
    //  Internal — Merkle Proof (Yul Assembly)
    // ──────────────────────────────────────────────

    /// @notice Gas-optimized Merkle proof verification using inline Yul
    ///         assembly with sorted-pair hashing (OpenZeppelin standard).
    /// @dev    For each sibling in `proof`, the two hashes are sorted so that
    ///         the numerically smaller value is always placed first before
    ///         hashing. This eliminates the need for left/right direction bits.
    /// @param root  The expected Merkle root.
    /// @param proof The array of sibling hashes from leaf to root.
    /// @param leaf  The leaf hash to verify.
    /// @return      `true` if `leaf` is included under `root`.
    function verifyProofYul(
        bytes32 root,
        bytes32[] calldata proof,
        bytes32 leaf
    ) internal pure returns (bool) {
        bool isValid;
        assembly {
            let computedHash := leaf

            let proofLen := proof.length
            let proofOffset := proof.offset

            for { let i := 0 } lt(i, proofLen) { i := add(i, 1) } {
                let sibling := calldataload(add(proofOffset, mul(i, 0x20)))

                switch lt(computedHash, sibling)
                case 1 {
                    mstore(0x00, computedHash)
                    mstore(0x20, sibling)
                }
                default {
                    mstore(0x00, sibling)
                    mstore(0x20, computedHash)
                }

                computedHash := keccak256(0x00, 0x40)
            }

            isValid := eq(computedHash, root)
        }
        return isValid;
    }
}
