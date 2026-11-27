# Approved Heartbeat branding

The owner approved the ping-and-reply H artwork on 2026-11-24. The custom H
starts the Heartbeat wordmark: straight, slightly lengthened verticals, two short
horizontal ping/reply paths, a coral upper-left packet and an ink lower-right
packet, with no endpoint dots.

## Approved asset crops

Use lossless PNG crops of the approved 1536 by 1024 presentation image, not a
redrawn logo or the labeled board. Coordinates below are zero-based source
pixels, with width and height in pixels:

| Asset | x | y | Width | Height |
| --- | ---: | ---: | ---: | ---: |
| [README wordmark](../assets/heartbeat-wordmark.png) | 292 | 429 | 972 | 180 |
| [Standalone H](../assets/heartbeat-icon.png) | 631 | 76 | 274 | 252 |

This delegated engineering decision preserves the approved shapes, lettering,
colors and warm background exactly, with modest padding and without labels or
resampling. The README uses the complete color wordmark with descriptive alt
text and a repository-relative path. No image or font dependency is required.

The opaque warm background preserves legibility in light/dark themes.
The generated contacts dashboard embeds the complete approved wordmark as a
PNG data URL, with descriptive alt text and proportional sizing. No companion
logo file or network access is needed to open the saved dashboard offline.
Engineering alternatives, pixel validation and revisit conditions are recorded
in the [central history](../decisions.md#branding).

This is a branding-only decision, not a privacy-policy change or authorization
for source/account access, credentials, collection, remote-AI processing, sending
or schedules.
