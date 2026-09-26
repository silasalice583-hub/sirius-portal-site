# 星空背景素材与来源

网页只加载压缩 WebP 与对应的 -mobile.webp。保留照片比例和色彩，不放大源文件冒充更高分辨率。页面使用全尺寸背景照片，分类按钮本身不再带矩形照片。

## 当前使用

| 文件名（均含手机版） | 桌面尺寸 | 来源说明 |
| --- | --- | --- |
| pleiades-cluster.webp | 4096×2952 | 用户提供的完整昂宿星团原图。与 [NASA 2025 年 TESS 新闻配图](https://svs.gsfc.nasa.gov/14928/) 的 Palomar 彩色合成图对应；NASA, ESA, AURA/Caltech。网页更新日期不代表新拍摄日期。 |
| pillars-hd.webp | 2365×4096 | 用户提供的 3840×6651 原图；[Webb 创世之柱 NIRCam](https://science.nasa.gov/asset/webb/pillars-of-creation-nircam-image/)，2022 年发布，NASA, ESA, CSA, STScI。不使用此前偏小的网页版本。 |
| gemini-sky.webp（保留、背景停用） | 1365×2048 | 用户提供的“特色圖片.jpg”，完整双子座星空及连线。按最新要求，背景改用下列 Medusa 备选，避免竖图在横屏上的黑边与星座裁切。 |
| andromeda-m31.webp | 3000×1971 | 用户提供的完整 M31 可见光照片；取代不对应的木星和旧背景，原摄影署名未随文件提供。 |
| sirius-sky.webp | 3758×4000 | [ESA/Hubble Sirius ground-based image](https://esahubble.org/images/heic0516e/)，2005 年发布。ESA/Hubble and Digitized Sky Survey 2；Acknowledgements: Davide De Martin。文章/冥想使用此观测图。 |
| sirius-artwork.webp | 3840×2880 | 用户明确指定的 Sirius_A_and_B_artwork.jpg。**艺术想象图，不是望远镜实拍**；仅用于首页与地球轮播，未作为天文观测照片宣传。 |
| earth.webp | 2400×2400 | [NASA Earth / PIA18033](https://science.nasa.gov/photojournal/earth/)。 |
| milky-way-center.webp | 3840×1920 | [NASA 银河中心多波段影像](https://science.nasa.gov/image-detail/hubble-spitzer-chandra-milkywaycenter-stsci-01evt5dw8r3b3vzyxy425t78dp/)；NASA, ESA, SSC, CXC, STScI。 |
| milky-way-mountains.webp | 1540×866 | 用户本次提供的 1540x866.jpg，雪山与银河；未提供原摄影署名，不放大源图。 |
| milky-way-panorama.webp | 3840×1920 | 用户本次提供的 ESO_-_Milky_Way.jpg，银河全天全景；仅按提供的文件使用，未另行推定拍摄日期。 |
| milky-way-nevada.webp | 2912×4078 | 用户本次提供的 Milky_Way_Night_Sky_Black_Rock_Desert_Nevada.jpg，荒漠银河竖幅。 |
| milky-way-spitzer.webp | 3501×2525 | 用户本次提供的 Milky_Way_IR_Spitzer.jpg，红外银河影像。 |
| medusa-nebula.webp | 3293×3430 | 用户随后提供并明确允许的双子座背景备选图 2：ESO_Very_Large_Telescope_images_the_Medusa_Nebula.jpg。作为星云背景铺满，不把它标成双子座全星图；分类图标不变。 |
| notre-dame-paris.webp | 4096×2705 | 用户提供的 Notre-Dame_de_Paris,_4_October_2017.jpg；关于页全屏背景，叠加代码生成的生命之花。 |

“高清更新”指换用核对对象后的较大原图及清晰网页版本，不声称所有图像均拍摄于 2026 年。选定整幅 M31 和双子座图像以保留用户要求的构图。

2026-09-26 追加：四张银河图加入“全部文章”和冥想页背景轮播；会议分类也加入银河全景。首页仍为地球/天狼星双图。用户随后要求取消双子座完整适配的黑边，因此采用其指定 Medusa 备选，所有背景恢复 `cover` 铺满。关于页仅使用巴黎圣母院，不参与星空轮换。图片按场景逐张加载，不同时预载所有高分辨率背景；过时的慢请求不能覆盖当前场景。

随后缩放微调：Medusa、Nevada 两张竖图在横屏使用完整高度的等比清晰主画面，左右由同图柔和延展铺满，边缘渐隐衔接；只以 6px 模糊延展层，不模糊中央照片，不引入黑边或拉伸。手机竖屏继续铺满，Medusa 焦点为横向 32%，Nevada 为横向 58% / 纵向 90%，保留银河及地平线；纵向 90% 锚点还让横屏两层的地平线大体对齐。方向切换由视口比例媒体规则自动响应，其他背景不受影响；原始图片未改动。

## 停用与保留

木星已从所有运行场景移除。旧木星、Merope 局部、旧仙女座和小尺寸创世之柱等原始文件仅留在本地，不进入本次新增发布文件；没有删除用户原始素材。

导航星座和鼠标图标是 AI 插画，与以上摄影分开保存在 assets/constellations 与 assets/icons。来源不表示相关天文机构认可本站内容；NASA 媒体遵循其[使用指南](https://www.nasa.gov/nasa-brand-center/images-and-media/)。
