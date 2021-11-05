import { Hooks } from './hooks'
import { AttachData } from './helpers/attachto'
import { VNodeStyle } from './modules/style'
import { On } from './modules/eventlisteners'
import { Attrs } from './modules/attributes'
import { Classes } from './modules/class'
import { Props } from './modules/props'
import { Dataset } from './modules/dataset'
import { Hero } from './modules/hero'

export type Key = string | number

// VNode 数据模型
export interface VNode {
  sel: string | undefined; // selector
  data: VNodeData | undefined; // 属性、样式、事件等数据
  children: Array<VNode | string> | undefined; // 所有子节点
  elm: Node | undefined; // 元素（element）节点
  text: string | undefined; // 文本（text）节点
  key: Key | undefined; // 唯一标识
}

// 上面的 VNode.data 数据模型
export interface VNodeData {
  props?: Props // 组件属性
  attrs?: Attrs // HTML 元素属性
  class?: Classes // class 样式
  style?: VNodeStyle // style 样式
  dataset?: Dataset // data-属性
  on?: On // 事件
  hero?: Hero
  attachData?: AttachData
  hook?: Hooks // 钩子
  key?: Key
  ns?: string // for SVGs
  fn?: () => VNode // for thunks
  args?: any[] // for thunks
  [key: string]: any // for any other 3rd party module
}

// 创建 VNode 实例的函数
export function vnode (sel: string | undefined,
  data: any | undefined,
  children: Array<VNode | string> | undefined,
  text: string | undefined,
  elm: Element | Text | undefined): VNode {
  const key = data === undefined ? undefined : data.key
  return { sel, data, children, text, elm, key }
}
