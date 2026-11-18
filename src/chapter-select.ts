import type { Episode } from './types'

/**
 * 章节在选择列表中的状态
 */
export interface ChapterEntry {
    episode: Episode
    label: string
    /** 本次勾选下载 */
    selected: boolean
    /** 标记「不选」，确认后写入 comics/skip.txt 永久跳过 */
    skipped: boolean
}

export interface ChapterSelectState {
    entries: ChapterEntry[]
    cursor: number
    pageSize: number
    /** 光标到首/尾时是否循环 */
    loop: boolean
}

export type ChapterAction =
    | 'up'
    | 'down'
    | 'page-up'
    | 'page-down'
    | 'home'
    | 'end'
    | 'toggle'
    | 'select-all'
    | 'invert'
    | 'skip'
    | 'skip-all'

/** 确认后的选择结果 */
export interface ChapterSelection {
    selected: Episode[]
    skipped: Episode[]
}

export interface ChapterStat {
    selected: number
    skipped: number
    total: number
}

function clamp(n: number, min: number, max: number) {
    return Math.min(Math.max(n, min), max)
}

export function createState(
    episodes: Episode[],
    options: { pageSize?: number; loop?: boolean } = {}
): ChapterSelectState {
    return {
        entries: episodes.map((episode) => ({
            episode,
            label: (episode.title || '').trim(),
            selected: false,
            skipped: false
        })),
        cursor: 0,
        pageSize: Math.max(1, options.pageSize ?? 10),
        loop: options.loop ?? true
    }
}

function updateEntry(
    state: ChapterSelectState,
    index: number,
    patch: Partial<Pick<ChapterEntry, 'selected' | 'skipped'>>
): ChapterSelectState {
    return {
        ...state,
        entries: state.entries.map((entry, i) =>
            i === index ? { ...entry, ...patch } : entry
        )
    }
}

export function applyAction(
    state: ChapterSelectState,
    action: ChapterAction
): ChapterSelectState {
    const total = state.entries.length
    if (total === 0) {
        return state
    }

    switch (action) {
        case 'up':
            return state.cursor > 0
                ? { ...state, cursor: state.cursor - 1 }
                : state.loop
                  ? { ...state, cursor: total - 1 }
                  : state
        case 'down':
            return state.cursor < total - 1
                ? { ...state, cursor: state.cursor + 1 }
                : state.loop
                  ? { ...state, cursor: 0 }
                  : state
        case 'page-up':
            return {
                ...state,
                cursor: clamp(state.cursor - state.pageSize, 0, total - 1)
            }
        case 'page-down':
            return {
                ...state,
                cursor: clamp(state.cursor + state.pageSize, 0, total - 1)
            }
        case 'home':
            return { ...state, cursor: 0 }
        case 'end':
            return { ...state, cursor: total - 1 }
        case 'toggle': {
            const current = state.entries[state.cursor]
            const selected = !current.selected
            return updateEntry(state, state.cursor, {
                selected,
                skipped: selected ? false : current.skipped
            })
        }
        case 'skip': {
            const current = state.entries[state.cursor]
            const skipped = !current.skipped
            return updateEntry(state, state.cursor, {
                skipped,
                selected: skipped ? false : current.selected
            })
        }
        case 'select-all':
            return {
                ...state,
                entries: state.entries.map((entry) => ({
                    ...entry,
                    selected: true,
                    skipped: false
                }))
            }
        case 'invert':
            return {
                ...state,
                entries: state.entries.map((entry) =>
                    entry.skipped
                        ? entry
                        : { ...entry, selected: !entry.selected }
                )
            }
        case 'skip-all':
            return {
                ...state,
                entries: state.entries.map((entry) => ({
                    ...entry,
                    selected: false,
                    skipped: true
                }))
            }
        default:
            return state
    }
}

export function countSelection(state: ChapterSelectState): ChapterStat {
    let selected = 0
    let skipped = 0
    for (const entry of state.entries) {
        if (entry.skipped) {
            skipped++
        } else if (entry.selected) {
            selected++
        }
    }
    return { selected, skipped, total: state.entries.length }
}

export function toResult(state: ChapterSelectState): ChapterSelection {
    const selected: Episode[] = []
    const skipped: Episode[] = []
    for (const entry of state.entries) {
        if (entry.skipped) {
            skipped.push(entry.episode)
        } else if (entry.selected) {
            selected.push(entry.episode)
        }
    }
    return { selected, skipped }
}

/**
 * 当前可见窗口（用于渲染，光标尽量保持在窗口中间）
 */
export function visibleRange(state: ChapterSelectState) {
    const total = state.entries.length
    const size = Math.min(state.pageSize, total)
    const start = clamp(
        state.cursor - Math.floor(size / 2),
        0,
        Math.max(0, total - size)
    )
    return { start, end: start + size }
}
