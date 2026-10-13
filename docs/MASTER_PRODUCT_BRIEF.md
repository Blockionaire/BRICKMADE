# BRICKMADE — MASTER PRODUCT & BUILD BRIEF

## Agreed prototype scope — updated 2026-10-13

This document describes the full product vision. Where later examples differ, these agreed prototype decisions take precedence:

- The first prototype is for private testing.
- The primary demo is **Compact House**: a small, distinctive house with a pitched roof, windows, a front door, and a chimney.
- The **Porsche 911** is a second showcase for richer shapes and detail, after the house workflow is established.
- Demonstrate Home → Create → Upload → Settings → Generate → Preview → Parts → Interactive Builder → Build Assistant.
- Use deterministic demo generation and assistant responses behind replaceable interfaces. Clearly identify demo functionality.
- Exclude payments, purchase/unlock gates, pricing, brick cost estimates, and actual ordering from this prototype. Parts exploration remains included; commercial and sourcing features below describe future product work.
- House statistics must match the implemented demo. The earlier car figures are illustrative, not validated house specifications.



## 1. PRODUCT OVERVIEW

BrickMade is a consumer AI product that turns real-world objects into custom, physically buildable brick models.

The core promise is simple:

"Turn anything into a brick build."

A user uploads several photos of an object they care about — for example a car, house, pet, camera, boat, wedding venue, building, or other personal object.

BrickMade then helps transform those photos into:

1. a recognizable 3D brick model;
2. a design built only from real, available brick parts;
3. a complete parts list;
4. estimated brick purchasing cost;
5. optimized purchasing recommendations;
6. an interactive step-by-step 3D building experience;
7. an AI Build Assistant that can explain individual build steps.

The long-term ambition is that the experience feels similar to buying a premium custom building set, except BrickMade is entirely personalized and generated from the user's own object.

The product should NOT feel like technical CAD software.

It should feel consumer-friendly, magical and extremely easy.

The user should not need to know anything about 3D modelling, brick design, part IDs, sourcing or structural design.

BrickMade handles that complexity.

---

# 2. CORE PRODUCT IDEA

The full user journey is:

CREATE → REVIEW → BUY/UNLOCK → SOURCE PARTS → BUILD

More specifically:

User uploads photos
↓
AI understands the object
↓
3D representation is generated
↓
BrickMade converts the geometry into a buildable brick model
↓
User sees a free/limited preview
↓
User chooses desired detail level
↓
BrickMade calculates:
- number of pieces
- approximate model dimensions
- estimated brick cost
- estimated build time
- difficulty
↓
User unlocks the design
↓
BrickMade provides:
- full 3D model
- complete parts list
- purchasing optimizer
- interactive builder
- AI Build Assistant
↓
User purchases the physical bricks externally
↓
User builds the model inside BrickMade using interactive instructions.

The product is therefore more than an "AI brick generator".

The real product is the complete experience from:

REAL OBJECT → PERSONAL BUILDING SET → PHYSICAL BUILD

---

# 3. BRAND

Working brand name:

BrickMade

Possible positioning lines:

"Turn anything into a brick build."

"Your world. BrickMade."

"Anything can be BrickMade."

"Made personal. Built in bricks."

The brand should feel:

- modern
- premium
- creative
- approachable
- technological without looking technical
- playful without looking childish

Avoid making the product visually look like an official LEGO product.

Do not use:
- LEGO logos;
- official LEGO branding;
- visual copies of LEGO packaging;
- official LEGO instruction design;
- language that suggests BrickMade is affiliated with LEGO.

Generic references to brick building and compatible brick parts are fine.

BrickMade must have its own visual identity.

---

# 4. TARGET USER

Primary target users are consumers who have an emotional connection to an object.

High-value use cases include:

- someone's own car
- classic car
- sports car
- first home
- childhood home
- family house
- pet
- wedding venue
- church
- boat
- camper
- motorcycle
- company building
- restaurant
- holiday home
- camera
- personal collectible

A large secondary use case is gifting.

Examples:

"Turn Dad's classic Porsche into a build."

"Give someone a brick model of their first house."

"Create a custom build of the wedding venue."

The product therefore combines:

- personalization
- nostalgia
- hobby
- creativity
- gifting
- AI

---

# 5. COMMERCIAL MODEL

