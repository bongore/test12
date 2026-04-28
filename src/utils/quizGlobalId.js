import { quiz_address } from "../contract/config";

const LEGACY_ADDRESS = "0xEbBD4E3276bcb847838E18DDA7585Ac8925a5eA6";

// Hardcoded mapping of logical sequence to (address, localId)
// ID 0-6: Legacy contract quizzes (0 to 6)
// ID 7: Current contract quiz 0 ("第二回(1)")
// ID 8: Current contract quiz 3 ("第二回(2)")
// ID 9: Current contract quiz 4
// ID 10: Current contract quiz 5
// ID 11: Current contract quiz 6
const MAPPED_QUIZZES = [
    { address: LEGACY_ADDRESS, id: 0 },
    { address: LEGACY_ADDRESS, id: 1 },
    { address: LEGACY_ADDRESS, id: 2 },
    { address: LEGACY_ADDRESS, id: 3 },
    { address: LEGACY_ADDRESS, id: 4 },
    { address: LEGACY_ADDRESS, id: 5 },
    { address: LEGACY_ADDRESS, id: 6 },
    { address: quiz_address, id: 0 },
    { address: quiz_address, id: 3 },
    { address: quiz_address, id: 4 },
    { address: quiz_address, id: 5 },
    { address: quiz_address, id: 6 },
];

/**
 * Converts a Local ID and Contract Address into a unified Global ID for continuous URL routing.
 * Returns -1 if the local quiz is an ignored duplicate.
 */
export function toGlobalId(localId, sourceAddress) {
    const normAddress = String(sourceAddress || quiz_address).toLowerCase();
    const numericLocalId = Number(localId);

    // Check hardcoded map first
    const index = MAPPED_QUIZZES.findIndex(
        q => String(q.address).toLowerCase() === normAddress && q.id === numericLocalId
    );
    if (index !== -1) return index;

    // Explicitly ignore duplicates created on the current contract (Local IDs 1 and 2)
    if (normAddress === String(quiz_address).toLowerCase()) {
        if (numericLocalId === 1 || numericLocalId === 2) {
            return -1;
        }
        
        // For newly created quizzes (Local ID 7 and above)
        if (numericLocalId >= 7) {
            const offset = numericLocalId - 7;
            return MAPPED_QUIZZES.length + offset;
        }
    }

    // Fallback
    return numericLocalId;
}

/**
 * Resolves a unified Global ID from the URL back to its Local ID and Contract Address.
 */
export function resolveGlobalId(globalId) {
    const numericGlobalId = Number(globalId);
    
    // Within hardcoded map
    if (numericGlobalId >= 0 && numericGlobalId < MAPPED_QUIZZES.length) {
        return MAPPED_QUIZZES[numericGlobalId];
    }
    
    // For newly created quizzes beyond the mapped list
    if (numericGlobalId >= MAPPED_QUIZZES.length) {
        const offset = numericGlobalId - MAPPED_QUIZZES.length;
        return {
            address: quiz_address,
            id: 7 + offset
        };
    }

    // Fallback
    return { id: numericGlobalId, address: quiz_address };
}
