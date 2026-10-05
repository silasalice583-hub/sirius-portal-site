# October artwork delivery

Original files in `assets/改图1` remain unchanged. `prepare-october-artwork.cjs` retains source alpha and colours, removes only transparent padding and optimizes web dimensions.

In `assets/artwork-october/`, images 1–5 map to `portal-title`, `nav-home`, `nav-articles`, `nav-meditation`, `nav-about`; image 8 maps to `flower-spectrum`. Backgrounds `assets/space/about-sakura[-mobile].webp` and `about-paris[-mobile].webp` use images 6 and 7. Image 10 matches existing `assets/icons/skywalker-emblem.webp`, now shown without the old extra halo.

`excalibur-cursor.webp` uses image 9, extracted with built-in imagegen (transparent_background=true) then resized. The generated source remains in the user's Codex generated_images folder; the website uses only the workspace copy.

Final generation prompt:

> Use case: background-extraction. Edit target: attached sword image. Asset: small website mouse cursor. Isolate ONLY the complete Excalibur sword from tip through pommel, upright and centered, tip pointing up. Remove black background, all circular sigils, surrounding graphics and all text. Keep original straight slender ivory/silver blade, golden guard and ornament, dark blue grip, original proportions and clean sharp outline. No added object, no redesign. Actual transparent alpha everywhere except sword; tight framing with small transparent padding, no cast shadow. Sword should remain recognisable at 48 CSS pixels tall.
