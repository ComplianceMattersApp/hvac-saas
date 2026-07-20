# Trainer AI Model Optimization Plan

Status: active decision record, July 20, 2026

## Decision

Keep the EveryStep trainer on `gpt-5.6-luna` through the Responses API. Improve it with owner-approved knowledge, representative evaluation questions, prompt refinement, and measured feedback. Do not fine-tune it now and do not let raw user conversations automatically train or alter production guidance.

This keeps changing app behavior in the governed knowledge catalog, where it can be reviewed, corrected, cited, and published without retraining a model.

## Why

- OpenAI describes Luna as the GPT-5.6 model for cost-sensitive, high-volume workloads. That matches a frequently used trainer bubble under the existing global AI budget.
- Luna supports Responses, structured outputs, and file search, but its current model page says fine-tuning is not supported.
- OpenAI's optimization workflow starts with representative evaluations, then prompt/context improvements, and only uses fine-tuning for some use cases.
- OpenAI recommends fine-tuning only after evaluations exist. Its current supervised fine-tuning surface is being wound down and is no longer available to new users.
- App facts change. Retrieval is the correct source for current workflows, permissions, product modes, and limitations; model weights are not.

Official references:

- [GPT-5.6 Luna model](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
- [Model optimization](https://developers.openai.com/api/docs/guides/model-optimization)
- [Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)
- [Supervised fine-tuning](https://developers.openai.com/api/docs/guides/supervised-fine-tuning)

## Current production loop

1. The user asks a question from an authenticated internal route.
2. The server supplies role, product-mode, and safe capability context.
3. Published, audience-scoped EveryStep knowledge is retrieved.
4. Luna answers only from those excerpts and returns citations.
5. An unsupported question fails closed and creates a private review draft.
6. A Platform Owner reviews and corrects the draft before publishing it as knowledge.
7. Published knowledge becomes available to later questions without model retraining.

Raw questions and model-written drafts are evidence for review, not trusted training truth.

## Evaluation foundation

Use a small owner-curated regression set before changing the model, prompt, retrieval ranking, or knowledge structure. Start with realistic questions in these groups:

- core navigation and setup;
- customers, locations, jobs, scheduling, and field completion;
- estimates and Good / Better / Best proposals;
- equipment, service plans, parts, and follow-up visits;
- invoices, payments, and financial visibility by role;
- ECC/HERS and permit workflows;
- deliberately unsupported or ambiguous questions.

Each case should record:

- the exact user question;
- role, product mode, route, and relevant capability flags;
- whether the answer should be supported;
- required source slug or slugs;
- essential facts that must appear;
- facts or actions the answer must not claim;
- an owner-reviewed pass/fail result and notes.

Measure at least:

- retrieval coverage: the required source appears in the retrieved set;
- groundedness: factual claims are supported by cited published knowledge;
- permission safety: the answer respects role and capability context;
- gap behavior: unsupported questions are identified and logged rather than guessed;
- field usefulness: the direct answer and essential next steps are easy to scan;
- cost and latency per answer.

Keep these evaluations in the repository or another owner-controlled store rather than depending on OpenAI's legacy Evals platform, whose current documentation lists a 2026 retirement timeline.

## Promotion gates

Prompt or retrieval changes may ship when the representative set shows no material regression in groundedness, permissions, or gap behavior and the field-usefulness result improves or stays equivalent.

Consider a different base model only when production questions show a repeated, measurable Luna failure that better knowledge or prompting does not solve. Compare the candidate on the same evaluation set and include cost and latency.

Revisit fine-tuning only if all of these become true:

- a supported fine-tuning platform and base model are available;
- there are at least 50 owner-approved, representative input/output examples;
- the persistent failure is stable behavior or formatting, not missing/changing app knowledge;
- the fine-tuned candidate beats the base model on a held-out evaluation set;
- the quality gain justifies operational complexity and cost.

## Explicit non-goals

- No autonomous self-training.
- No publishing model-written articles without owner approval.
- No broad repository, database, or customer-record access from the model.
- No answer based on uncited general software knowledge.
- No migration to OpenAI-hosted vector stores until the current governed catalog demonstrably fails retrieval evaluations.