BrickMade should initially be transactional, NOT subscription-first.

The user should be able to create an initial concept / preview before purchasing the complete design.

Example pricing:

Standard custom design:
€49.95 incl. VAT

Potential future tiers:

Easy Build
Standard
High Detail
Collector

Example pricing might later become:

€29.95 Easy
€49.95 Standard
€69.95 High Detail
€99.95 Collector

Do NOT hard-code these prices deeply into the architecture.

Use configurable product/pricing data.

For a future commercial prototype, €49.95 can be used as the primary price. The agreed private-testing prototype omits all prices.

---

# 6. IMPORTANT UNIT ECONOMICS PRINCIPLE

BrickMade should be highly automated.

The business model only becomes very attractive when a generated design can be delivered without manual human intervention.

Target long-term variable technical cost:

approximately €1–€4 per generated paid design.

Expensive AI calls should mainly be used for:

- visual analysis
- 3D reconstruction
- occasional reasoning
- Build Assistant questions

The following should eventually be deterministic software wherever possible:

- brick placement
- part matching
- structural constraints
- parts counting
- build step generation
- pricing calculations
- parts grouping
- shopping optimization

Do NOT design the architecture around an LLM deciding every individual brick.

---

# 7. GENERATION LIMITS

Generation is more expensive than normal app usage.

Therefore generation needs reasonable usage limits.

Possible model:

Unauthenticated/free user:
- can explore the product
- may be able to create one low-quality preview

Free account:
- limited preview generations
- for example 1–2 per month

Purchased design:
- one full generation
- two refinements/regenerations included

Additional major regeneration:
- potentially paid later

AI Builder chat can be much more generous because chat is relatively inexpensive.

The architecture should allow usage counters/quotas later.

Do not necessarily implement billing/limits fully in the first visual prototype, but structure the domain so they can be added.

---

# 8. DETAIL LEVEL SYSTEM

A critical feature is that users should not have to manually specify which bricks should be used.

The user selects desired result characteristics.

Example detail levels:

EASY BUILD

Approximately:
300–700 pieces

Optimized for:
- fewer unique parts
- larger pieces
- easier construction
- lower cost
- fewer stores required
- simpler techniques

STANDARD

Approximately:
700–1,500 pieces

Optimized for:
- good visual similarity
- reasonable price
- manageable build difficulty

This should be the default/recommended option.

HIGH DETAIL

Approximately:
1,500–2,500 pieces

Optimized for:
- more accurate shape
- smaller details
- more complex parts
- higher similarity

COLLECTOR

Approximately:
2,500–4,000+ pieces

Optimized primarily for:
- maximum visual accuracy
- advanced construction techniques
- high detail

Piece ranges are indicative only and depend on the object.

The design engine eventually determines the exact amount.

---

# 9. ADDITIONAL BUILD SETTINGS

Users may eventually choose:

Build size:
- Compact
- Standard
- Large

Build difficulty:
- Easy
- Moderate
- Challenging
- Expert

Style:
- Realistic
- Stylized

Optimization preference:
- Cheapest
- Balanced
- Maximum detail
- Easy to build

For V1, do not overwhelm the user.

The recommended UX is:

Detail level
Size
Difficulty

with sensible defaults.

Advanced settings can remain hidden.

---

# 10. FREE PREVIEW EXPERIENCE

The preview is extremely important commercially.

Users should not be asked to pay €49.95 for an abstract promise.

The ideal funnel is:

Upload images
↓
BrickMade creates preview
↓
User sees THEIR OWN object transformed into bricks
↓
BrickMade displays:
- 3D preview
- piece count
- model dimensions
- estimated cost
- difficulty
- estimated build time
↓
User becomes emotionally invested
↓
"Unlock full design — €49.95"

The preview should therefore look beautiful.

The preview itself is the primary sales mechanism.

---

# 11. PRIMARY MOBILE NAVIGATION

The product should be designed mobile-first.

Primary bottom navigation:

HOME
CREATE
BUILDER
PARTS
ACCOUNT

Potential interpretation:

Home:
dashboard and builds

Create:
start a new build

Builder:
resume active build

Parts:
parts lists / purchasing

Account:
profile, purchases, settings

"My Builds" can live primarily inside Home instead of needing its own navigation tab.

---

