import { describe, expect, it } from 'vitest'
import type { Episode } from '../src/types'
import {
    applyAction,
    countSelection,
    createState,
    toResult,
    visibleRange
} from '../src/chapter-select'

function makeEpisodes(count: number): Episode[] {
    return Array.from({ length: count }, (_, i) => ({
        id: `ep${i + 1}`,
        title: `第 ${i + 1} 话`,
        order: i + 1,
        updated_at: '2024-01-01T00:00:00.000Z'
    }))
}

describe('章节选择状态机', () => {
    it('空格选中当前项，再按一次取消', () => {
        let state = createState(makeEpisodes(3))
        state = applyAction(state, 'toggle')
        expect(state.entries[0].selected).toBe(true)

        state = applyAction(state, 'toggle')
        expect(state.entries[0].selected).toBe(false)
    })

    it('x 标记当前项「不选」，并取消它的勾选', () => {
        let state = createState(makeEpisodes(3))
        state = applyAction(state, 'toggle')
        state = applyAction(state, 'skip')

        expect(state.entries[0]).toMatchObject({
            selected: false,
            skipped: true
        })

        // 再按一次 x 取消「不选」
        state = applyAction(state, 'skip')
        expect(state.entries[0].skipped).toBe(false)
    })

    it('X 全不选：清空勾选并全部标记跳过', () => {
        let state = createState(makeEpisodes(3))
        state = applyAction(state, 'select-all')
        state = applyAction(state, 'skip-all')

        expect(countSelection(state)).toEqual({
            selected: 0,
            skipped: 3,
            total: 3
        })
    })

    it('a 全选会清空「不选」标记', () => {
        let state = createState(makeEpisodes(2))
        state = applyAction(state, 'skip-all')
        state = applyAction(state, 'select-all')

        expect(countSelection(state)).toEqual({
            selected: 2,
            skipped: 0,
            total: 2
        })
    })

    it('i 反选不影响已标记「不选」的章节', () => {
        let state = createState(makeEpisodes(3))
        state = applyAction(state, 'down')
        state = applyAction(state, 'skip')
        state = applyAction(state, 'select-all')
        state = applyAction(state, 'skip') // 光标在第 2 项，重新标记跳过
        state = applyAction(state, 'invert')

        expect(state.entries[0].selected).toBe(false)
        expect(state.entries[1]).toMatchObject({
            selected: false,
            skipped: true
        })
        expect(state.entries[2].selected).toBe(false)
    })

    it('光标移动支持循环和页码翻页', () => {
        let state = createState(makeEpisodes(3))
        state = applyAction(state, 'up')
        expect(state.cursor).toBe(2)

        state = applyAction(state, 'down')
        expect(state.cursor).toBe(0)

        state = applyAction(state, 'page-down')
        expect(state.cursor).toBe(3 - 1)
    })

    it('toResult 区分待下载和永久跳过', () => {
        let state = createState(makeEpisodes(3))
        state = applyAction(state, 'toggle')
        state = applyAction(state, 'down')
        state = applyAction(state, 'skip')

        const result = toResult(state)
        expect(result.selected.map((ep) => ep.id)).toEqual(['ep1'])
        expect(result.skipped.map((ep) => ep.id)).toEqual(['ep2'])
    })

    it('可见窗口跟随光标滚动', () => {
        let state = createState(makeEpisodes(20), { pageSize: 5 })
        expect(visibleRange(state)).toEqual({ start: 0, end: 5 })

        state = { ...state, cursor: 19 }
        expect(visibleRange(state)).toEqual({ start: 15, end: 20 })
    })
})
