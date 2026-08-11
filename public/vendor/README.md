# Third-party layout runtime

This directory vendors unmodified browser distributions used by the LED wall:

- Packery 3.0.0 — MIT — https://github.com/metafizzy/packery
- imagesLoaded 5.0.0 — MIT — https://github.com/desandro/imagesloaded
- Lodash 4.18.1 — MIT — https://github.com/lodash/lodash

Packery performs the bin-packing placement. imagesLoaded triggers the official Packery relayout flow after signature images load. Lodash provides the shuffle used to distribute signatures across Packery slots.
