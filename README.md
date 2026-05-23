# Crash Recovery Reconciliation Kit

Production-focused companion repository for a MatrixTrak resource.

## What This Repository Is

This repository is the public distribution surface for the linked MatrixTrak resource.
It is designed for quick implementation support, community sharing, and stable versioned references.

## Canonical MatrixTrak Links

- Resource page (canonical): https://matrixtrak.com/resources/crash-recovery-reconciliation-kit
- Primary blog posts:
  - https://matrixtrak.com/blog/crash-recovery-reconciliation-loops-trading-bots

## Resource Summary

Reconciliation loop template for trading bots—detect and correct state drift on startup to prevent double orders and orphan positions.

## Repository Contents

- `resources/` contains shipped files copied from MatrixTrak public ship assets when available
- `docs/post-mapping.md` maps this resource to related blog posts
- `docs/resource-files.md` lists included files and source mapping
- Included shipped files:
  - resources/README.md
  - resources/reconciliation-loop-template.ts
  - resources/startup-sequence-checklist.md

## Who This Is For

- Engineers handling production incidents and reliability gaps
- Teams implementing or validating practical safeguards
- Readers coming from community channels who need canonical references

## Included Mapping

Primary mapping (post frontmatter resources):
- crash-recovery-reconciliation-loops-trading-bots - Crash Recovery: Reconciliation Loops That Prevent Double Orders

Secondary mapping (resource relatedPosts):
- idempotency-keys-for-apis-prevent-duplicate-orders-emails-writes - Idempotency keys for APIs: stop duplicate orders, emails, and writes

## Usage Notes

- Treat MatrixTrak pages as the canonical long-form guidance.
- Use this repo for practical implementation support and sharing.
- For updates, always check the canonical resource page first.

## Attribution
Use MatrixTrak canonical links above for the full context and updates.
