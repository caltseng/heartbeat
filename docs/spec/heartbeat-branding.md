# Approved Heartbeat branding

The owner approved the ping-and-reply H artwork on 2026-11-24. The custom H
starts the Heartbeat wordmark: straight, slightly lengthened verticals, two short
horizontal ping/reply paths, a coral upper-left packet and an ink lower-right
packet, with no endpoint dots.

## Asset decision

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

Alternatives were faithful vectorization, transparent-background extraction and
a monochrome crop. Cropping avoids tracing or background-removal changes to the
approved artwork; the color wordmark retains the approved coral packet. The
opaque warm background is intentional and keeps the ink lettering legible in
both light and dark README themes.

Validation compares every output pixel against its source rectangle, inspects
both rendered crops, verifies local README/asset links and runs `npm run ci`.
Revisit the raster choice if the owner supplies a vector master, requests
transparency, or needs larger output than the original pixels support. Any
replacement must preserve the approved design rather than introduce a redesign.

This is a branding-only decision, not a privacy-policy change or authorization
for source/account access, credentials, collection, remote-AI processing, sending
or schedules.
