# BrickMade implementation log

## In progress — category-first studio, 2026-10-15

Target: category → photos → one submission → checked design, with House as the first enabled generator. Car, Animal, Flower and Free format have explicit category contracts/readiness; they must not silently generate house demos.

- Existing diagnostic fixes: POST connection checks exercise upload origins; failures are brought into view; retry controllers are released. Verified previously with 15 API cases and 10 browser scenarios. Live failure remains unconfirmed because of this environment's egress gateway.
- Started shared v2 House design contract and versioned category knowledge, including footprint, storeys, four roof families, ridge direction, side windows and entrance position.
- Building Supabase migrations, server-managed anonymous identity, private temporary uploads, durable jobs and immutable checked artifacts. Hosting credentials are not present in this workspace; hosted activation remains separate from local verification.
- Supabase project recommendation: dedicated project, keeping the user's existing wine/shared projects untouched. No subscription or external resource has been created.
- Read the available environment draft and saved additive network requirements while preserving its existing domains. Saving a draft does not apply or publish it.

This file is updated at verified milestones. Planned functionality is not a release claim.
