---
paths:
  - "apps/web/app/api/**/generate/**/route.ts"
---

# RAG retrieval must degrade silently in generation routes

`retrieve()` from `@smm/rag/retrieve` calls Voyage embeddings + Voyage reranker + Postgres pgvector. Any of those can fail (network, rate limit, missing API key, missing chunks). The generation flow must continue without context rather than 500-ing the user's request.

## Required pattern

```ts
import { retrieve } from "@smm/rag/retrieve";
import { buildCitations } from "@smm/rag/citations";

const ragResult = await retrieve(topic, { clientId, workspaceId }).catch(
  () => ({ chunks: [], contextText: "" }),
);
const citations = buildCitations(ragResult.chunks);
```

Then pass `ragResult.contextText || undefined` to the prompt builder, and return `citations` in the response payload.

## Rules

- Every new generation route that calls `retrieve()` must wrap it in this exact catch.
- Never `throw` from the catch handler. Empty chunks + empty contextText is the silent-degradation contract.
- The prompt builder's `retrievedContext` argument is optional — passing `undefined` (not empty string) gives correct behavior.
- Return `citations` in the response even when empty so the UI always has a stable shape.

## Why this matters

RAG is an enhancement, not a hard dependency. The wife's first hook generations went out before the eval set existed — failing closed there would have blocked the whole product.

## Reference implementations

- `apps/web/app/api/v1/clients/[clientId]/generate/hooks/route.ts`
- `apps/web/app/api/v1/clients/[clientId]/generate/captions/route.ts`
