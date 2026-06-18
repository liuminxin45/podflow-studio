# AI Knowledge Pack Synthesis Plan

Goal: generate a portable Spec Kit knowledge pack for an arbitrary workspace.

AI responsibilities:
- Read the generation contract and bootstrap review packet first.
- Use the source-read plan as a bounded queue; do not full-text scan the whole workspace by default.
- Edit the AI synthesis workspace under .specify\knowledge-pack-generation\ai-synthesis\ai\knowledge.
- Preserve the knowledge framework: index.yml, selected guides, authority, confidence, tags, and source references.
- Prefer layered knowledge over long manuals: workspace overview, repository guides, build command matrix, validation capabilities, and domain guides only when source evidence supports them.
- Run the quality loop and fix source coverage, unresolved source refs, and claim verification gaps before export.
- Keep generated authority unless a human explicitly approves promotion.

After synthesis:
- Re-run this script with -ReviewedKnowledgeDir .specify\knowledge-pack-generation\ai-synthesis\ai\knowledge.
- Treat acts.quality and acts.equivalence as the minimum acceptance evidence.
- Validate the pack before mounting it into another workspace.
- Mount with ootstrap-knowledge.ps1 -PackPath <pack-dir> only after the user chooses to apply it.
