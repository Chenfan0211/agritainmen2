Component({
  properties: {
    name: { type: String, value: '' },
    size: { type: Number, value: 20 }
  },
  data: {
    iconSrc: '/static/icons/package.png',
    iconStyle: 'width:20px;height:20px;'
  },
  observers: {
    'name, size'(this: any, name: string, size: number) {
      this.setData({
        iconSrc: `/static/icons/${name || 'package'}.png`,
        iconStyle: `width:${Number(size) || 20}px;height:${Number(size) || 20}px;`
      })
    }
  },
  lifetimes: {
    attached(this: any) {
      this.setData({
        iconSrc: `/static/icons/${this.data.name || 'package'}.png`,
        iconStyle: `width:${this.data.size || 20}px;height:${this.data.size || 20}px;`
      })
    }
  }
})
