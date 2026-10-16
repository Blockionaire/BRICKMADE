# From a BrickMade design to a complete brick shopping list

Prepared 2026-10-13. Catalog and shopping handoff foundations are implemented; no pricing, payments, checkout, or actual ordering enters this prototype.

## Recommended buying routes

Provide a complete **BrickLink Wanted List** export and a **BrickOwl Wishlist** handoff once every BOM line has exact provider IDs. The customer reviews the list and supplier baskets. A complete list may require several sellers; a single shop or prepacked kit is not guaranteed. **LEGO Pick a Brick** is an additional route for eligible currently sold color-specific elements.

| Provider | Intended route | Verified in this task | Remaining prerequisite |
| --- | --- | --- | --- |
| [BrickLink](https://www.bricklink.com/) | Provider-specific wanted-list XML, then marketplace buying | Main site accessible; XML fields corroborated against the independent [BrickStore writer](https://github.com/rgriebl/brickstore/blob/main/src/bricklink/io.cpp) without incorporating its code | Official upload acceptance/current API access, exact part/color mapping, regional stock and quantities. The attempted old API documentation URL returned 404; wanted-upload access could not be verified in this environment. |
| [BrickOwl](https://www.brickowl.com/api_docs) | Customer-triggered wishlist transfer | Official docs explicitly support a POST form to `https://www.brickowl.com/addtowishlist` with JSON in the `data` parameter, e.g. `{"items":[{"boid":"44980-38","qty":"2"}]}`. They also document element-ID search links and wishlist API methods. | Resolve correct BOID/color identities and test an actual private-list handoff with the customer's account. No real list was sent or created. |
| [LEGO Pick a Brick](https://www.lego.com/pick-and-build/pick-a-brick) | Direct eligible-element lookup/purchase | Official page accessible and requires country selection for the correct assortment | Supported list workflow, exact element IDs, country-specific availability and required quantities |
| [Rebrickable](https://rebrickable.com/downloads/) | Identity, observed colors, element IDs, and relationships | Current bulk CSVs imported; commercial reuse with attribution confirmed. API docs require an account/key; bulk import does not. | API external-ID enrichment or another approved mapping source for supplier identities; bulk CSVs do not provide all marketplace mappings |

BrickOwl's documented public wishlist form makes a simple full-list redirect plausible without embedding an API key in the browser. Customer login may be needed. Its API is a separate account/key integration with per-method quotas; it requires attribution and a unique User-Agent, prohibits marketplace use, and grants no license for its images. Evaluate the product's sourcing-service scope against those terms before API integration. Do not copy vendor imagery or scrape stock data.

## BOM requirements

Each line needs the precise part/mold/decorated variant, a recorded and reviewed manufactured color pairing, exact quantity, chosen new/used condition, any approved substitutions, and verified provider part/color IDs or an appropriate color-specific element ID. Preserve source/version/evidence and ambiguous mappings.

Rebrickable's **100,148 observed part/color pairs** and **114,656 element-ID records** now supply historical catalog evidence. They do not establish a provider's current stock, sufficient quantity, or exact mold equivalence. LDraw IDs, Rebrickable IDs, LEGO design IDs, LEGO element IDs, BrickLink IDs, and BrickOwl BOIDs remain separate namespaces.

## Implemented export foundation

[shopping-list.ts](../src/domain/library/shopping-list.ts) checks every line before producing BrickLink-style wanted-list XML. It rejects unverified part/color inputs, missing/ambiguous mappings, invalid identities/conditions/quantities, and quantity overflow. It merges duplicate exact provider part/color/condition lines. It contains no prices, stock assertion, checkout, or ordering logic.

The Parts screen now exports a complete source-ID BOM CSV, an exact mapping-gap report and a physical test pack. The provider handoff is wired behind full per-line mapping verification in `build-handoff.ts`; `data/catalog/purchase-mappings.json` intentionally contains no guessed provider identities. The XML still needs a real provider import acceptance test. Unit tests use explicit synthetic verified fixtures, not the house's illustrative colors. No purchase or order is placed. Current models use observed Rebrickable part/color pairs. Their exact marketplace part/color identities still need independent verification; guessing the nearest RGB is insufficient.

A future BrickOwl handoff should submit only reviewed BOID/color/quantity entries through the documented customer-triggered form. Do not send photos, private build names, or public-MOC publications automatically.

## Customer flow when enabled

1. Select shipping country and new/used preference.
2. See full BOM coverage, missing mappings, unavailable pieces, and quantity shortfalls.
3. Review mold/color substitutions; accepted changes must propagate to the model, parts, bags, and instructions.
4. Download the complete provider-specific list or explicitly open the supported wishlist handoff.
5. Review actual seller baskets and shipping on the provider before buying.

A complete wanted list is different from a complete, available basket. A later backend can evaluate seller inventories under country, condition, and quantity constraints. Shipping and seller minimums matter when pricing enters scope later. Store API credentials only in secure server configuration, never in the static GitHub Pages app. The customer's shipping country remains configurable; no region-specific buying flow is enabled yet.
