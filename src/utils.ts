import path from 'node:path'
import dotenv from 'dotenv'
import fs from 'node:fs'
import { Episode, Picture } from './types'
import Debug from 'debug'
import pico from 'picocolors'
import figures from 'figures'

export const debug = Debug('pica')

/**
 * @param input `all` or `1,3,5-20`
 */
export function selectChapterByInput(input: string, episodes: Episode[]) {
    input = input.trim()

    if (['all', '全部', '所有'].includes(input)) {
        return episodes
    }

    const idx = input
        .split(/[,，]/)
        .reduce((pre: number[], cur: string) => {
            if (!cur) return pre
            if (cur.includes('-')) {
                const index = cur.split('-').map((s) => Number(s))
                for (let i = index[0]; i <= index[1]; i++) {
                    pre.push(i)
                }
            } else {
                pre.push(Number(cur))
            }
            return pre
        }, [])
        .filter((n) => Number.isInteger(n))

    return idx.length !== 0
        ? episodes.filter((_, index) => idx.includes(index + 1))
        : episodes
}

export function isValidComicId(cid: string) {
    return /^[0-9a-zA-Z]{24}$/.test(cid)
}

const DONE_FILE = 'comics/done.txt'
const SKIP_FILE = 'comics/skip.txt'

function readMarks(file: string) {
    const markPath = resolvePath(file)
    if (!fs.existsSync(markPath)) {
        return new Set<string>()
    }
    return new Set(
        fs
            .readFileSync(markPath, 'utf8')
            .split(/\n|\r\n/)
            .filter((x) => x.trim())
            .map((x) => x.trim())
    )
}

function appendMark(file: string, bookId: string, epId: string) {
    const dir = resolvePath('comics')
    fs.mkdirSync(dir, { recursive: true })
    fs.appendFileSync(
        path.join(dir, path.basename(file)),
        `${bookId}/${epId}\n`,
        'utf8'
    )
}

/**
 * 标记某章节已下载完成，并记录到本地临时文件
 */
export function mark(bookId: string, epId: string) {
    appendMark(DONE_FILE, bookId, epId)
}

/**
 * 标记某些章节「不选」，之后会自动跳过（可删除 comics/skip.txt 中的记录恢复）
 */
export function markSkipped(bookId: string, epIds: string[]) {
    if (epIds.length === 0) {
        return
    }
    const marked = readMarks(SKIP_FILE)
    for (const epId of epIds) {
        const key = `${bookId}/${epId}`
        if (marked.has(key)) {
            continue
        }
        appendMark(SKIP_FILE, bookId, epId)
        marked.add(key)
    }
}

/**
 * 过滤掉已下载的章节和标记「不选」的章节
 */
export function filterEpisodes(episodes: Episode[], bookId: string) {
    const done = readMarks(DONE_FILE)
    const skip = readMarks(SKIP_FILE)
    return episodes.filter((ep) => {
        const key = `${bookId}/${ep.id}`
        return !done.has(key) && !skip.has(key)
    })
}

/**
 * 过滤掉某章节下已下载的图片
 * @param title 漫画标题
 * @param epTitle 章节标题
 */
export function filterPictures(
    pictures: Picture[],
    title: string,
    epTitle: string
) {
    const dir = resolvePath(
        'comics',
        normalizeName(title),
        normalizeName(epTitle)
    )
    if (!fs.existsSync(dir)) {
        return pictures
    }
    const files = fs.readdirSync(dir)
    return pictures.filter((pic) => !files.includes(pic.name))
}

export function loadEnv() {
    const env = resolvePath('.env.local')
    if (fs.existsSync(env)) {
        dotenv.config({
            path: env
        })
    }
}

export function resolvePath(...args: string[]) {
    return path.resolve(process.cwd(), ...args)
}

/**
 * 将 Windows 文件和文件夹名称不允许的特殊字符替换为合法字符。
 *
 * 超长目录名会在 Linux 上创建失败，这里限制最长 85
 */
export function normalizeName(s: string) {
    return s
        .trim()
        .replace(/\//g, '／')
        .replace(/\\/g, '＼')
        .replace(/\?/g, '？')
        .replace(/\|/g, '︱')
        .replace(/"/g, '＂')
        .replace(/\*/g, '＊')
        .replace(/</g, '＜')
        .replace(/>/g, '＞')
        .replace(/:/g, '-')
        .slice(0, 85)
}

// √ ✕
export const log = {
    log: (...msg: unknown[]) => console.log(...msg),
    info: (...msg: unknown[]) => console.log(pico.cyan('➡️'), ...msg),
    warn: (...msg: unknown[]) =>
        console.log(pico.yellow(`${figures.warning} ${msg.join(' ')}`)),
    error: (...msg: unknown[]) =>
        console.log(pico.red(`${figures.cross} ${msg.join(' ')}`)),
    success: (...msg: unknown[]) =>
        console.log(pico.green(`${figures.tick} ${msg.join(' ')}`))
}

export function sleep(s: number) {
    return new Promise((r) => setTimeout(r, s * 1000))
}
