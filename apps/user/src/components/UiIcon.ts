// 图标组件：小程序端统一使用 static/icons 下的 PNG（微信不支持 SVG 渲染）。
Component({
  options: { addGlobalClass: true },
  properties: {
    name: { type: String, value: '' },
    size: { type: Number, value: 20 }
  }
})