# 12. HOME SCREEN

The Home screen should immediately communicate the product.

Top section:

BrickMade logo / wordmark

Headline:

"Turn anything into a brick build."

Supporting copy:

"Transform your photos into detailed, buildable brick models with AI."

Primary CTA:

"Create new build"

The Home screen can feature one highlighted build.

Example:

Porsche 911
1,458 pieces
~€145 estimated brick cost
Moderate difficulty

Below:

Recent builds

Example cards:

Porsche 911
Ready to build

Family House
Generating instructions

Golden Retriever
Ready to build

Vintage Camera
Processing model

Cards should show:

- thumbnail
- project name
- piece count
- status

---

# 13. CREATE FLOW

The Create flow should feel extremely simple.

Suggested steps:

STEP 1
Upload

STEP 2
Settings

STEP 3
Estimate

STEP 4
Generate

Do not make the experience feel like filling in a technical form.

---

# 14. PHOTO UPLOAD

Recommended input:

3–8 photos

Potential maximum:
10

The app should guide users toward photos from multiple angles.

Examples:

- front
- front-left
- left
- rear
- right
- top if possible
- close-up important details

The UI can identify uploaded images as:

Front view
Side view
Rear view
Top view
Detail view

Eventually AI can automatically detect the view.

Photo guidance should say things like:

"Use well-lit photos."

"Photograph the object from several angles."

"Keep the full object visible."

"A clean background improves results."

For the prototype, use example/mock photos.

---

# 15. GENERATION STATE

Generation should feel exciting rather than like a generic spinner.

Potential generation phases:

Analyzing photos
Understanding shape
Creating 3D model
Converting geometry to bricks
Checking buildability
Matching real parts
Creating instructions
Calculating parts and costs

The UI can show these as progressive states.

Example:

"Turning your Porsche into bricks…"

Avoid displaying technical implementation details.

---

# 16. DESIGN REVIEW SCREEN

Once the preview has been generated, show a high-quality visual review page.

Main hero:

large 3D model

User can:

- rotate
- zoom
- inspect
- view front
- view side
- view rear
- view top

Project title example:

Porsche 911

Status:

Preview ready

Summary should show:

1,458 pieces

~€145 estimated brick cost

6–8 hours estimated build time

Moderate difficulty

Detail level selector:

Easy Build
Standard
High Detail
Collector

When changing detail level, stats should visually update.

For the prototype these changes can use deterministic mock values.

---

# 17. PURCHASE / UNLOCK

Before purchase, the user sees the design preview.

Locked functionality includes:

- full interactive builder
- full parts list
- shopping optimizer
- complete build instructions
- AI Build Assistant

Primary CTA:

"Unlock full design — €49.95"

Secondary CTA:

"Refine design"

Do not require actual payment integration in the earliest visual prototype unless specifically requested.

For the agreed private-testing prototype, omit purchase/unlock gates entirely. A mock unlock action can be added in a later commercial prototype.

Keep payment architecture abstract enough for Stripe later.

---

# 18. WHAT THE USER GETS

After unlocking a model, BrickMade provides:

INTERACTIVE BUILDER

Step-by-step interactive 3D building experience.

PARTS LIST

Complete list of required parts including:

- part name
- part ID
- color
- quantity
- category

SHOPPING OPTIMIZER

Helps users source the necessary parts.

BUILD ASSISTANT

AI assistant that understands:
- current project
- current build step
- parts used
- current part group
- surrounding steps

BUILD GUIDE

General build information and progress.

---

# 19. INTERACTIVE BUILDER — CORE DIFFERENTIATOR

The interactive builder is one of the most important parts of BrickMade.

Do NOT make the PDF the primary experience.

A PDF may eventually be offered as an export, but the main experience is inside the app.

The Builder displays:

Project name
Example:
Porsche 911

Progress:
Step 82 of 286
29% complete

Large 3D viewport.

The current step should clearly distinguish:

existing structure
vs
new bricks being placed

Newly added pieces can be highlighted using:

- outline
- glow
- transparency
- animation
- arrows

Controls:

- rotate
- zoom
- pan
- reset camera
- optional top/front/side views

Buttons:

Previous step
Next step

---

# 20. CURRENT STEP PARTS

For every build step, display the exact required parts.

Example:

1× Plate 1 × 1
Part #3024

