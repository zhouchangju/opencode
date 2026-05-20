export type JgyConfig = {
  answer: Record<string, any>
  sourceType?: string
  businessConfig?: Record<string, any>
}

type JgyBlock = {
  id: string
  config: JgyConfig
}

const scriptLoadCache = new Map<string, Promise<void>>()

function loadScript(src: string): Promise<void> {
  if (scriptLoadCache.has(src)) return scriptLoadCache.get(src)!
  if (document.querySelector(`script[src="${src}"]`)) {
    const p = Promise.resolve()
    scriptLoadCache.set(src, p)
    return p
  }
  const p = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script")
    script.src = src
    script.onload = () => resolve()
    script.onerror = reject
    document.head.appendChild(script)
  })
  scriptLoadCache.set(src, p)
  return p
}

function loadStyle(href: string): Promise<void> {
  if (document.querySelector(`link[href="${href}"]`)) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = href
    link.onload = () => resolve()
    link.onerror = reject
    document.head.appendChild(link)
  })
}

let depsLoaded = false
let depsLoading: Promise<void> | undefined

export async function ensureJgyDeps(): Promise<void> {
  if (depsLoaded) return
  if (depsLoading) return depsLoading
  depsLoading = (async () => {
    await loadScript("https://s.thsi.cn/iwencai/js/lib/vuejs/2.5.16/vue.min.js")
    await loadStyle(
      "https://s.thsi.cn/cd/iwc-aime-jgy-materials/jgy/7.88.0/jgyRenderLib.3450696b.css",
    )
    await loadScript(
      "https://s.thsi.cn/cd/iwc-aime-jgy-materials/jgy/7.88.0/jgyRenderLib.324ebb1b.js",
    )
    const Vue = (window as any).Vue
    const jgyRenderLib = (window as any).jgyRenderLib
    if (Vue && jgyRenderLib) {
      Vue.use(jgyRenderLib, { locale: "zh-CN", themeType: "black" })
    }
    depsLoaded = true
  })()
  return depsLoading
}

export function mountJgyChart(container: HTMLElement, config: JgyConfig): any {
  const Vue = (window as any).Vue
  if (!Vue) return undefined

  const answer = JSON.parse(JSON.stringify(config.answer))
  if (!answer) return undefined

  const vm = new Vue({
    template:
      '<jgyRenderSdk :answer="answer" :source-type="sourceType" :business-config="businessConfig"></jgyRenderSdk>',
    data: {
      answer,
      sourceType: config.sourceType ?? "Iwencai",
      businessConfig: config.businessConfig
        ? JSON.parse(JSON.stringify(config.businessConfig))
        : {},
    },
  })
  vm.$mount()
  container.appendChild(vm.$el)
  return vm
}

export function destroyJgyChart(vm: any): void {
  if (vm) {
    vm.$destroy()
  }
}

// Inline ```jgy code block extraction utilities

const JGY_PLACEHOLDER_PREFIX = '<div data-jgy-placeholder="'
const JGY_PLACEHOLDER_SUFFIX = '" style="display:none"></div>'
const jgyBlockRegex = /```jgy\s*\n([\s\S]*?)```/g

export type JgyBlockMap = Map<string, JgyBlock>

export function extractJgyBlocks(
  text: string,
  hashFn: (input: string) => string | undefined,
): { text: string; blocks: JgyBlockMap } {
  const blocks: JgyBlockMap = new Map()
  const processed = text.replace(jgyBlockRegex, (_match, json: string) => {
    const hash = hashFn(json) ?? Date.now().toString(36)
    const id = `jgy_${hash}`
    let parsed: any
    try {
      parsed = JSON.parse(json)
    } catch {
      return _match
    }
    blocks.set(id, {
      id,
      config: {
        answer: parsed.answer ?? parsed,
        sourceType: parsed.sourceType ?? "Iwencai",
        businessConfig: parsed.businessConfig ?? {},
      },
    })
    return `${JGY_PLACEHOLDER_PREFIX}${id}${JGY_PLACEHOLDER_SUFFIX}`
  })
  return { text: processed, blocks }
}

export function isJgyPlaceholder(text: string): boolean {
  return text.includes("data-jgy-placeholder")
}

export function getPlaceholderPattern(id: string): string {
  return `${JGY_PLACEHOLDER_PREFIX}${id}${JGY_PLACEHOLDER_SUFFIX}`
}

export function getPlaceholderPrefix(): string {
  return JGY_PLACEHOLDER_PREFIX
}

export function getPlaceholderSuffix(): string {
  return JGY_PLACEHOLDER_SUFFIX
}

// Mount all jgy placeholders found in a container
export async function mountJgyPlaceholders(
  container: HTMLElement,
  blocks: JgyBlockMap,
  generation: { current: number },
): Promise<Map<string, any>> {
  if (blocks.size === 0) return new Map()

  const vueInstances = new Map<string, any>()

  const placeholderEls = Array.from(
    container.querySelectorAll("[data-jgy-placeholder]"),
  ) as HTMLElement[]
  if (placeholderEls.length === 0) return vueInstances

  const gen = generation.current
  await ensureJgyDeps()
  if (generation.current !== gen) return vueInstances

  for (const placeholderEl of placeholderEls) {
    const id = placeholderEl.getAttribute("data-jgy-placeholder")
    if (!id) continue
    const block = blocks.get(id)
    if (!block) continue

    const parent = placeholderEl.parentNode
    if (!parent) continue

    const wrapper = document.createElement("div")
    wrapper.setAttribute("data-component", "jgy-inline")
    wrapper.setAttribute("data-jgy-id", id)
    parent.replaceChild(wrapper, placeholderEl)

    const vm = mountJgyChart(wrapper, block.config)
    if (vm) {
      vueInstances.set(id, vm)
      ;(wrapper as any)._vueInstance = vm
    }
  }

  return vueInstances
}

export function destroyJgyPlaceholders(container: HTMLElement): void {
  const instances = container.querySelectorAll("[data-component='jgy-inline']")
  instances.forEach((el) => {
    const vm = (el as any)._vueInstance
    if (vm) {
      destroyJgyChart(vm)
      ;(el as any)._vueInstance = undefined
    }
  })
}
