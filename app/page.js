'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

// ── Crypto helpers ─────────────────────────────────────────────────────────────

async function hashPassword(pw) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function generatePassword(len = 8) {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'
  return Array.from(crypto.getRandomValues(new Uint8Array(len)))
    .map(b => chars[b % chars.length]).join('')
}

function generateLinkPin(len = 14) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  return Array.from(crypto.getRandomValues(new Uint8Array(len)))
    .map(b => chars[b % chars.length]).join('')
}

async function pinToRoomId(pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('whispr-pin-v1:' + pin))
  return btoa(String.fromCharCode(...new Uint8Array(buf).slice(0, 12)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// ── LocalStorage chat list helpers ────────────────────────────────────────────

function getChats() {
  try { return JSON.parse(localStorage.getItem('whispr:chats') || '[]') } catch { return [] }
}

function upsertChat(entry) {
  try {
    const chats = getChats()
    const idx = chats.findIndex(c => c.roomId === entry.roomId)
    if (idx >= 0) chats[idx] = { ...chats[idx], ...entry }
    else chats.unshift(entry)
    chats.sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0))
    localStorage.setItem('whispr:chats', JSON.stringify(chats))
    return chats
  } catch { return [] }
}

function getChatName(chat) {
  if (chat.type === 'ecdh') return 'link chat'
  if (chat.type === 'pin') return chat.pin || 'pin chat'
  if (chat.type === 'pin-link') return chat.pin ? chat.pin.slice(0, 10) : 'chat'
  return 'chat'
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'yesterday'
  return d.toLocaleDateString([], { month: 'numeric', day: 'numeric' })
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function Home() {
  const router = useRouter()

  const [chats, setChats] = useState([])
  const [panelOpen, setPanelOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [joining, setJoining] = useState(false)
  const [creating, setCreating] = useState(false)

  const [passwordProtect, setPasswordProtect] = useState(false)
  const [password, setPassword] = useState('')
  const [copiedPw, setCopiedPw] = useState(false)

  const [created, setCreated] = useState(null) // { shareUrl, roomId, linkPin?, type, password? }
  const [copied, setCopied] = useState(false)

  const [installPrompt, setInstallPrompt] = useState(null)
  const [logoCopied, setLogoCopied] = useState(false)
  const longPressRef = useRef(null)
  const dropdownRef = useRef(null)

  // Load chats from localStorage
  useEffect(() => { setChats(getChats()) }, [])

  // Capture install prompt
  useEffect(() => {
    const handler = e => { e.preventDefault(); setInstallPrompt(e) }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return
    const handler = e => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('touchstart', handler) }
  }, [dropdownOpen])

  // ── Long press on logo ───────────────────────────────────────────────────────

  const startLongPress = () => {
    longPressRef.current = setTimeout(async () => {
      try { await navigator.clipboard.writeText('https://hailgallaxhar.com') } catch {}
      setLogoCopied(true)
      setTimeout(() => setLogoCopied(false), 1500)
    }, 600)
  }
  const clearLongPress = () => clearTimeout(longPressRef.current)

  // ── Panel toggle ─────────────────────────────────────────────────────────────

  const togglePanel = () => {
    setPanelOpen(v => !v)
    setDropdownOpen(false)
    setCreated(null)
    setPinError('')
  }

  // ── Password protect toggle ──────────────────────────────────────────────────

  const togglePasswordProtect = () => {
    const next = !passwordProtect
    setPasswordProtect(next)
    if (next && !password) setPassword(generatePassword())
    setDropdownOpen(false)
  }

  // ── Copy helper ──────────────────────────────────────────────────────────────

  const copyText = async (text, setFn) => {
    try { await navigator.clipboard.writeText(text) } catch {}
    setFn(true)
    setTimeout(() => setFn(false), 1800)
  }

  // ── Join with PIN (→) ────────────────────────────────────────────────────────

  const handlePinJoin = async () => {
    const trimmed = pinInput.trim()
    if (trimmed.length < 4) { setPinError('min 4 characters'); return }
    if (!/^[a-zA-Z0-9]+$/.test(trimmed)) { setPinError('letters and numbers only'); return }
    setJoining(true); setPinError('')
    const roomId = await pinToRoomId(trimmed)
    sessionStorage.setItem(`whispr:${roomId}:pin`, trimmed)
    let passwordHash = null
    if (passwordProtect && password) passwordHash = await hashPassword(password)
    await fetch('/api/create-room', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinRoomId: roomId, passwordHash }),
    })
    setChats(upsertChat({ roomId, type: 'pin', pin: trimmed, lastMessage: '', lastTs: Date.now() }))
    router.push(`/room/${roomId}`)
  }

  // ── Create PIN-link chat (⊕) ─────────────────────────────────────────────────

  const handleCreateLinkChat = async () => {
    setCreating(true); setCreated(null)
    const linkPin = generateLinkPin()
    const roomId = await pinToRoomId(linkPin)
    let passwordHash = null
    if (passwordProtect && password) passwordHash = await hashPassword(password)
    await fetch('/api/create-room', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinRoomId: roomId, passwordHash }),
    })
    const shareUrl = `${window.location.origin}/p#${linkPin}`
    setChats(upsertChat({ roomId, type: 'pin-link', pin: linkPin, shareUrl, lastMessage: '', lastTs: Date.now() }))
    setCreated({ shareUrl, roomId, linkPin, type: 'pin-link' })
    setCreating(false)
  }

  // ── Create legacy ECDH chat ───────────────────────────────────────────────────

  const handleCreateLegacy = async (withPassword = false) => {
    setDropdownOpen(false); setCreating(true); setCreated(null)
    let passwordHash = null
    let pw = null
    if (withPassword) {
      pw = generatePassword()
      passwordHash = await hashPassword(pw)
    }
    const res = await fetch('/api/create-room', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passwordHash }),
    })
    const { roomId } = await res.json()
    const shareUrl = `${window.location.origin}/room/${roomId}`
    setChats(upsertChat({ roomId, type: 'ecdh', pin: null, shareUrl, lastMessage: '', lastTs: Date.now() }))
    setCreated({ shareUrl, roomId, linkPin: null, type: 'ecdh', password: pw })
    setCreating(false)
  }

  // ── Open created chat ────────────────────────────────────────────────────────

  const openCreated = () => {
    if (!created) return
    if (created.linkPin) {
      sessionStorage.setItem(`whispr:${created.roomId}:pin`, created.linkPin)
      router.push(`/room/${created.roomId}#${created.linkPin}`)
    } else {
      router.push(`/room/${created.roomId}`)
    }
  }

  // ── Open chat from list ───────────────────────────────────────────────────────

  const openChat = chat => {
    if (chat.pin) sessionStorage.setItem(`whispr:${chat.roomId}:pin`, chat.pin)
    if (chat.type === 'pin-link' && chat.pin) {
      router.push(`/room/${chat.roomId}#${chat.pin}`)
    } else {
      router.push(`/room/${chat.roomId}`)
    }
  }

  // ── Install ───────────────────────────────────────────────────────────────────

  const handleInstall = async () => {
    if (!installPrompt) return
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setInstallPrompt(null)
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={container}>

      {/* Header */}
      <div style={header}>
        <span
          style={{ ...logo, color: logoCopied ? '#555' : '#ddd' }}
          onMouseDown={startLongPress}
          onMouseUp={clearLongPress}
          onMouseLeave={clearLongPress}
          onTouchStart={startLongPress}
          onTouchEnd={clearLongPress}
          title="hold to copy link"
        >
          {logoCopied ? 'copied!' : 'whispr'}
        </span>
        <button onClick={togglePanel} style={headerBtn} title={panelOpen ? 'close' : 'new chat'}>
          {panelOpen ? '×' : '+'}
        </button>
      </div>

      {/* Create panel */}
      {panelOpen && (
        <div style={panel}>
          <div style={panelRow}>
            <input
              type="text"
              placeholder="pin"
              value={pinInput}
              onChange={e => { setPinInput(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20)); setPinError('') }}
              onKeyDown={e => e.key === 'Enter' && handlePinJoin()}
              autoComplete="off"
              spellCheck={false}
              style={panelInput}
            />
            <button onClick={handlePinJoin} disabled={joining || pinInput.length < 4} style={panelBtn} title="join with pin">→</button>
            <button onClick={handleCreateLinkChat} disabled={creating} style={panelBtn} title="create chat link">
              {creating ? '…' : '⊕'}
            </button>
            <div style={{ position: 'relative' }} ref={dropdownRef}>
              <button onClick={() => setDropdownOpen(v => !v)} style={panelBtn} title="more options">⋯</button>
              {dropdownOpen && (
                <div style={dropdown}>
                  <label style={dropdownCheck}>
                    <input
                      type="checkbox"
                      checked={passwordProtect}
                      onChange={togglePasswordProtect}
                      style={{ accentColor: '#444', marginRight: 8, flexShrink: 0 }}
                    />
                    password protect this PIN chat
                  </label>
                  <div style={dropdownDivider} />
                  <button onClick={() => handleCreateLegacy(false)} style={dropdownBtn}>create legacy chat</button>
                  <button onClick={() => handleCreateLegacy(true)} style={dropdownBtn}>create legacy chat with password</button>
                </div>
              )}
            </div>
          </div>

          {passwordProtect && password && (
            <div style={pwRow}>
              <span style={pwText}>{password}</span>
              <button onClick={() => copyText(password, setCopiedPw)} style={smallBtn}>
                {copiedPw ? 'copied' : 'copy'}
              </button>
            </div>
          )}

          {pinError && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#f66', fontFamily: 'monospace' }}>{pinError}</p>}

          {created && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {created.password && (
                <div style={pwRow}>
                  <span style={{ ...pwText, fontSize: 11 }}>pw: {created.password}</span>
                </div>
              )}
              <div style={pwRow}>
                <span style={{ ...pwText, fontSize: 11, wordBreak: 'break-all' }}>{created.shareUrl}</span>
                <button onClick={() => copyText(created.shareUrl, setCopied)} style={smallBtn}>
                  {copied ? 'copied' : 'copy'}
                </button>
              </div>
              <button onClick={openCreated} style={openBtn}>open chat →</button>
            </div>
          )}
        </div>
      )}

      {/* Chat list */}
      <div style={chatList}>
        {chats.length === 0 ? (
          <div style={empty}>
            <span style={{ color: '#333', fontSize: 13 }}>no chats yet</span>
            <span style={{ color: '#272727', fontSize: 11 }}>tap + to start one</span>
          </div>
        ) : (
          chats.map(chat => (
            <div key={chat.roomId} style={chatItem} onClick={() => openChat(chat)}>
              <div style={chatItemTop}>
                <span style={chatName}>{getChatName(chat)}</span>
                <span style={chatTime}>{formatTime(chat.lastTs)}</span>
              </div>
              {chat.lastMessage ? (
                <span style={chatPreview}>{chat.lastMessage}</span>
              ) : (
                <span style={{ ...chatPreview, color: '#2a2a2a' }}>
                  {chat.type === 'ecdh' ? '2-party · ecdh' : chat.type === 'pin-link' ? 'link chat' : 'pin chat'}
                </span>
              )}
            </div>
          ))
        )}
      </div>

      {/* Install button */}
      {installPrompt && (
        <div style={installWrap}>
          <button onClick={handleInstall} style={installBtn}>↓</button>
          <span style={installLabel}>download for{'\n'}notifications</span>
        </div>
      )}
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const container = {
  minHeight: '100dvh', display: 'flex', flexDirection: 'column',
  background: '#111', color: '#ccc', fontFamily: 'monospace',
}
const header = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '18px 20px 14px', borderBottom: '1px solid #1a1a1a',
  position: 'sticky', top: 0, background: '#111', zIndex: 10,
}
const logo = {
  fontSize: 20, fontWeight: 400, letterSpacing: 3, cursor: 'default',
  userSelect: 'none', WebkitUserSelect: 'none',
}
const headerBtn = {
  background: 'none', border: 'none', color: '#555', fontFamily: 'monospace',
  fontSize: 22, cursor: 'pointer', padding: '0 0 0 8px', lineHeight: 1,
}
const panel = {
  padding: '12px 16px 14px', borderBottom: '1px solid #1a1a1a',
  display: 'flex', flexDirection: 'column', gap: 0,
}
const panelRow = {
  display: 'flex', alignItems: 'center', gap: 6,
}
const panelInput = {
  flex: 1, background: '#1a1a1a', border: 'none', borderRadius: 10,
  padding: '9px 12px', color: '#ccc', fontFamily: 'monospace', fontSize: 14,
  outline: 'none', minWidth: 0, letterSpacing: 1,
}
const panelBtn = {
  background: 'none', border: 'none', color: '#555', fontFamily: 'monospace',
  fontSize: 18, cursor: 'pointer', padding: '6px 4px', lineHeight: 1, flexShrink: 0,
}
const dropdown = {
  position: 'absolute', right: 0, top: 'calc(100% + 6px)',
  background: '#1a1a1a', borderRadius: 10, padding: '6px 0',
  minWidth: 230, zIndex: 100, boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
}
const dropdownCheck = {
  display: 'flex', alignItems: 'center', padding: '9px 14px',
  fontSize: 12, color: '#888', cursor: 'pointer',
  userSelect: 'none', WebkitUserSelect: 'none',
}
const dropdownDivider = { height: 1, background: '#252525', margin: '4px 0' }
const dropdownBtn = {
  display: 'block', width: '100%', background: 'none', border: 'none',
  padding: '9px 14px', color: '#777', fontFamily: 'monospace', fontSize: 12,
  cursor: 'pointer', textAlign: 'left',
}
const pwRow = {
  display: 'flex', alignItems: 'center', gap: 10,
  background: '#1a1a1a', borderRadius: 10, padding: '8px 12px',
  justifyContent: 'space-between', marginTop: 8,
}
const pwText = {
  fontSize: 13, color: '#888', flex: 1, overflow: 'hidden',
  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
}
const smallBtn = {
  background: 'none', border: '1px solid #2e2e2e', borderRadius: 6,
  padding: '3px 9px', color: '#555', fontFamily: 'monospace',
  fontSize: 11, cursor: 'pointer', flexShrink: 0,
}
const openBtn = {
  width: '100%', background: '#1a1a1a', border: 'none', borderRadius: 10,
  padding: '11px 0', color: '#888', fontFamily: 'monospace', fontSize: 13,
  cursor: 'pointer', letterSpacing: 1,
}
const chatList = { flex: 1, overflowY: 'auto' }
const empty = {
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  justifyContent: 'center', gap: 8, height: '40vh',
}
const chatItem = {
  padding: '14px 20px', borderBottom: '1px solid #161616',
  cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4,
}
const chatItemTop = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }
const chatName = { fontSize: 14, color: '#ccc', letterSpacing: 0.5 }
const chatTime = { fontSize: 10, color: '#3a3a3a', flexShrink: 0, marginLeft: 8 }
const chatPreview = {
  fontSize: 12, color: '#444',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
}
const installWrap = {
  position: 'fixed', bottom: 24, right: 20,
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
}
const installBtn = {
  width: 44, height: 44, borderRadius: '50%',
  background: '#1a1a1a', border: '1px solid #2a2a2a',
  color: '#666', fontSize: 18, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'monospace',
}
const installLabel = {
  fontSize: 9, color: '#3a3a3a', fontFamily: 'monospace',
  textAlign: 'center', lineHeight: 1.4, whiteSpace: 'pre',
}
