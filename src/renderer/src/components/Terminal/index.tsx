import React, { useEffect, useRef, useState } from 'react'
import { Spin } from 'antd'
import { Terminal as XTerminal } from '@xterm/xterm'
import type { ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import '@xterm/xterm/css/xterm.css'

import './index.css'

interface TerminalProps {
  sessionId: string
  isActive: boolean
  fontSize?: number
  terminalBackground?: 'black' | 'white' | 'theme'
  effectiveTheme?: 'light' | 'dark'
}

const DARK_THEME: ITheme = {
  background: '#181a1b',
  foreground: '#d4d4d4',
  cursor: '#d4d4d4',
  cursorAccent: '#181a1b',
  selectionBackground: '#264f78',
  selectionForeground: '#ffffff',
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d917',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#ffffff',
}

const LIGHT_THEME: ITheme = {
  background: '#ffffff',
  foreground: '#1d1d1f',
  cursor: '#1d1d1f',
  cursorAccent: '#ffffff',
  selectionBackground: '#cfe3ff',
  selectionForeground: '#000000',
  black: '#000000',
  red: '#cd3131',
  green: '#00bc00',
  yellow: '#949800',
  blue: '#0451a5',
  magenta: '#bc05bc',
  cyan: '#0598bc',
  white: '#555555',
  brightBlack: '#666666',
  brightRed: '#cd3131',
  brightGreen: '#14ce14',
  brightYellow: '#b5ba00',
  brightBlue: '#0451a5',
  brightMagenta: '#bc05bc',
  brightCyan: '#0598bc',
  brightWhite: '#a5a5a5',
}

function resolveTerminalTheme(background: 'black' | 'white' | 'theme', effectiveTheme: 'light' | 'dark'): ITheme {
  const useDark = background === 'black' || (background === 'theme' && effectiveTheme === 'dark')
  return useDark ? DARK_THEME : LIGHT_THEME
}

export const TERMINAL_STATUS_DARK = {
  '--terminal-status': '#232428',
  '--terminal-status-border': 'rgba(255, 255, 255, 0.07)',
  '--terminal-status-text': '#98989d',
  '--terminal-status-value': '#d6d6da',
} as const

export const TERMINAL_STATUS_LIGHT = {
  '--terminal-status': '#f2f2f4',
  '--terminal-status-border': 'rgba(0, 0, 0, 0.08)',
  '--terminal-status-text': '#6e6e73',
  '--terminal-status-value': '#1d1d1f',
} as const

export function resolveTerminalStatus(bg: 'black' | 'white' | 'theme', effectiveTheme: 'light' | 'dark'): Record<string, string> {
  const useDark = bg === 'black' || (bg === 'theme' && effectiveTheme === 'dark')
  return useDark ? { ...TERMINAL_STATUS_DARK } : { ...TERMINAL_STATUS_LIGHT }
}

const Terminal: React.FC<TerminalProps> = ({
  sessionId,
  isActive,
  fontSize = 14,
  terminalBackground = 'theme',
  effectiveTheme = 'dark',
}) => {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null)
  const initialFitDone = useRef(false)
  const [loading, setLoading] = useState(true)
  const isActiveRef = useRef(isActive)
  isActiveRef.current = isActive

  const terminalTheme = resolveTerminalTheme(terminalBackground, effectiveTheme)

  useEffect(() => {
    if (!terminalRef.current) return

    const xterm = new XTerminal({
      allowProposedApi: true,
      fontFamily: '"SF Mono", "Menlo", "Monaco", "Courier New", monospace',
      fontSize: fontSize,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
      theme: { ...terminalTheme },
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()
    const unicode11Addon = new Unicode11Addon()

    xterm.loadAddon(fitAddon)
    xterm.loadAddon(webLinksAddon)
    xterm.loadAddon(unicode11Addon)

    xterm.unicode.activeVersion = '11'

    xterm.open(terminalRef.current)

    xtermRef.current = xterm
    fitAddonRef.current = fitAddon

    const handleInput = (data: string) => {
      window.api.sessions.sendInput(sessionId, data)
    }

    const handleResize = (event: { cols: number; rows: number }) => {
      const last = lastSizeRef.current
      if (last && last.cols === event.cols && last.rows === event.rows) return
      lastSizeRef.current = { cols: event.cols, rows: event.rows }
      window.api.sessions.resize(sessionId, {
        cols: event.cols,
        rows: event.rows,
      })
    }

    xterm.onData(handleInput)
    xterm.onResize(handleResize)

    const handleShellData = (e: Event) => {
      const { sessionId: eventSessionId, data } = (e as CustomEvent).detail
      if (eventSessionId === sessionId) {
        xterm.write(data)
        if (!initialFitDone.current) {
          initialFitDone.current = true
          try { fitAddon.fit() } catch {}
        }
      }
    }

    const handleShellClose = (e: Event) => {
      const { sessionId: eventSessionId } = (e as CustomEvent).detail
      if (eventSessionId === sessionId) {
        xterm.write('\r\n\x1b[31m[Connection closed]\x1b[0m\r\n')
      }
    }

    window.addEventListener('shell:data', handleShellData)
    window.addEventListener('shell:close', handleShellClose)

    let fitFrame: number | null = null
    const resizeObserver = new ResizeObserver(() => {
      if (!isActiveRef.current) return
      if (fitFrame !== null) cancelAnimationFrame(fitFrame)
      fitFrame = requestAnimationFrame(() => {
        try {
          fitAddon.fit()
        } catch {
          // ignore
        }
      })
    })

    resizeObserver.observe(terminalRef.current)

    const initTimeout = setTimeout(async () => {
      try {
        fitAddon.fit()
        const size = { cols: xterm.cols, rows: xterm.rows }
        lastSizeRef.current = size
        await window.api.sessions.openShell(sessionId, size)
      } catch (err) {
        xterm.write(`\r\n\x1b[31m[${err instanceof Error ? err.message : 'Failed to open shell'}]\x1b[0m\r\n`)
        window.dispatchEvent(new CustomEvent('shell:close', { detail: { sessionId } }))
      } finally {
        setLoading(false)
      }
    }, 100)

    return () => {
      clearTimeout(initTimeout)
      if (fitFrame !== null) cancelAnimationFrame(fitFrame)
      resizeObserver.disconnect()
      window.removeEventListener('shell:data', handleShellData)
      window.removeEventListener('shell:close', handleShellClose)
      xterm.dispose()
      xtermRef.current = null
      fitAddonRef.current = null
    }
  }, [sessionId])

  useEffect(() => {
    if (xtermRef.current && fitAddonRef.current) {
      xtermRef.current.options.fontSize = fontSize
      try {
        fitAddonRef.current.fit()
      } catch {
        // ignore
      }
    }
  }, [fontSize])

  useEffect(() => {
    if (!xtermRef.current) return
    xtermRef.current.options.theme = resolveTerminalTheme(terminalBackground, effectiveTheme)
  }, [terminalBackground, effectiveTheme])

  useEffect(() => {
    if (isActive && xtermRef.current) {
      const timer = setTimeout(() => {
        try {
          xtermRef.current?.focus()
          fitAddonRef.current?.fit()
        } catch {
          // ignore
        }
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [isActive])

  return (
    <div
      className="terminal-root"
      style={{ ['--terminal-bg' as string]: terminalTheme.background }}
    >
      <div className="terminal-container" style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {loading && (
          <div className="terminal-loading">
            <Spin />
          </div>
        )}
        <div
          ref={terminalRef}
          className={`terminal-wrapper ${loading ? 'hidden' : ''}`}
        />
      </div>
    </div>
  )
}

export default Terminal