2× Black plate
Part #3023

1× Red brick 1 × 2
Part #3004

Each part card should show:

- rendered part image
- quantity
- color
- part number

Users should never have to guess what a part looks like.

---

# 21. DIGITAL BAG / SORTING SYSTEM

One major UX problem is that users may receive hundreds or thousands of loose bricks from different sellers.

BrickMade should help digitally organize the build into groups.

Call these for now:

Bag 1
Bag 2
Bag 3
etc.

Example:

Bag 3
Steps 67–96

The instructions tell users which group they should currently work from.

Eventually BrickMade could generate:

- printable sorting sheets
- sorting checklists
- bag labels
- grouping instructions

For the initial product, the builder should display the active sorting group.

Example:

"Bag 3 — work with these parts for steps 67–96."

---

# 22. AI BUILD ASSISTANT

Every unlocked build includes an AI Build Assistant.

The assistant is NOT a generic chatbot.

It knows the exact context of the current project and build step.

Example user questions:

"Which black piece do I need?"

"Where does this go?"

"Why doesn't this fit?"

"Show me this step from another angle."

"What should I build next?"

"Which bag is this piece in?"

The assistant can respond with information such as:

"You need the 1 × 1 plate, part #3024. It is the small black plate from Bag 3."

If possible the UI can highlight the relevant part or placement in the 3D view.

Suggested quick actions:

Show another angle
Why doesn't this fit?
Show full step
Which part is this?
What's in the next step?

Long-term possibilities:

user takes a picture of their current physical build
↓
AI compares it against expected state
↓
AI detects errors

This is NOT required for V1 but the architecture should not make it impossible later.

---

# 23. PART SOURCING

BrickMade should not initially hold physical inventory.

The first version sells the DIGITAL DESIGN.

Users purchase actual parts externally.

Potential sourcing ecosystem:

BrickLink
other brick marketplaces
possibly other suppliers later

The purchasing experience should eventually optimize:

- part price
- shipping
- number of sellers
- availability
- delivery simplicity

Example shopping modes:

CHEAPEST

€81
6 sellers

RECOMMENDED

€89
2 sellers

SIMPLEST

€94
1 seller

This is strategically important.

Optimizing only price is not always the best customer experience.

---

# 24. PARTS SCREEN

Each project should have a parts page.

Show:

Total parts
Unique parts
Estimated cost
Availability status

Search / filter by:

- color
- category
- bag
- build stage
- availability

Each part should display:

- thumbnail
- part name
- part number
- color
- required quantity
- acquired quantity if tracked

Potential later feature:

checkbox:
"I have this part already"

Then BrickMade recalculates required purchasing.

---

# 25. MY BUILDS / PROJECT STATES

A build can exist in several states.

Suggested project states:

DRAFT
UPLOADING
ANALYZING
GENERATING_3D
CONVERTING
VALIDATING
PREVIEW_READY
LOCKED
UNLOCKED
PARTS_READY
READY_TO_BUILD
BUILDING
COMPLETED
FAILED

The UI should translate technical statuses into friendly consumer language.

Example:

GENERATING_3D:
"Creating your model"

VALIDATING:
"Checking buildability"

PARTS_READY:
"Parts list ready"

Do not expose database enum names directly.

---

# 26. PROJECT DATA MODEL — CONCEPTUAL

A Build/Project should conceptually contain:

id
userId
name
description
objectType
status
createdAt
updatedAt

sourcePhotos[]

generationSettings:
- detailLevel
- targetSize
- difficulty
- style
- optimizationPreference

preview:
- previewImages
- modelUrl
- generatedAt

stats:
- pieceCount
- uniquePieceCount
- estimatedBrickCost
- estimatedBuildMinutes
- difficulty
- dimensions

variants[]

parts[]

sortingGroups[]

buildSteps[]

purchasePlan

payment/unlock status

Do not overengineer the database in the first prototype.

But keep clean domain types.

---

# 27. BUILD STEP — CONCEPTUAL DATA

Each build step should be able to contain:

stepNumber

title

description

partsAdded[]

cameraPosition

highlightedPartIds[]

sortingGroupId

modelState / model reference

optional hints

AI context metadata

This allows both:

3D instructions

and

AI Build Assistant

to use the same source of truth.

---

