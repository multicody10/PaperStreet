// Built into the Worker at deploy time from GitHub's published OIDC JWKS.
// GitHub Actions regenerates this file before production compilation.
// Local unit tests may use the empty list and mock the live JWKS request.
export const githubActionsOidcKeys: (JsonWebKey & {
  kid?: string; use?: string; alg?: string;
})[] = [];
