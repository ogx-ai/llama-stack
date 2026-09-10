# OGX Technical Whitepaper (LaTeX)

This directory holds `ogx.tex` (and its build artifacts `ogx.bbl`, `ogx.pdf`,
`references.bib`), a standalone, diagram-heavy technical whitepaper. **It is a
separate document from the JOSS submission**, not an alternate build of it.

- **JOSS manuscript:** [`paper.md`](https://github.com/ogx-ai/ogx/blob/3a1e778b362a5f827796b0dd3529bd883607ed59/paper.md)
  and [`paper.bib`](https://github.com/ogx-ai/ogx/blob/3a1e778b362a5f827796b0dd3529bd883607ed59/paper.bib)
  at commit `3a1e778b362a5f827796b0dd3529bd883607ed59`, including the
  revised deployment wording and versioned software and operator citations
  recorded below. These links identify the manuscript independently of the
  software release tag.
- **This whitepaper:** `ogx.tex`, built against `references.bib` and `ogx.bbl`
  in this directory. It shares subject matter with `paper.md` but is
  maintained independently, is not kept in lockstep with it, and is not part
  of the JOSS submission.

Both documents currently share the same title, which has caused confusion
about which one the JOSS proof corresponds to. If you're looking for the JOSS
manuscript, use the pinned links above.

## Source references

The software version under review, operator source reference, and revised
manuscript are identified independently:

| Component | Revision | Reference |
| --- | --- | --- |
| OGX software | `v1.0.2` | commit `9424b4d9e5eca99bfc79a6e0004e28adf5f58704` |
| OGX Kubernetes Operator | `v0.10.0` | commit `7fa16532e1434bf74493ca305b1e21030914ae57` |
| Manuscript (`paper.md` / `paper.bib`) | -- | commit `3a1e778b362a5f827796b0dd3529bd883607ed59` |

The operator reference is an existing tagged source snapshot. Its
[`OGXServer` API](https://github.com/ogx-ai/ogx-k8s-operator/blob/7fa16532e1434bf74493ca305b1e21030914ae57/api/v1beta1/ogxserver_types.go)
and [deployment documentation](https://github.com/ogx-ai/ogx-k8s-operator/blob/7fa16532e1434bf74493ca305b1e21030914ae57/README.md)
describe the custom resource, network policies, ConfigMap image overrides,
Kubernetes/OpenShift deployment, and multi-architecture builds discussed in
the manuscript. This citation identifies source for those features; it does
not establish the operator version used by historical deployments.

## JOSS proof

The [existing JOSS proof](https://github.com/openjournals/joss-papers/blob/28806e6eceeb8d146d178df7f4194fa2549ad4fc/joss.11234/10.21105.joss.11234.pdf)
was generated on 31 August 2026 and predates these manuscript updates. It
still contains the unversioned software and operator citations. The pinned
manuscript above identifies the revised source, not the build commit of that
older proof.
After merging the updates, run `@editorialbot generate pdf` on the
[JOSS review issue](https://github.com/openjournals/joss-reviews/issues/11234)
to generate a proof with the revised wording and versioned citations, and
record the new proof link alongside its manuscript source revision. If either
manuscript file changes, update both source links and the table before
regenerating the proof.
