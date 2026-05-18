import React, { useEffect, useRef, useState } from 'react'
import { Spin } from 'antd'
import { Terminal as XTerminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import '@xterm/xterm/css/xterm.css'

import './index.css'

interface TerminalProps {
  sessionId: string
  isActive: boolean
  fontSize?: number
}

const Terminal: React.FC<TerminalProps> = ({ sessionId, isActive, fontSize = 14 }) => {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null)
  const initialFitDone = useRef(false)
  const [loading, setLoading] = useState(true)
  const isActiveRef = useRef(isActive)
  isActiveRef.current = isActive

  useEffect(() => {
    if (!terminalRef.current) return

    const xterm = new XTerminal({
      fontFamily: '"SF Mono", "Menlo", "Monaco", "Courier New", monospace',
      fontSize: fontSize,
      lineHeight: 1,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
      allowProposedApi: true,
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        cursorAccent: '#1e1e1e',
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
      },
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

    let fitTimeout: ReturnType<typeof setTimeout>
    const resizeObserver = new ResizeObserver(() => {
      if (!isActiveRef.current) return
      clearTimeout(fitTimeout)
      fitTimeout = setTimeout(() => {
        try {
          fitAddon.fit()
        } catch {
          // ignore
        }
      }, 50)
    })

    resizeObserver.observe(terminalRef.current)

    setTimeout(() => {
      try {
        fitAddon.fit()
      } catch {
        // ignore
      }
      setLoading(false)
    }, 100)

    return () => {
      clearTimeout(fitTimeout)
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#1e1e1e' }}>
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
