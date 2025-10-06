# Product Quickstart – InsightBoard

InsightBoard is a lightweight analytics workspace that lets teams collect docs, search them with natural language, and share answers.

## What you can do

- **Ask in plain English**: “Show me onboarding steps” or “How do we define a Sev-2?”
- **Cite sources**: Answers reference the original chunks (file + section).
- **Share**: Copy/paste answers into email or chat.

## Core concepts

- **Workspace**: A collection of documents (Markdown/PDF) indexed for search.
- **Chunk**: A small passage (≈ 900 chars) with overlap, used for precise retrieval.
- **Re-index**: Process that (re)creates vocabulary/IDF and chunk vectors.

## Uploading & indexing

1. Put `.md` or `.pdf` files into `backend/data/docs/`.
2. Re-index: `cd backend && npx ts-node src/embed.ts`
3. Start API: `npx ts-node src/index.ts` (or deploy; Render runs `postbuild` to re-index)

## Asking great questions

- Be specific: _“Steps to create a dashboard”_ > _“dashboard?”_
- Include nouns & verbs: _“declare an incident”_, _“severity definitions”_, _“who approves”_
- If you get “I don’t know”, try a synonym that appears in the docs.

## FAQ

**Q: What file types are supported?**  
A: Markdown and PDF.

**Q: How are answers chosen?**  
A: TF-IDF + cosine similarity, with a tiny exact-term bonus.

**Q: How do I update content?**  
A: Replace/ add files in `data/docs/`, then re-index.
