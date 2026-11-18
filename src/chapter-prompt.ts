import readline from 'node:readline'
import pico from 'picocolors'
import {
    applyAction,
    createState,
    toResult,
    visibleRange
} from './chapter-select'
import type {
    ChapterAction,
    ChapterSelection,
    ChapterSelectState
} from './chapter-select'
import type { Episode } from './types'

const ESC = '\x1b['
const HIDE_CURSOR = `${ESC}?25l`
const SHOW_CURSOR = `${ESC}?25h`

/** 按键提示，风格与 index.ts 里的 checkboxHelpTip 一致 */
const keysTip = [
    `${pico.cyan('<space>')} 选中`,
    `${pico.cyan('<a>')} 全选`,
    `${pico.cyan('<i>')} 反选`,
    `${pico.cyan('<x>')} 不选`,
    `${pico.cyan('<X>')} 全不选`,
    `${pico.cyan('<enter>')} 确认`
]
const instructions = ` (${keysTip.join(', ')})`

export interface ChapterPromptOptions {
    message: string
    episodes: Episode[]
    pageSize?: number
    loop?: boolean
}

function isFullWidth(code: number) {
    return (
        (code >= 0x1100 && code <= 0x115f) ||
        (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
        (code >= 0xac00 && code <= 0xd7a3) ||
        (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0xfe30 && code <= 0xfe6f) ||
        (code >= 0xff00 && code <= 0xff60) ||
        (code >= 0xffe0 && code <= 0xffe6) ||
        (code >= 0x1f300 && code <= 0x1f64f) ||
        (code >= 0x1f900 && code <= 0x1f9ff) ||
        (code >= 0x20000 && code <= 0x3fffd)
    )
}

function displayWidth(text: string) {
    let width = 0
    for (const char of text) {
        width += isFullWidth(char.codePointAt(0) ?? 0) ? 2 : 1
    }
    return width
}

function stripAnsi(text: string) {
    let out = ''
    let i = 0
    while (i < text.length) {
        if (text[i] === '\u001b' && text[i + 1] === '[') {
            const end = text.indexOf('m', i)
            if (end === -1) break
            i = end + 1
            continue
        }
        out += text[i]
        i += 1
    }
    return out
}

/**
 * 按终端显示宽度截断，避免换行导致重绘错位（中文/emoji 占两个字符宽）
 */
function truncateToWidth(text: string, maxWidth: number) {
    if (maxWidth <= 0) return ''
    let width = 0
    let out = ''
    for (const char of text) {
        const w = isFullWidth(char.codePointAt(0) ?? 0) ? 2 : 1
        if (width + w > maxWidth) {
            return width + 1 <= maxWidth ? `${out}…` : out
        }
        out += char
        width += w
    }
    return out
}

/**
 * 按终端显示宽度截断，保留 ANSI 颜色序列
 */
function truncateAnsiToWidth(text: string, maxWidth: number) {
    let width = 0
    let out = ''
    let hasAnsi = false
    let i = 0
    while (i < text.length) {
        if (text[i] === '\u001b' && text[i + 1] === '[') {
            const end = text.indexOf('m', i)
            if (end === -1) break
            out += text.slice(i, end + 1)
            hasAnsi = true
            i = end + 1
            continue
        }
        const char = String.fromCodePoint(text.codePointAt(i) as number)
        const w = isFullWidth(char.codePointAt(0) as number) ? 2 : 1
        if (width + w > maxWidth) break
        out += char
        width += w
        i += char.length
    }
    if (i < text.length) {
        out += width + 1 <= maxWidth ? '…' : ''
        if (hasAnsi) out += '\u001b[0m'
    }
    return out
}

function buildLines(state: ChapterSelectState, message: string, width: number) {
    const maxWidth = Math.max(1, width - 1)
    const prefix = `${pico.green('?')} `
    const title = truncateToWidth(message, Math.max(4, maxWidth - 2))
    const header = `${prefix}${title}`

    const lines: string[] = []
    const titleShown = displayWidth(title) >= displayWidth(message)
    const headerWidth = displayWidth(stripAnsi(header))
    const instructionWidth = displayWidth(stripAnsi(instructions))
    if (titleShown && headerWidth + instructionWidth <= maxWidth) {
        lines.push(header + instructions)
    } else {
        lines.push(header)
        lines.push(truncateAnsiToWidth(instructions, maxWidth))
    }

    const { start, end } = visibleRange(state)
    for (let i = start; i < end; i++) {
        const entry = state.entries[i]
        const cursor = i === state.cursor ? pico.cyan('❯') : ' '
        const mark = entry.skipped
            ? '⊘'
            : entry.selected
              ? pico.green('◉')
              : '◯'
        const label = truncateToWidth(entry.label, Math.max(1, width - 6))
        lines.push(`${cursor} ${mark} ${label}`)
    }

    return lines
}

function mapKey(
    key: readline.Key
): ChapterAction | 'confirm' | 'cancel' | null {
    const name = key.name
    if (key.ctrl && name === 'c') return 'cancel'
    if (name === 'escape') return 'cancel'

    switch (name) {
        case 'up':
        case 'k':
            return 'up'
        case 'down':
        case 'j':
            return 'down'
        case 'pageup':
            return 'page-up'
        case 'pagedown':
            return 'page-down'
        case 'home':
            return 'home'
        case 'end':
            return 'end'
        case 'space':
            return 'toggle'
        case 'return':
        case 'enter':
            return 'confirm'
        case 'a':
            return key.shift ? null : 'select-all'
        case 'i':
            return key.shift ? null : 'invert'
        case 'x':
            return key.shift ? 'skip-all' : 'skip'
        default:
            return null
    }
}

/**
 * 交互式选择章节
 *
 * 相比 `@inquirer/checkbox` 多了 `x`（当前章节不选）和 `X`（全不选），
 * 被标记「不选」的章节由调用方持久化，之后自动跳过。
 */
export function selectChapters(
    options: ChapterPromptOptions
): Promise<ChapterSelection | null> {
    const { message, episodes, pageSize = 10, loop = true } = options

    if (episodes.length === 0) {
        return Promise.resolve({ selected: [], skipped: [] })
    }

    const stdin = process.stdin
    if (!stdin.isTTY) {
        // 非交互环境（管道/CI）下保持旧行为：全部下载
        return Promise.resolve({ selected: episodes, skipped: [] })
    }

    let state = createState(episodes, { pageSize, loop })
    let renderedLines = 0
    let finished = false
    const wasRaw = Boolean(stdin.isRaw)

    return new Promise<ChapterSelection | null>((resolve) => {
        const draw = () => {
            const width = Math.max(40, process.stdout.columns || 80)
            const content = buildLines(state, message, width)
            let out = ''
            if (renderedLines > 0) {
                out += `${ESC}${renderedLines}A\r${ESC}0J`
            }
            out += content.map((line) => `${line}\n`).join('')
            process.stdout.write(out)
            renderedLines = content.length
        }

        const clear = () => {
            if (renderedLines > 0) {
                process.stdout.write(`${ESC}${renderedLines}A\r${ESC}0J`)
                renderedLines = 0
            }
        }

        const onKeypress = (_str: string, key: readline.Key) => {
            const action = mapKey(key)
            if (!action) return
            if (action === 'cancel') {
                finish(null)
                return
            }
            if (action === 'confirm') {
                finish(toResult(state))
                return
            }
            state = applyAction(state, action)
            draw()
        }

        const cleanup = () => {
            stdin.removeListener('keypress', onKeypress)
            stdin.setRawMode(wasRaw)
            stdin.pause()
            process.stdout.write(SHOW_CURSOR)
            clear()
        }

        const finish = (result: ChapterSelection | null) => {
            if (finished) return
            finished = true
            cleanup()
            if (result) {
                process.stdout.write(`${pico.green('✔')} ${message}\n`)
            }
            resolve(result)
        }

        readline.emitKeypressEvents(stdin)
        stdin.setRawMode(true)
        stdin.resume()
        stdin.on('keypress', onKeypress)
        process.stdout.write(HIDE_CURSOR)
        draw()
    })
}