# 28. PART — CONCEPTUAL DATA

A part should eventually contain:

internal ID

external catalog ID

part number

name

geometry

category

color

quantity

estimated unit price

availability

seller references

image/render

Do not rely on text names alone.

Use IDs consistently.

---

# 29. TECHNICAL PIPELINE — LONG TERM

The eventual generation pipeline will approximately be:

Photos
↓
Visual understanding
↓
3D reconstruction
↓
Mesh cleanup / normalization
↓
Object feature detection
↓
Brick representation / voxelization
↓
Brick optimization
↓
Structural validation
↓
Part availability validation
↓
Color matching
↓
Instruction generation
↓
Sorting groups
↓
Parts list
↓
Cost estimate
↓
Shopping optimization

The frontend must NOT depend directly on one particular AI/3D provider.

Use provider abstractions.

For example:

3DGenerationProvider

BrickOptimizationEngine

PartCatalogProvider

ShoppingProvider

BuildAssistantProvider

For the prototype these can use mock implementations.

---

# 30. VERY IMPORTANT TECHNICAL PRINCIPLE

Do not pretend the first prototype contains a real production-grade brick-generation engine if it does not.

Instead:

create clean provider interfaces

and provide deterministic mocked/demo implementations.

The first objective is to prove:

- product UX
- workflow
- interaction patterns
- visual identity
- data model
- frontend architecture

The difficult AI / geometry engine can be integrated later.

Do not block the entire prototype on generating actual production-grade brick models.

---

# 31. FIRST PROTOTYPE STRATEGY

Build a convincing interactive concept around one demo project:

"Compact House"

Use a small, distinctive house with a pitched roof, windows, a front door, and a chimney. Its straight walls and simple forms provide a manageable foundation for model viewing, parts exploration, coherent building steps, and later physical buildability testing.

Default detail level:
Standard

Use a small set of accurate example parts and a coherent sample building sequence. Piece count, unique parts, dimensions, build time, step count, and sorting groups should match the demo data actually implemented. Clearly label sample instructions rather than implying a complete instruction set exists.

The prototype should feel like a functioning product even though generation is mocked. Do not show payments, pricing, cost estimates, ordering, or purchase gates in this private-testing version.

Keep "Porsche 911" as a second showcase for richer shapes and higher detail after the house experience is established. Existing Porsche examples elsewhere in this brief describe that future showcase.

---

# 32. MOBILE-FIRST IMPLEMENTATION

The first product concept should be MOBILE-FIRST.

Primary target viewport:

modern iPhone-sized display.

The interface should also work responsively on desktop later.

Do not design desktop first and shrink it.

Mobile interactions should feel native.

Important:

- large touch targets
- bottom navigation
- clear primary actions
- comfortable spacing
- minimal text density
- bottom sheets where appropriate
- gestures can be considered for 3D later

---

# 33. RECOMMENDED FIRST TECH STACK

Unless the existing repository already dictates otherwise, use:

Next.js
TypeScript
React
Tailwind CSS

Prefer a mobile-first responsive web app / PWA for the initial concept.

Reason:

- quickest path to validation
- can run directly in browser
- easy sharing
- no App Store dependency
- can later become a PWA
- backend can remain shared if native apps are added later

Keep components and domain logic portable.

Potential future native app:
React Native / Expo

But do NOT introduce React Native unless explicitly requested.

---

# 34. BACKEND

For the prototype, avoid unnecessary infrastructure.

Possible later backend:

Supabase

for:

- authentication
- Postgres
- storage
- row-level security

However, if authentication/backend does not yet add value to the concept, start with local/mock data.

Do not let backend work delay the core product experience.

Use repositories/services so mocked data can later be replaced by Supabase/API implementations.

---

# 35. 3D FRONTEND

The architecture should eventually support interactive 3D.

Potential technologies:

Three.js
React Three Fiber

For the initial concept:

If a real 3D model is available, use it.

Otherwise build the UI around a high-quality placeholder image/render while defining a reusable ModelViewer component.

The application should not be tightly coupled to static images.

Expected future ModelViewer functionality:

rotate
zoom
pan
camera presets
part highlighting
step state
exploded placement
ghost previous geometry

---

# 36. DESIGN LANGUAGE

BrickMade should look premium and modern.

