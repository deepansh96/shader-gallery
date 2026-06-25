# Interactive Gallery Items Own Their Runtime Concerns Until a Second Consumer

Starting with Shader Lockpicking, an interactive Gallery Item that needs postprocessing (bloom, spectral color), drag interaction, its own camera, and live puzzle state keeps all of that **inside the item** rather than in the shared Shader Template. The Template stays a thin scene host with no EffectComposer, interaction-state, or game-loop machinery. We chose local-first over building these as shared Template capabilities because there is only one consumer today; reshaping the shared runtime (and adding risk to Template Lab) for a single item is premature. A capability is promoted into the Shader Template only when a second Gallery Item genuinely needs it.

## Status

accepted

## Considered Options

- **Shared-first**: add an optional bloom/postprocessing pipeline, interaction layer, and runtime-state model to the Shader Template now, so future items inherit them. Rejected for v1: it reshapes the shared runtime around a single consumer, makes every item pay an abstraction it may not use, and adds regression risk to the existing Template Lab.
- **Local-first (chosen)**: the item owns its runtime concerns; promote to shared only on the second real consumer.

## Consequences

- The second interactive item may temporarily duplicate bloom/interaction code; that duplication is the signal to promote the capability into the Template, not a defect to pre-empt.
- A future reader will see bloom and puzzle state living inside an item instead of the Template — this ADR explains why that is deliberate.
