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
  children: Array<VNode | string> | undefined; // 子节点数组（与 text 互斥）
  elm: Node | undefined; // DOM 节点
  text: string | undefined; // 文本内容（与 children 互斥）
  key: Key | undefined; // 节点唯一标识：与 Vue v-for 指令设置 key 的目的相同，用于在 Diff 时识别准确的目标节点
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