Avoid:
- childish primary-color toy aesthetics
- overly colorful dashboards
- gaming UI
- enterprise SaaS look
- complex engineering UI

Aim for:

Apple-like clarity
modern startup polish
warm editorial feel
subtle brick-inspired character

Primary visual direction:

Background:
warm off-white / ivory

Example:
#FAF7F2

Surface:
#FFFFFF
or slightly warm white

Soft secondary surface:
#F4EEE7

Primary text:
near-black / charcoal

Example:
#18181A

Secondary text:
warm gray

Primary accent:
brick / terracotta

Example direction:
#C94E35
or similar

Do not treat these exact hex values as immutable.

Use design tokens.

Rounded corners:
medium-to-large

Cards:
soft, subtle shadow or fine border

Typography:
modern sans serif
strong hierarchy
large confident headings

Avoid excessive gradients.

---

# 37. LOGO

The logo is still being refined.

Do NOT hardcode a complicated logo implementation.

Use a replaceable BrandMark component.

The direction is:

minimal geometric brick-inspired symbol

possibly:
- abstract B
- interlocking forms
- geometric building block

The logo must not visually copy a classic LEGO brick or LEGO branding.

Wordmark:

BrickMade

Keep the logo asset easily replaceable.

---

# 38. MICROCOPY STYLE

Copy should be:

short
confident
human
clear

Avoid:
- technical AI jargon
- exaggerated AI hype
- developer terminology

Good:

"Creating your model"

"Checking buildability"

"Matching real parts"

"Your preview is ready"

Poor:

"Running multimodal reconstruction pipeline"

"Executing voxel optimization"

The complexity should remain invisible.

---

# 39. ERROR STATES

Errors should be helpful.

Example photo problem:

"We couldn't clearly see the rear of your object."

CTA:

"Add a rear photo"

Generation problem:

"We couldn't create a build we're happy with."

CTA:

"Try again"

Avoid generic messages like:

"Error 500"

except in development logging.

---

# 40. DEMO DATA

Create realistic demo data.

Do not fill the interface with Lorem Ipsum.

Suggested demo builds:

Porsche 911
Family House
Golden Retriever
Vintage Camera

Suggested statuses:

Porsche 911:
Ready to build

Family House:
Generating instructions

Golden Retriever:
Ready to build

Vintage Camera:
Processing model

This makes the app feel real.

---

# 41. FIRST SCREENS TO IMPLEMENT

For the first polished concept, prioritize the following screens in this order:

1. Home
2. Create Build / Photo Upload
3. Build Settings
4. Generation Progress
5. Design Preview / Review
6. Parts List
7. Interactive Builder
8. Build Assistant
9. Account / basic settings

The creation, preview, and guided building experience matters most. Unlock / Purchase and Shopping Optimizer screens are deferred beyond the private-testing prototype.

---

# 42. INTERACTIVE DEMO REQUIREMENTS

The prototype should NOT just be static screenshots.

Important interactions should work.

Examples:

Home:
tap Create New Build

Create:
upload/demo-select photos

Settings:
switch detail level

Preview:
detail level changes stats

Generate:
show simulated progress

Review:
rotate or simulate model interaction

Access:
open the parts and builder directly without a purchase gate

Builder:
Previous/Next step

Builder:
show current parts

Builder:
open AI Assistant

AI Assistant:
provide realistic mocked responses

Parts:
filter or inspect part

The app should be convincingly clickable.

---

# 43. MOCK GENERATION

During prototype development, generation should be simulated.

Example:

User starts generation.

Display timed stages such as:

Analyzing photos
Creating model
Designing brick structure
Checking stability
Matching available parts
Creating instructions

After a few seconds:

load the predetermined Compact House demo project.

Keep this behind a GenerationService interface.

Later the service can call real APIs.

---

# 44. AI BUILD ASSISTANT PROTOTYPE

For V1, the Build Assistant can be mocked or use a normal LLM endpoint.

The UI/context contract is more important than sophisticated AI.

The assistant should receive structured context such as:

project
currentStep
currentParts
sortingGroup
previousStep
nextStep

Do not send the entire project history to an LLM unnecessarily.

Keep context narrow.

Example system behavior:

"You are the BrickMade Build Assistant. Help the user complete the current build step using only the provided project, part and instruction data. Never invent part numbers or instructions."

