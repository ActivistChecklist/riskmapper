/**
 * Persistence boundary: use `createLocalMatrixRepository()` today; replace with an
 * API-backed `MatrixRepository` implementation later without changing UI hooks.
 */
export type { MatrixRepository, MatrixWorkspaceV1, RiskMatrixSnapshot, StoredMatrix } from "./matrixTypes";
export { createLocalMatrixRepository, normalizeWorkspace } from "./matrixLocalRepository";
