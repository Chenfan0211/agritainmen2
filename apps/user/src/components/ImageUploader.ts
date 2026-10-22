// 图片上传组件：wx.chooseMedia 选取 → 落盘到 wx.env.USER_DATA_PATH → 生成 asset 引用 → change 回写。
// 行为实现统一在 @agritainment/shared，本文件只做平台绑定。
import { createImageUploaderComponent } from '@agritainment/shared'

Component(createImageUploaderComponent())