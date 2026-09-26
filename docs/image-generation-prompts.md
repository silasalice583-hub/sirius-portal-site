# 透明插画素材生成记录

本轮使用内置 imagegen，未使用 CLI/API 回退。最终网页素材已保存在 `assets/icons/`；保留生成的 Alpha 通道，只进行裁边、缩放与 WebP 编码，没有把黑色整体当作背景删除。最新展示尺寸为点击图标 24 × 24 CSS px、钢笔 36 × 54 CSS px。

## 本轮最终提示词（逐字记录）

### iris-pen-illustration

输出：`assets/icons/iris-pen-illustration.webp`

```text
A single elegant iris flower fountain pen cursor, simple refined flat illustration, slender blue-teal stem as pen shaft, tiny lavender iris petal flourish at lower end, precise golden fountain nib at UPPER LEFT pointing upper left. Tip at x20% y12% of composition so it can be used as mouse hotspot. Full pen visible, no shadow background. 2:3 portrait composition, isolated with genuine transparent alpha background, no text, no border, no scene. Restrained soft ivory blue lavender gold palette, crisply illustrated, not 3D jewels. Clear silhouette at 28 by 42 pixels.
```

### click-iris-illustration

输出：`assets/icons/click-iris-illustration.webp`

```text
Single tiny iris flower icon, elegant cute flat editorial illustration with lavender blue petals and small teal leaves, refined gold accents. Bold simple silhouette legible at 18 pixels. Centered on genuinely transparent alpha background. No text, no border, no sticker outline, no stars outside, no background, no 3D jewels.
```

### click-lion-illustration

输出：`assets/icons/click-lion-illustration.webp`

```text
Single adorable friendly lion head icon, simple elegant flat editorial illustration with a rounded soft golden mane, ivory muzzle, tiny warm expression. Bold simple silhouette legible at 18 pixels. Centered on genuinely transparent alpha background. No text, no border, no sticker outline, no scene, no 3D jewels.
```

### click-dolphin-illustration

输出：`assets/icons/click-dolphin-illustration.webp`

```text
Single cute leaping dolphin icon, refined simple flat editorial illustration in sky blue and soft ivory, graceful arc and happy small eye. Bold simple silhouette legible at 18 pixels. Centered on genuinely transparent alpha background. No text, no border, no sticker outline, no water background, no 3D jewels.
```

### click-star-illustration

输出：`assets/icons/click-star-illustration.webp`

```text
Single elegant twelve-point star icon with exactly twelve slender rays around a small blue center, alternating pastel gold and sky blue accents. Simple clean flat illustration, bold silhouette legible at 18 pixels. Centered on genuinely transparent alpha background. No text, no border, no scene, no 3D jewels.
```

### skywalker-emblem

输出：`assets/icons/skywalker-emblem.webp`

编辑目标：用户提供的 `DB07BD5836F35EFCF72A0B4A5F3E79B8.png`。只提取中央徽记，不保留原银河背景或人物。

```text
Use case: background-extraction. Edit target: the attached supplied emblem artwork. Extract ONLY the central Jedi/Skywalker-inspired insignia: its symmetric lavender flame/sword spire and gold crescent wings, with the small blue-white central star. Preserve its recognizable silhouette, symmetry and lavender/gold colours. Remove ALL galaxy background, planets, nebula, sky and everything visible through holes. Output one centered isolated clean emblem with genuine transparent alpha background and transparent holes, no opaque black or white regions behind it. No letters. Polished clean simple illustration edges at website icon scale. Keep the star glow very restrained; not a large background haze.
```

## 已继承的星座素材

`assets/constellations/{atlas,pleiades,cassiopeia,gemini,cygnus,perseus,andromeda}.webp` 均来自先前逐张内置生图，使用蓝白恒星与细金色连接、透明底、无照片矩形的设计要求。此处为要求摘要，不冒充逐字提示词；原始结果 ID 记录在 `tools/prepare-celestial-assets.cjs`。程序生成棋盘格验收图并统计角落与内部透明度。它们是导航插画，不是用于观测的精确星图。