---

# 45. PRIVACY

User photos may contain personal possessions and homes.

Treat uploaded images as private.

Do not imply photos are publicly visible.

Later provide deletion functionality.

Do not use uploaded user content publicly without explicit consent.

---

# 46. SAFETY / IP

BrickMade is an independent product.

Do not claim affiliation with LEGO.

Avoid using protected logos in the UI.

Generated user projects may depict third-party brands and copyrighted objects.

For the first concept this does not need a complex moderation system, but keep project naming/content separate from BrickMade's own branding.

---

# 47. PRODUCT PRINCIPLES

When choosing between two implementations, prefer the one that follows these principles:

1. MAGIC OVER COMPLEXITY
The user sees an object become a build.

2. VISUAL OVER TEXTUAL
Show the model, part or step instead of explaining it with paragraphs.

3. PERSONAL OVER GENERIC
The entire emotional value comes from "this is mine."

4. BUILDABLE OVER BEAUTIFUL
A slightly less accurate model that physically works is better than a perfect render that cannot be built.

5. EASY OVER CHEAPEST
Reducing seller count and complexity may be worth a slightly higher brick price.

6. INTERACTIVE OVER PDF
The app is the building experience.

7. AUTOMATION OVER MANUAL SERVICE
Long-term scalability depends on automated design generation.

8. PREVIEW BEFORE PAYMENT
Show value before asking the user to unlock the complete design.

---

# 48. WHAT NOT TO BUILD YET

Do not overbuild the first concept.

Do NOT prioritize:

- production payment infrastructure
- full BrickLink integration
- actual marketplace transactions
- complete structural solver
- perfect photogrammetry
- real-time computer vision build checking
- social network
- complex notifications
- admin portal
- referral program
- native mobile app
- physical kit fulfillment
- advanced account management

Stub these where needed.

Focus on proving the experience.

---

# 49. DEFINITION OF A STRONG FIRST PROTOTYPE

The prototype is successful if someone can use it and immediately understand:

"I upload photos of something I own."

"BrickMade turns it into a custom brick model."

"I can choose how detailed it should be."

"I see the model before buying."

"I pay around €49.95 for the complete design."

"BrickMade tells me exactly which bricks I need."

"I can buy those bricks."

"Then the app guides me through building it."

"If I'm confused, the AI assistant helps me."

The user should finish the demo thinking:

"I would actually want to do this with my own car/house/pet."

That emotional response matters more than technical completeness.

---

# 50. CODE QUALITY

Build the project as if it may continue into a real product.

Use:

- strict TypeScript
- reusable components
- clean domain types
- clear separation between UI/domain/providers
- accessible controls
- responsive design
- reasonable tests for core logic
- consistent formatting
- environment variables for future API keys

Do not create a huge abstraction layer for hypothetical future requirements.

Prefer simple, clean code.

---

# 51. CODEX WORKING STYLE

When implementing features:

First inspect the existing repository.

Reuse existing patterns when they are good.

Do not unnecessarily rewrite working architecture.

Make sensible product decisions from this brief without stopping for minor clarification.

If an important decision has major architectural consequences, explain the assumption briefly before implementing.

For prototype-only functionality, prefer deterministic mock implementations rather than fake claims of real AI functionality.

Keep TODOs specific.

Bad:

TODO: add AI

Good:

TODO: replace MockGenerationProvider with production image-to-3D provider.

After meaningful changes:

- run lint
- run typecheck
- run relevant tests
- check mobile layout
- fix errors before declaring the task complete.

---

# 52. INITIAL BUILD OBJECTIVE

The first objective is:

Build a polished mobile-first BrickMade product prototype for private testing, centered around the Compact House demo. Keep the Porsche 911 as a second showcase.

Create enough of the complete user journey that the product can be demonstrated from beginning to end:

Home
→ Create
→ Upload
→ Settings
→ Generate
→ Preview
→ Parts
→ Interactive Builder
→ AI Build Assistant

AI generation and Build Assistant responses should initially use deterministic mocks. Payments, pricing, brick cost estimates, and actual ordering are excluded from this prototype; they remain part of the future product vision.

The experience and architecture should nevertheless be designed so those real services can later replace the mocks cleanly.

The final result should look and feel like an early version of a real premium consumer product, not a hackathon demo.