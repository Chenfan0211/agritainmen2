// 微信小程序运行时最小类型声明：仓库不引入 miniprogram-api-typings（避免新增依赖与锁文件变更），
// 因此这里只声明用户端实际使用的 wx.* 能力，写错 API 名或参数时 tsc 仍会报错。
interface WxChooseMediaSuccessResult {
  tempFiles: Array<{ tempFilePath: string; size: number; fileType: string }>
  type: string
}

interface WxChooseMediaOptions {
  count?: number
  mediaType?: string[]
  sourceType?: string[]
  sizeType?: string[]
  camera?: string
  success?: (result: WxChooseMediaSuccessResult) => void
  fail?: (error: unknown) => void
  complete?: () => void
}

interface WxGetImageInfoSuccessResult {
  width: number
  height: number
  path: string
  orientation?: string
  type?: string
}

interface WxFileSystemManager {
  mkdir(options: { dirPath: string; recursive?: boolean; success?: () => void; fail?: (error: unknown) => void; complete?: () => void }): void
  writeFile(options: { filePath: string; data: ArrayBuffer | string; encoding?: string; success?: () => void; fail?: (error: unknown) => void }): void
  readFile(options: { filePath: string; encoding?: string; success?: (result: { data: ArrayBuffer | string }) => void; fail?: (error: unknown) => void }): void
  unlink(options: { filePath: string; success?: () => void; fail?: (error: unknown) => void }): void
}

interface WxWindowInfo {
  statusBarHeight?: number
  windowWidth: number
  windowHeight: number
  pixelRatio: number
  safeArea?: { top: number; bottom: number; height: number }
}

interface WxLaunchOptions {
  path: string
  query: Record<string, string>
  scene: number
}

interface WxApi {
  env: { USER_DATA_PATH: string }
  getStorageSync(key: string): unknown
  setStorageSync(key: string, value: unknown): void
  removeStorageSync(key: string): void
  getFileSystemManager(): WxFileSystemManager
  chooseMedia(options: WxChooseMediaOptions): void
  getImageInfo(options: { src: string; success?: (result: WxGetImageInfoSuccessResult) => void; fail?: (error: unknown) => void }): void
  previewImage(options: { current?: string; urls: string[] }): void
  showToast(options: { title: string; icon?: string; duration?: number }): void
  setClipboardData(options: { data: string; success?: () => void; fail?: (error: unknown) => void }): void
  navigateTo(options: { url: string; success?: () => void; fail?: (error: unknown) => void }): void
  navigateBack(options?: { delta?: number }): void
  getLaunchOptionsSync(): WxLaunchOptions
  getWindowInfo(): WxWindowInfo
  getSystemInfoSync(): WxWindowInfo
}

declare const wx: WxApi

interface WxComponentPropertyDefinition {
  type: unknown
  value?: unknown
  observer?: (newValue: unknown, oldValue: unknown) => void
}

interface WxComponentInstance {
  data: Record<string, any>
  properties: Record<string, any>
  setData(patch: Record<string, unknown>, callback?: () => void): void
  triggerEvent(name: string, detail?: unknown, options?: { bubbles?: boolean; composed?: boolean }): void
  selectComponent(selector: string): unknown
}

declare function App(options: Record<string, any>): void
declare function Page(options: Record<string, any>): void
declare function Component(options: Record<string, any>): void
declare function getApp<T = Record<string, any>>(): T
declare function getCurrentPages(): Array<Record<string, any>>