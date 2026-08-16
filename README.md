# RAG Atlas

An interactive walkthrough of retrieval-augmented generation, evaluation, and guardrails. Nine stages, three plain `.txt` files, and sliders wired to live output — drag one and the chunks, vectors, retrieved passages, prompt, and answer all move with it.

Nothing is simulated. Real chunking, real 1536-dimensional embeddings, real cosine ranking, real streamed generation, and a real second model grading the first.

---

## Run it locally

```bash
npm install
```

```bash
npm run dev
```

Open <http://localhost:3000> and paste an OpenAI API key when asked. Get one at [platform.openai.com/api-keys](https://platform.openai.com/api-keys).

> **Do not run `npm run build` while `npm run dev` is running.** Both write to `.next/`, and the build will pull chunk files out from under the live dev server. Stop dev first.

### Troubleshooting

**`Error: Cannot find module './379.js'`** (or any numbered chunk) — the `.next/` directory is in a mixed state, usually from a build running alongside dev. Stop the dev server and delete it:

```bash
rm -rf .next && npm run dev
```

**Headings render in Times New Roman** — `next/font` fetches Google Fonts at build time, and a network hiccup makes it fall back silently, caching that failure. Same fix: stop the server, delete `.next`, restart. The app also ships zero-specificity font defaults, so a failed fetch degrades to Georgia/system-ui rather than to browser defaults.

## Deploy to Vercel

```bash
npx vercel --prod
```

If you would rather use the dashboard: push this folder to a GitHub repo, then import it at [vercel.com/new](https://vercel.com/new). Vercel detects Next.js automatically.

By default there are **no environment variables to configure** — every visitor brings their own key, so there is nothing secret to store.

### Optional: run the demo on your own key

If you want visitors to try the site without needing a key, set one environment variable in Vercel (Settings → Environment Variables), then **redeploy** — env vars only apply to new builds:

```
OPENAI_API_KEY=sk-...
```

Name it exactly that. **Never prefix it with `NEXT_PUBLIC_`**, which would ship the key into the browser bundle for anyone to read.

With that set, the landing page offers "Start exploring — no key needed", and the API routes automatically switch into a restricted mode:

| Protection | Behaviour |
|---|---|
| **Corpus lock** | Text submitted for embedding, generation, or judging must be a genuine excerpt of `public/corpus/*.txt`. This is what stops the endpoints being used as a free general-purpose LLM proxy. |
| **Prompt assembly** | The server builds the prompt itself. Callers choose a question and passages; they cannot supply a raw `messages` array. |
| **Rate limits** | Per IP, per hour: 40 generations, 40 evaluations, 60 guardrail checks, 20 chunk-embedding batches, 60 query embeddings. |
| **Length caps** | Questions 400 chars, passages 4,000 chars each (max 12), guardrail probes 2,000 chars. |

A visitor who enters their **own** key bypasses every one of those restrictions — they are paying, so they get the unrestricted pipeline.

> Before deploying with a shared key, set a **monthly budget limit** on the OpenAI account (Billing → Limits). The in-app protections are a speed bump; the budget cap is the only hard ceiling. Note that rate-limit counters live in memory, so on serverless they reset when an instance goes cold.

---

## What each stage shows

| # | Stage | Live controls |
|---|-------|---------------|
| 1 | **Corpus** — the three source files | toggle documents in and out |
| 2 | **Chunking** — where the cuts land, painted onto the source text | chunk size, overlap, strategy, three-way comparison |
| 3 | **Embedding** — chunks projected into 2D by PCA | hover and pin any point to inspect its raw vector |
| 4 | **Query** — your question in the same vector space | six preset questions, including one deliberately unanswerable |
| 5 | **Retrieval** — cosine ranking with the winners lit up | top-K, score floor |
| 6 | **Augmentation** — the literal prompt, colour-coded by source | hover a passage to trace it back to its chunk |
| 7 | **Generation** — streamed, cited answer | temperature, plus the same question answered with no retrieval |
| 8 | **Evaluation** — faithfulness, relevance, completeness | LLM-as-judge, with unsupported claims quoted |
| 9 | **Guardrails** — input and output gates | attack sandbox, groundedness threshold |

### Things worth trying

- Set **top-K to 1** and ask *"Compare the critical temperatures in coffee roasting and kiln firing"* — watch it answer half the question.
- Push **temperature to 1.2** in stage 7, regenerate, then re-score in stage 8 and watch faithfulness fall.
- Switch **off the coffee document** in stage 1, then ask about first crack. The refusal is the correct behaviour.
- Set **chunk size to 250** and compare all three strategies — fixed windows produce dozens of chunks that begin mid-word.
- Paste an attack into the stage 9 probe and watch the regex rules fire before you finish typing.

---

## How your key is handled

- Held in React state for the life of the browser tab. Never written to `localStorage`, a cookie, a database, or a log.
- Sent from the browser to this app's own `/api/*` routes, and from there directly to `api.openai.com`. It touches no third party.
- All OpenAI calls happen server-side, so the key never appears in the client bundle.
- Close the tab and it is gone. There is nothing to log out of.

## What a session costs

Well under a cent. A full pass — embedding ~44 chunks, one query, one answer, one evaluation, one guardrail check — runs about **$0.001**. The header meter tracks it live and breaks it down per call.

Chunking, similarity ranking, PCA, and every slider run entirely in your browser and cost nothing. Embeddings are cached per chunking configuration, so returning to a previous slider position is free.

**Models:** `gpt-4o-mini` for generation, judging, and injection classification; `text-embedding-3-small` for embeddings; `omni-moderation-latest` for moderation (free).

---

## Project layout

```
app/
  api/            server routes — the only place the key is used
    validate/     cheap authenticated call to verify the key
    embed/        batch embeddings
    chat/         streaming generation (NDJSON)
    evaluate/     LLM-as-judge, structured output
    guardrails/   moderation + injection classifier
  components/     one file per stage, plus the shared UI kit
  lib/
    chunking.ts   three strategies, all offset-accurate
    vector.ts     cosine, and a power-iteration PCA to 2D
    guardrails.ts regex + Luhn rules that run client-side
    prompt.ts     the system prompt and context assembly
    store.tsx     shared state and the embedding cache
public/corpus/    the three .txt source files
```

To swap in your own documents: drop `.txt` files into `public/corpus/` and update `DOC_MANIFEST` in `app/lib/store.tsx`.

---

## Notes on the implementation

- **PCA is real.** Power iteration finds the top two components of the chunk vectors without materialising a 1536×1536 covariance matrix. The query is projected through the same fitted transform, so on-screen distance is meaningful relative to the chunks.
- **Chunk offsets are exact.** Every chunk carries its character range in the source document, which is what makes the ribbon in stage 2 able to paint overlap regions accurately.
- **The card detector runs a Luhn checksum**, so it does not fire on every long number.
- **Sentence and recursive splitting overlap by whole units**, so a small overlap next to large chunks can have no effect. The UI detects this and says so rather than letting the slider look broken.

Built with Next.js 14 and Tailwind. No database, no analytics, no telemetry.
