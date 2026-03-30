'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'
import {
  fetchContacts, upsertContact, deleteContact, addActivity, deleteActivityFn,
  type Contact, type Activity
} from '@/lib/supabase'

const STAGES = [
  { id: 'lead',         label: 'Nowy lead',       color: '#64748b' },
  { id: 'contact',      label: 'Pierwszy kontakt', color: '#60a5fa' },
  { id: 'followup1',    label: 'Follow-up 1',      color: '#06b6d4' },
  { id: 'followup2',    label: 'Follow-up 2',      color: '#8b5cf6' },
  { id: 'presentation', label: 'Prezentacja',      color: '#a78bfa' },
  { id: 'negotiation',  label: 'Negocjacje',       color: '#f59e0b' },
  { id: 'won',          label: 'Wygrany',          color: '#22c55e' },
  { id: 'lost',         label: 'Przegrany',        color: '#ef4444' },
]

const ACTIVITY_TYPES = [
  { id: 'call',    label: 'Telefon',   icon: '📞' },
  { id: 'email',   label: 'E-mail',    icon: '✉️'  },
  { id: 'meeting', label: 'Spotkanie', icon: '🤝' },
  { id: 'note',    label: 'Notatka',   icon: '📝' },
  { id: 'task',    label: 'Zadanie',   icon: '✅' },
]

const OWNERS = [
  { id: 'MP', label: 'MP', color: '#a78bfa' },
  { id: 'KK', label: 'KK', color: '#34d399' },
]

const CATEGORIES = ['Kultura', 'Drogerie', 'Home/Gift', 'Dyskonty', 'Spożywcze', 'Stacje', 'Inne']

const PRIORITY_COLORS: Record<number, string> = {
  10: '#ef4444', 9: '#f97316', 8: '#f59e0b',
  7: '#84cc16', 6: '#22c55e', 5: '#14b8a6',
  4: '#64748b', 3: '#64748b', 2: '#64748b', 1: '#64748b'
}

const ini = (n: string) => n.split(' ').map(p => p[0] || '').join('').slice(0, 2).toUpperCase()
const fmtDate = (d: string) => new Date(d).toLocaleDateString('pl-PL', { day: '2-digit', month: 'short', year: 'numeric' })
const isOverdue = (d: string) => d && new Date(d) < new Date()
const isDueToday = (d: string) => {
  if (!d) return false
  const today = new Date().toISOString().split('T')[0]
  return d === today
}

const T = {
  dark: {
    bg:'#0b0e16',bgCard:'#111827',bgCol:'#0e1220',bgInput:'#111827',bgPanel:'#0a0d14',
    bgHover:'#141825',border:'#131929',border2:'#1e2535',border3:'#0f1520',
    text:'#e2e8f0',textSub:'#94a3b8',textMute:'#475569',textFade:'#2d3748',
    accent:'#f59e0b',accentFg:'#000',badge:'#111827',scrollBg:'#0b0e16',scrollTh:'#1e2535',
    selCard:'#1a2035',selBorder:'#f59e0b44',toastOk:'#14532d',toastErr:'#7f1d1d',
    toastInfo:'#1e3a5f',toastOkB:'#22c55e',toastErrB:'#ef4444',toastInfoB:'#60a5fa',
    delBg:'#1a0f0f',delBorder:'#3b1515',delColor:'#ef4444',timelineLine:'#1e2535',notesBg:'#0e1220',
    overdue:'#7f1d1d',overdueText:'#ef4444',today:'#1a2e0f',todayText:'#22c55e',
  },
  light: {
    bg:'#f1f5f9',bgCard:'#ffffff',bgCol:'#f8fafc',bgInput:'#ffffff',bgPanel:'#f8fafc',
    bgHover:'#f1f5f9',border:'#e2e8f0',border2:'#cbd5e1',border3:'#e8edf4',
    text:'#0f172a',textSub:'#334155',textMute:'#64748b',textFade:'#94a3b8',
    accent:'#f59e0b',accentFg:'#000',badge:'#f1f5f9',scrollBg:'#f1f5f9',scrollTh:'#cbd5e1',
    selCard:'#fffbeb',selBorder:'#f59e0b88',toastOk:'#dcfce7',toastErr:'#fee2e2',
    toastInfo:'#dbeafe',toastOkB:'#22c55e',toastErrB:'#ef4444',toastInfoB:'#60a5fa',
    delBg:'#fff1f2',delBorder:'#fecdd3',delColor:'#ef4444',timelineLine:'#e2e8f0',notesBg:'#f1f5f9',
    overdue:'#fee2e2',overdueText:'#ef4444',today:'#dcfce7',todayText:'#16a34a',
  }
} as const

type Theme = typeof T.dark | typeof T.light

export default function CRM() {
  const [contacts, setContacts]   = useState<Contact[]>([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [view, setView]           = useState<'pipeline'|'list'|'followups'|'stats'>('pipeline')
  const [selected, setSelected]   = useState<string|null>(null)
  const [editContact, setEditContact] = useState<Partial<Contact>|null>(null)
  const [toast, setToast]         = useState<{msg:string,type:string}|null>(null)
  const [search, setSearch]       = useState('')
  const [fOwner, setFOwner]       = useState('')
  const [fCategory, setFCategory] = useState('')
  const [dragId, setDragId]       = useState<string|null>(null)
  const [dragOver, setDragOver]   = useState<string|null>(null)
  const [confirmDel, setConfirmDel] = useState<Contact|null>(null)
  const [dark, setDark]           = useState(false)
  const [dismissedReminders, setDismissedReminders] = useState<Set<string>>(new Set())
  const [showImport, setShowImport] = useState(false)
  const t: Theme = dark ? T.dark : T.light
  const toastRef = useRef<ReturnType<typeof setTimeout>>(null)

  const load = useCallback(async () => {
    try { setContacts(await fetchContacts()) }
    catch { showToast('Błąd ładowania','err') }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const showToast = (msg: string, type = 'ok') => {
    setToast({ msg, type })
    clearTimeout(toastRef.current!)
    toastRef.current = setTimeout(() => setToast(null), 3000)
  }

  const moveToStage = async (id: string, stageId: string) => {
    setSaving(true)
    try {
      const now = new Date().toISOString()
      await upsertContact({ id, stage: stageId, updated_at: now })
      setContacts(cs => cs.map(c => c.id === id ? { ...c, stage: stageId, updated_at: now } : c))
    } catch { showToast('Błąd zapisu','err') }
    setSaving(false)
  }

  const handleAddActivity = async (contactId: string, act: {type:string;text:string;date:string}) => {
    setSaving(true)
    try {
      const newAct = await addActivity(contactId, act)
      setContacts(cs => cs.map(c => c.id === contactId
        ? { ...c, activities: [newAct, ...(c.activities ?? [])] }
        : c
      ))
      showToast('Dodano aktywność ✓')
      await load()
    } catch { showToast('Błąd zapisu','err') }
    setSaving(false)
  }

  const handleDeleteActivity = async (contactId: string, actId: string) => {
    setSaving(true)
    try {
      await deleteActivityFn(actId)
      setContacts(cs => cs.map(c => c.id === contactId
        ? { ...c, activities: (c.activities ?? []).filter(a => a.id !== actId) }
        : c
      ))
      showToast('Usunięto notatkę','info')
    } catch { showToast('Błąd usuwania','err') }
    setSaving(false)
  }

  const handleOwnerChange = async (id: string, owner: string) => {
    setSaving(true)
    try {
      const now = new Date().toISOString()
      await upsertContact({ id, owner, updated_at: now })
      setContacts(cs => cs.map(c => c.id === id ? { ...c, owner, updated_at: now } : c))
    } catch { showToast('Błąd zapisu','err') }
    setSaving(false)
  }

  const handleSaveContact = async (data: Partial<Contact>) => {
    setSaving(true)
    try {
      const saved = await upsertContact({ ...data, updated_at: new Date().toISOString() })
      if (data.id) {
        await load()
        showToast('Zapisano ✓')
      } else {
        setContacts(cs => [{ ...saved, activities: [] }, ...cs])
        showToast('Dodano kontakt ✓')
      }
      setEditContact(null)
    } catch { showToast('Błąd zapisu','err') }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    setSaving(true)
    try {
      await deleteContact(id)
      setContacts(cs => cs.filter(c => c.id !== id))
      setSelected(null)
      showToast('Usunięto','info')
    } catch { showToast('Błąd usuwania','err') }
    setSaving(false)
    setConfirmDel(null)
  }

  const selContact = selected ? contacts.find(c => c.id === selected) ?? null : null
  const filtered = contacts.filter(c => {
    const q = search.toLowerCase()
    return (!q || c.name?.toLowerCase().includes(q) || c.company.toLowerCase().includes(q))
      && (!fOwner || c.owner === fOwner)
      && (!fCategory || c.category === fCategory)
  })

  const followups = contacts
    .filter(c => c.followup_date)
    .sort((a,b) => new Date(a.followup_date).getTime() - new Date(b.followup_date).getTime())

  const overdueCount = followups.filter(c =>
    isOverdue(c.followup_date) && c.stage !== 'won' && c.stage !== 'lost'
  ).length

  const REMINDER_DAYS = 7
  const now = Date.now()
  const reminderContacts = contacts.filter(c => {
    if (c.stage === 'won' || c.stage === 'lost') return false
    if (!c.activities?.length) return false          // tylko gdy był realny kontakt
    if (dismissedReminders.has(c.id)) return false
    const lastActivity = new Date(c.activities[0].created_at).getTime()
    const lastUpdated  = new Date(c.updated_at).getTime()
    const lastInteraction = Math.max(lastActivity, lastUpdated)
    const daysSince = (now - lastInteraction) / (1000 * 60 * 60 * 24)
    return daysSince > REMINDER_DAYS
  })

  // Stats
  const totalActivities = contacts.reduce((s,c) => s + (c.activities?.length ?? 0), 0)
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
  const weekActivities = contacts.reduce((s,c) =>
    s + (c.activities?.filter(a => new Date(a.created_at) > weekAgo).length ?? 0), 0)
  const stageStats = STAGES.map(s => ({
    ...s, count: contacts.filter(c => c.stage === s.id).length
  }))
  const catStats = CATEGORIES.map(cat => ({
    cat, count: contacts.filter(c => c.category === cat).length
  })).filter(x => x.count > 0)
  const maxStage = Math.max(...stageStats.map(s => s.count), 1)

  if (loading) return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", background:t.bg, minHeight:'100vh',
      display:'flex', alignItems:'center', justifyContent:'center', color:t.textMute }}>
      <div style={{ textAlign:'center' }}><div style={{ fontSize:32, marginBottom:12 }}>⏳</div>Ładowanie...</div>
    </div>
  )

  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", background:t.bg, minHeight:'100vh',
      color:t.text, display:'flex', flexDirection:'column', transition:'background .25s,color .25s' }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-track{background:${t.scrollBg}}
        ::-webkit-scrollbar-thumb{background:${t.scrollTh};border-radius:3px}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
        @keyframes slideRight{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:none}}
        @keyframes barGrow{from{width:0}to{width:var(--w)}}
      `}</style>

      {toast && (
        <div style={{ position:'fixed', top:16, right:16, zIndex:9999,
          background: toast.type==='err'?t.toastErr:toast.type==='info'?t.toastInfo:t.toastOk,
          border:`1px solid ${toast.type==='err'?t.toastErrB:toast.type==='info'?t.toastInfoB:t.toastOkB}`,
          color: toast.type==='err'?t.toastErrB:toast.type==='info'?t.toastInfoB:t.toastOkB,
          padding:'10px 16px', borderRadius:8, fontSize:13, animation:'fadeIn .2s ease' }}>
          {toast.msg}
        </div>
      )}

      {/* TOP BAR */}
      <div style={{ borderBottom:`1px solid ${t.border}`, padding:'0 20px', flexShrink:0,
        background:t.bgCard, transition:'background .25s' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', height:56 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:28, height:28, background:t.accent, borderRadius:7,
              display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <span style={{ fontWeight:600, fontSize:15 }}>
              CRM <span style={{ color:t.accent }}>Sieci Handlowe</span>
            </span>
            <span style={{ marginLeft:4, background:t.badge, border:`1px solid ${t.border2}`,
              borderRadius:20, padding:'2px 9px', fontSize:11, color:t.textMute,
              display:'flex', alignItems:'center', gap:4 }}>
              <span style={{ width:5, height:5, borderRadius:'50%',
                background: saving?t.accent:'#22c55e', display:'inline-block', transition:'background .3s' }}/>
              {saving ? 'Zapisuję...' : 'Supabase ✓'}
            </span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ display:'flex', background:t.badge, border:`1px solid ${t.border2}`,
              borderRadius:8, overflow:'hidden' }}>
              {([['pipeline','⬛','Pipeline'],['list','☰','Lista'],['followups','📅','Follow-upy'],['stats','📊','Statystyki']] as const).map(([v,icon,label]) => (
                <button key={v} onClick={() => setView(v)}
                  style={{ padding:'6px 12px', background:view===v?t.border2:'transparent',
                    border:'none', color:view===v?t.text:t.textMute, cursor:'pointer',
                    fontSize:12, fontFamily:'inherit', fontWeight:view===v?500:400, position:'relative' }}>
                  {icon} {label}
                  {v==='followups' && overdueCount > 0 && (
                    <span style={{ position:'absolute', top:2, right:2, width:7, height:7,
                      borderRadius:'50%', background:'#ef4444' }}/>
                  )}
                </button>
              ))}
            </div>
            <button onClick={() => setDark(d => !d)}
              style={{ width:36, height:36, borderRadius:8, border:`1px solid ${t.border2}`,
                background:t.badge, cursor:'pointer', fontSize:16,
                display:'flex', alignItems:'center', justifyContent:'center' }}>
              {dark ? '☀️' : '🌙'}
            </button>
            <button onClick={() => setShowImport(true)}
              style={{ background:t.badge, color:t.textSub, border:`1px solid ${t.border2}`, borderRadius:7,
                padding:'7px 14px', fontFamily:'inherit', fontWeight:500, fontSize:13, cursor:'pointer' }}>
              ⬆ Import XLS
            </button>
            <button onClick={() => setEditContact({ stage:'lead', owner:'', activities:[], priority:5 })}
              style={{ background:t.accent, color:t.accentFg, border:'none', borderRadius:7,
                padding:'7px 14px', fontFamily:'inherit', fontWeight:600, fontSize:13, cursor:'pointer' }}>
              + Nowy kontakt
            </button>
          </div>
        </div>
      </div>

      {/* FILTER BAR */}
      <div style={{ padding:'10px 20px', borderBottom:`1px solid ${t.border}`, flexShrink:0,
        display:'flex', alignItems:'center', gap:10, flexWrap:'wrap',
        background:t.bgCard, transition:'background .25s' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍  Szukaj..."
          style={{ width:180, background:t.bgInput, border:`1px solid ${t.border2}`,
            color:t.text, borderRadius:7, padding:'7px 11px', fontSize:13, outline:'none', fontFamily:'inherit' }}/>
        <div style={{ display:'flex', alignItems:'center', gap:5, flexWrap:'wrap' }}>
          <span style={{ fontSize:11, color:t.textMute, fontWeight:600, textTransform:'uppercase', letterSpacing:'.04em' }}>Kat:</span>
          <Pill active={fCategory===''} color={t.textMute} borderActive={t.border2} onClick={() => setFCategory('')} t={t}>Wszystkie</Pill>
          {CATEGORIES.map(cat => (
            <Pill key={cat} active={fCategory===cat} color={t.accent} borderActive={t.accent}
              onClick={() => setFCategory(fCategory===cat?'':cat)} t={t}>{cat}</Pill>
          ))}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ fontSize:11, color:t.textMute, fontWeight:600, textTransform:'uppercase', letterSpacing:'.04em' }}>Kto:</span>
          <Pill active={fOwner===''} color={t.textMute} borderActive={t.border2} onClick={() => setFOwner('')} t={t}>Wszyscy</Pill>
          {OWNERS.map(o => (
            <Pill key={o.id} active={fOwner===o.id} color={o.color} borderActive={o.color}
              onClick={() => setFOwner(fOwner===o.id ? '' : o.id)} t={t}>
              <span style={{ width:7, height:7, borderRadius:'50%',
                background:fOwner===o.id?o.color:t.border2, display:'inline-block' }}/>
              {o.id}
            </Pill>
          ))}
        </div>
        <span style={{ fontSize:11, color:t.textFade, marginLeft:'auto' }}>{filtered.length} kontaktów</span>
      </div>

      {/* REMINDER BANNER */}
      {reminderContacts.length > 0 && (
        <div style={{ padding:'8px 20px', borderBottom:`1px solid ${t.border}`,
          background: dark ? '#1a1400' : '#fffbeb', flexShrink:0, display:'flex', alignItems:'flex-start', gap:10 }}>
          <span style={{ fontSize:14, flexShrink:0, marginTop:1 }}>⏰</span>
          <div style={{ flex:1, minWidth:0 }}>
            <span style={{ fontSize:11, fontWeight:700, color:'#f59e0b', textTransform:'uppercase',
              letterSpacing:'.06em', display:'block', marginBottom:4 }}>Czas na kontakt</span>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {reminderContacts.map(c => {
                const lastActivity = new Date(c.activities![0].created_at).getTime()
                const lastUpdated  = new Date(c.updated_at).getTime()
                const days = Math.floor((now - Math.max(lastActivity, lastUpdated)) / (1000 * 60 * 60 * 24))
                const owner = OWNERS.find(o => o.id === c.owner)
                return (
                  <div key={c.id} style={{ display:'flex', alignItems:'center', gap:5,
                    background: dark ? '#2a1f00' : '#fef3c7',
                    border:'1px solid #f59e0b44', borderRadius:6, padding:'3px 8px' }}>
                    <button onClick={() => { setSelected(c.id); if (view !== 'pipeline') setView('pipeline') }}
                      style={{ background:'none', border:'none', cursor:'pointer', padding:0,
                        fontSize:12, color: dark ? '#fbbf24' : '#92400e', fontWeight:600 }}>
                      {c.company}
                    </button>
                    {owner && (
                      <span style={{ fontSize:9, fontWeight:700, background:owner.color+'22',
                        color:owner.color, border:`1px solid ${owner.color}44`,
                        borderRadius:3, padding:'1px 4px' }}>{owner.label}</span>
                    )}
                    <span style={{ fontSize:10, color: dark ? '#d97706' : '#b45309' }}>
                      {days} {days === 1 ? 'dzień' : 'dni'} temu
                    </span>
                    <button onClick={() => setDismissedReminders(s => new Set([...s, c.id]))}
                      title="Odrzuć"
                      style={{ background:'none', border:'none', cursor:'pointer',
                        fontSize:10, color: dark ? '#78716c' : '#a8a29e', padding:'0 0 0 2px', lineHeight:1 }}>✕</button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

        {/* PIPELINE */}
        {view === 'pipeline' && (
          <div style={{ flex:1, overflowX:'auto', padding:'16px 12px', display:'flex', gap:10, alignItems:'flex-start' }}>
            {STAGES.map(stage => {
              const cards = filtered.filter(c => c.stage === stage.id)
              const isOver = dragOver === stage.id
              return (
                <div key={stage.id}
                  onDragOver={e => { e.preventDefault(); setDragOver(stage.id) }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={e => { e.preventDefault(); if (dragId) moveToStage(dragId, stage.id); setDragId(null); setDragOver(null) }}
                  style={{ width:210, flexShrink:0,
                    background: isOver?(dark?'#1a1f30':'#fffbeb'):t.bgCol,
                    border:`1px solid ${isOver?t.accent+'66':t.border}`,
                    borderRadius:10, display:'flex', flexDirection:'column',
                    maxHeight:'calc(100vh - 160px)', transition:'all .15s' }}>
                  <div style={{ padding:'10px 12px', borderBottom:`1px solid ${t.border}`, flexShrink:0 }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                        <div style={{ width:8, height:8, borderRadius:'50%', background:stage.color }}/>
                        <span style={{ fontWeight:600, fontSize:12 }}>{stage.label}</span>
                      </div>
                      <span style={{ background:t.badge, border:`1px solid ${t.border2}`,
                        borderRadius:10, padding:'1px 7px', fontSize:11, color:t.textMute }}>{cards.length}</span>
                    </div>
                  </div>
                  <div style={{ overflowY:'auto', padding:'8px', display:'flex', flexDirection:'column', gap:6, flex:1 }}>
                    {cards.map(c => {
                      const isSel = selected === c.id
                      const overdue = isOverdue(c.followup_date) && c.stage !== 'won' && c.stage !== 'lost'
                      const today = isDueToday(c.followup_date)
                      return (
                        <div key={c.id} draggable
                          onDragStart={() => setDragId(c.id)}
                          onDragEnd={() => setDragId(null)}
                          onClick={() => setSelected(c.id)}
                          style={{ background:isSel?t.selCard:t.bgCard,
                            border:`1px solid ${isSel?t.selBorder:overdue?t.overdueText+'44':t.border2}`,
                            borderRadius:8, padding:'10px', cursor:'pointer', transition:'all .12s', animation:'fadeIn .2s ease' }}>
                          <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                            <div style={{ width:26, height:26, borderRadius:'50%', background:t.bg,
                              border:`2px solid ${PRIORITY_COLORS[c.priority]||'#64748b'}`,
                              display:'flex', alignItems:'center', justifyContent:'center',
                              fontSize:9, fontWeight:700, color:PRIORITY_COLORS[c.priority]||'#64748b', flexShrink:0 }}>
                              {ini(c.company)}
                            </div>
                            <div style={{ minWidth:0, flex:1 }}>
                              <div style={{ fontWeight:600, fontSize:12, whiteSpace:'nowrap',
                                overflow:'hidden', textOverflow:'ellipsis' }}>{c.company}</div>
                              <div style={{ fontSize:10, color:t.textMute, marginTop:1,
                                whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.position}</div>
                            </div>
                            {c.priority >= 8 && <span style={{ fontSize:9, background:PRIORITY_COLORS[c.priority]+'22',
                              color:PRIORITY_COLORS[c.priority], border:`1px solid ${PRIORITY_COLORS[c.priority]}44`,
                              borderRadius:3, padding:'1px 4px', fontWeight:700, flexShrink:0 }}>{c.priority}</span>}
                          </div>
                          {c.followup_date && (
                            <div style={{ marginTop:6, fontSize:10, fontWeight:500,
                              color: overdue?t.overdueText:today?t.todayText:t.textMute,
                              background: overdue?t.overdue:today?t.today:'transparent',
                              borderRadius:4, padding:(overdue||today)?'2px 5px':'0' }}>
                              📅 {overdue?'Zaległe: ':today?'Dziś: ':''}{fmtDate(c.followup_date)}
                            </div>
                          )}
                          {c.offer_url && (
                            <div style={{ marginTop:4, fontSize:10 }}>
                              <a href={c.offer_url} target="_blank" rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                style={{ color:'#3b82f6', textDecoration:'none' }}>📎 Oferta</a>
                            </div>
                          )}
                          {c.category && <div style={{ marginTop:4, fontSize:9, color:t.textFade }}>{c.category}</div>}
                          {c.owner && (() => { const o = OWNERS.find(x => x.id === c.owner); return o
                            ? <div style={{ marginTop:4, display:'inline-block', background:o.color+'22',
                                color:o.color, border:'1px solid '+o.color+'44', borderRadius:4,
                                padding:'1px 6px', fontSize:9, fontWeight:600 }}>{o.label}</div>
                            : null })()}
                        </div>
                      )
                    })}
                    {cards.length === 0 && (
                      <div style={{ textAlign:'center', padding:'20px 0', color:t.textFade, fontSize:11 }}>Przeciągnij tutaj</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* LIST */}
        {view === 'list' && (
          <div style={{ flex:1, overflowY:'auto', padding:'16px 20px' }}>
            <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:10, overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ borderBottom:`1px solid ${t.border}`, background:t.bgCol }}>
                    {['Firma','Kategoria','Właściciel','Etap','Priorytet','Follow-up','Oferta',''].map(h => (
                      <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:10,
                        fontWeight:600, color:t.textMute, textTransform:'uppercase', letterSpacing:'.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c, i) => {
                    const stage = STAGES.find(s => s.id === c.stage)
                    const overdue = isOverdue(c.followup_date) && c.stage !== 'won' && c.stage !== 'lost'
                    const today = isDueToday(c.followup_date)
                    const isSel = selected === c.id
                    return (
                      <tr key={c.id} onClick={() => setSelected(c.id)}
                        style={{ borderBottom:i<filtered.length-1?`1px solid ${t.border3}`:'none',
                          cursor:'pointer', background:isSel?t.selCard:'transparent', transition:'background .12s' }}
                        onMouseEnter={e => !isSel && ((e.currentTarget as HTMLElement).style.background = t.bgHover)}
                        onMouseLeave={e => !isSel && ((e.currentTarget as HTMLElement).style.background = 'transparent')}>
                        <td style={{ padding:'10px 14px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <div style={{ width:28, height:28, borderRadius:'50%', background:t.bg,
                              border:`2px solid ${PRIORITY_COLORS[c.priority]||'#64748b'}`,
                              display:'flex', alignItems:'center', justifyContent:'center',
                              fontSize:10, fontWeight:700, color:PRIORITY_COLORS[c.priority]||'#64748b', flexShrink:0 }}>
                              {ini(c.company)}
                            </div>
                            <span style={{ fontWeight:500, fontSize:13 }}>{c.company}</span>
                          </div>
                        </td>
                        <td style={{ padding:'10px 14px' }}>
                          {c.category && <span style={{ background:t.badge, border:`1px solid ${t.border2}`,
                            borderRadius:4, padding:'2px 8px', fontSize:11, color:t.textSub }}>{c.category}</span>}
                        </td>
                        <td style={{ padding:'10px 14px' }}>
                          {(() => { const o = OWNERS.find(x => x.id === c.owner); return o
                            ? <span style={{ background:o.color+'22', color:o.color,
                                border:'1px solid '+o.color+'44', borderRadius:4,
                                padding:'2px 8px', fontSize:11, fontWeight:600 }}>{o.label}</span>
                            : <span style={{ color:t.textFade, fontSize:11 }}>—</span> })()}
                        </td>
                        <td style={{ padding:'10px 14px' }}>
                          <span style={{ background:`${stage?.color}20`, color:stage?.color,
                            border:`1px solid ${stage?.color}33`, borderRadius:4,
                            padding:'2px 8px', fontSize:11, fontWeight:500 }}>{stage?.label}</span>
                        </td>
                        <td style={{ padding:'10px 14px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                            <div style={{ width:6, height:6, borderRadius:'50%', background:PRIORITY_COLORS[c.priority]||'#64748b' }}/>
                            <span style={{ fontSize:12, color:PRIORITY_COLORS[c.priority]||t.textMute, fontWeight:600 }}>{c.priority}/10</span>
                          </div>
                        </td>
                        <td style={{ padding:'10px 14px', fontSize:11,
                          color: overdue?t.overdueText:today?t.todayText:t.textMute,
                          fontWeight:(overdue||today)?600:400 }}>
                          {c.followup_date ? `${overdue?'⚠️ ':today?'🟢 ':''}${fmtDate(c.followup_date)}` : '—'}
                        </td>
                        <td style={{ padding:'10px 14px' }}>
                          {c.offer_url
                            ? <a href={c.offer_url} target="_blank" rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                style={{ color:'#3b82f6', fontSize:12, textDecoration:'none' }}>📎 Oferta</a>
                            : <span style={{ color:t.textFade, fontSize:11 }}>—</span>}
                        </td>
                        <td style={{ padding:'10px 14px' }}>
                          <button onClick={e => { e.stopPropagation(); setEditContact({...c}) }}
                            style={{ background:t.badge, border:`1px solid ${t.border2}`,
                              borderRadius:5, padding:'4px 8px', cursor:'pointer', fontSize:11, color:t.textSub }}>✏️</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* FOLLOW-UPS */}
        {view === 'followups' && (
          <div style={{ flex:1, overflowY:'auto', padding:'16px 20px' }}>
            <div style={{ marginBottom:16, display:'flex', alignItems:'center', gap:10 }}>
              <h2 style={{ fontSize:16, fontWeight:600 }}>📅 Follow-upy</h2>
              {overdueCount > 0 && (
                <span style={{ background:t.toastErr, color:t.toastErrB, border:`1px solid ${t.toastErrB}`,
                  borderRadius:20, padding:'2px 10px', fontSize:11, fontWeight:600 }}>
                  {overdueCount} zaległych
                </span>
              )}
            </div>
            {followups.length === 0 ? (
              <div style={{ textAlign:'center', padding:'60px 0', color:t.textFade }}>
                Brak zaplanowanych follow-upów.<br/>Dodaj je edytując kontakt.
              </div>
            ) : followups.map(c => {
              const stage = STAGES.find(s => s.id === c.stage)
              const overdue = isOverdue(c.followup_date) && c.stage !== 'won' && c.stage !== 'lost'
              const today = isDueToday(c.followup_date)
              return (
                <div key={c.id} onClick={() => { setSelected(c.id); setView('pipeline') }}
                  style={{ background:t.bgCard,
                    border:`1px solid ${overdue?t.overdueText+'66':today?t.todayText+'66':t.border2}`,
                    borderRadius:10, padding:'14px 16px', marginBottom:8, cursor:'pointer',
                    display:'flex', alignItems:'center', gap:14, transition:'all .12s', animation:'fadeIn .2s ease' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = t.bgHover}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = t.bgCard}>
                  <div style={{ width:36, height:36, borderRadius:'50%', background:t.bg,
                    border:`2px solid ${PRIORITY_COLORS[c.priority]||'#64748b'}`,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:11, fontWeight:700, color:PRIORITY_COLORS[c.priority]||'#64748b', flexShrink:0 }}>
                    {ini(c.company)}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, fontSize:14 }}>{c.company}</div>
                    <div style={{ fontSize:11, color:t.textMute }}>{c.position}{c.category && ` · ${c.category}`}</div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontSize:12, fontWeight:600,
                      color: overdue?t.overdueText:today?t.todayText:t.textSub }}>
                      {overdue ? '⚠️ Zaległe' : today ? '🟢 Dziś' : '📅'} {fmtDate(c.followup_date)}
                    </div>
                    <div style={{ marginTop:2 }}>
                      <span style={{ background:`${stage?.color}20`, color:stage?.color,
                        border:`1px solid ${stage?.color}33`, borderRadius:4,
                        padding:'1px 6px', fontSize:10 }}>{stage?.label}</span>
                    </div>
                  </div>
                  {c.owner && (() => { const o = OWNERS.find(x => x.id === c.owner); return o
                    ? <span style={{ background:o.color+'22', color:o.color, border:'1px solid '+o.color+'44',
                        borderRadius:4, padding:'2px 8px', fontSize:11, fontWeight:600, flexShrink:0 }}>{o.label}</span>
                    : null })()}
                </div>
              )
            })}
          </div>
        )}

        {/* STATS */}
        {view === 'stats' && (
          <div style={{ flex:1, overflowY:'auto', padding:'24px 28px' }}>
            <h2 style={{ fontSize:18, fontWeight:600, marginBottom:24 }}>📊 Statystyki</h2>

            {/* KPI Cards */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:28 }}>
              {[
                { label:'Wszystkich kontaktów', value:contacts.length, icon:'👥', color:'#60a5fa' },
                { label:'Aktywności łącznie', value:totalActivities, icon:'📋', color:'#a78bfa' },
                { label:'Aktywności (7 dni)', value:weekActivities, icon:'🔥', color:'#f59e0b' },
                { label:'Zaległe follow-upy', value:overdueCount, icon:'⚠️', color: overdueCount>0?'#ef4444':'#22c55e' },
              ].map(kpi => (
                <div key={kpi.label} style={{ background:t.bgCard, border:`1px solid ${t.border2}`,
                  borderRadius:10, padding:'16px 18px', animation:'fadeIn .3s ease' }}>
                  <div style={{ fontSize:22, marginBottom:6 }}>{kpi.icon}</div>
                  <div style={{ fontSize:26, fontWeight:700, color:kpi.color }}>{kpi.value}</div>
                  <div style={{ fontSize:11, color:t.textMute, marginTop:3 }}>{kpi.label}</div>
                </div>
              ))}
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
              {/* Etapy */}
              <div style={{ background:t.bgCard, border:`1px solid ${t.border2}`, borderRadius:10, padding:'18px 20px' }}>
                <div style={{ fontWeight:600, fontSize:14, marginBottom:16 }}>Kontakty wg etapu</div>
                {stageStats.map(s => (
                  <div key={s.id} style={{ marginBottom:12 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <span style={{ fontSize:12, color:t.textSub }}>{s.label}</span>
                      <span style={{ fontSize:12, fontWeight:600, color:s.color }}>{s.count}</span>
                    </div>
                    <div style={{ height:6, background:t.border2, borderRadius:3, overflow:'hidden' }}>
                      <div style={{ height:'100%', background:s.color, borderRadius:3,
                        width:`${(s.count/maxStage)*100}%`, transition:'width .6s ease' }}/>
                    </div>
                  </div>
                ))}
              </div>

              {/* Kategorie */}
              <div style={{ background:t.bgCard, border:`1px solid ${t.border2}`, borderRadius:10, padding:'18px 20px' }}>
                <div style={{ fontWeight:600, fontSize:14, marginBottom:16 }}>Kontakty wg kategorii</div>
                {catStats.map((x,i) => {
                  const colors = ['#60a5fa','#a78bfa','#f59e0b','#22c55e','#ef4444','#14b8a6','#f97316']
                  const color = colors[i % colors.length]
                  return (
                    <div key={x.cat} style={{ marginBottom:12 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                        <span style={{ fontSize:12, color:t.textSub }}>{x.cat}</span>
                        <span style={{ fontSize:12, fontWeight:600, color }}>{x.count}</span>
                      </div>
                      <div style={{ height:6, background:t.border2, borderRadius:3, overflow:'hidden' }}>
                        <div style={{ height:'100%', background:color, borderRadius:3,
                          width:`${(x.count/contacts.length)*100}%`, transition:'width .6s ease' }}/>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Właściciele */}
              <div style={{ background:t.bgCard, border:`1px solid ${t.border2}`, borderRadius:10, padding:'18px 20px' }}>
                <div style={{ fontWeight:600, fontSize:14, marginBottom:16 }}>Podział właścicieli</div>
                {OWNERS.map(o => {
                  const cnt = contacts.filter(c => c.owner === o.id).length
                  return (
                    <div key={o.id} style={{ marginBottom:12 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                        <span style={{ fontSize:12, color:t.textSub }}>{o.label}</span>
                        <span style={{ fontSize:12, fontWeight:600, color:o.color }}>{cnt}</span>
                      </div>
                      <div style={{ height:6, background:t.border2, borderRadius:3, overflow:'hidden' }}>
                        <div style={{ height:'100%', background:o.color, borderRadius:3,
                          width:`${(cnt/contacts.length)*100}%`, transition:'width .6s ease' }}/>
                      </div>
                    </div>
                  )
                })}
                <div style={{ marginBottom:12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <span style={{ fontSize:12, color:t.textSub }}>Nieprzypisane</span>
                    <span style={{ fontSize:12, fontWeight:600, color:t.textMute }}>{contacts.filter(c => !c.owner).length}</span>
                  </div>
                  <div style={{ height:6, background:t.border2, borderRadius:3, overflow:'hidden' }}>
                    <div style={{ height:'100%', background:t.textMute, borderRadius:3,
                      width:`${(contacts.filter(c => !c.owner).length/contacts.length)*100}%`, transition:'width .6s ease' }}/>
                  </div>
                </div>
              </div>

              {/* Top priorytety */}
              <div style={{ background:t.bgCard, border:`1px solid ${t.border2}`, borderRadius:10, padding:'18px 20px' }}>
                <div style={{ fontWeight:600, fontSize:14, marginBottom:16 }}>Top 8 — najwyższy priorytet</div>
                {contacts.slice().sort((a,b) => (b.priority||0)-(a.priority||0)).slice(0,8).map(c => (
                  <div key={c.id} onClick={() => { setSelected(c.id); setView('pipeline') }}
                    style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8,
                      cursor:'pointer', padding:'4px 6px', borderRadius:6, transition:'background .12s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = t.bgHover}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                    <div style={{ width:22, height:22, borderRadius:'50%', background:t.bg,
                      border:`2px solid ${PRIORITY_COLORS[c.priority]||'#64748b'}`,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:8, fontWeight:700, color:PRIORITY_COLORS[c.priority]||'#64748b', flexShrink:0 }}>
                      {ini(c.company)}
                    </div>
                    <span style={{ fontSize:12, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.company}</span>
                    <span style={{ fontSize:11, fontWeight:700, color:PRIORITY_COLORS[c.priority]||t.textMute }}>{c.priority}/10</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {selContact && (
          <DetailPanel
            contact={selContact} t={t}
            onClose={() => setSelected(null)}
            onStageChange={sid => moveToStage(selContact.id, sid)}
            onOwnerChange={oid => handleOwnerChange(selContact.id, oid)}
            onAddActivity={act => handleAddActivity(selContact.id, act)}
            onDeleteActivity={(actId) => handleDeleteActivity(selContact.id, actId)}
            onEdit={() => setEditContact({...selContact})}
            onDelete={() => setConfirmDel(selContact)}
          />
        )}
      </div>

      {confirmDel && (
        <div onClick={() => setConfirmDel(null)} style={{ position:'fixed', inset:0,
          background:'rgba(0,0,0,.6)', display:'flex', alignItems:'center',
          justifyContent:'center', zIndex:1000, padding:16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background:t.bgCard,
            border:`1px solid ${t.delBorder}`, borderRadius:12, padding:28,
            width:340, textAlign:'center', animation:'fadeIn .15s ease' }}>
            <div style={{ fontSize:36, marginBottom:12 }}>🗑️</div>
            <div style={{ fontWeight:600, fontSize:16, marginBottom:6 }}>Usunąć kontakt?</div>
            <div style={{ fontSize:13, color:t.textMute, marginBottom:4 }}>{confirmDel.company}</div>
            <div style={{ fontSize:12, color:t.textFade, marginBottom:24 }}>Operacja jest nieodwracalna.</div>
            <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
              <button onClick={() => setConfirmDel(null)}
                style={{ background:t.badge, border:`1px solid ${t.border2}`, borderRadius:7,
                  padding:'9px 20px', cursor:'pointer', color:t.textSub, fontFamily:'inherit', fontSize:13 }}>Anuluj</button>
              <button onClick={() => handleDelete(confirmDel.id)}
                style={{ background:t.delBg, border:`1px solid ${t.delBorder}`, borderRadius:7,
                  padding:'9px 20px', cursor:'pointer', color:t.delColor,
                  fontFamily:'inherit', fontWeight:600, fontSize:13 }}>Usuń</button>
            </div>
          </div>
        </div>
      )}

      {editContact && (
        <ContactModal contact={editContact} t={t} onSave={handleSaveContact} onClose={() => setEditContact(null)}/>
      )}

      {showImport && (
        <ImportModal t={t} onClose={() => setShowImport(false)}
          onImport={async (rows) => {
            setSaving(true)
            let ok = 0
            for (const row of rows) {
              try { await upsertContact(row); ok++ } catch {}
            }
            await load()
            setSaving(false)
            setShowImport(false)
            showToast(`Zaimportowano ${ok} z ${rows.length} kontaktów ✓`)
          }}
        />
      )}
    </div>
  )
}

function Pill({ active, color, borderActive, onClick, t, children }: {
  active:boolean; color:string; borderActive:string;
  onClick:()=>void; t:Theme; children:React.ReactNode
}) {
  return (
    <button onClick={onClick} style={{ padding:'4px 10px', borderRadius:6,
      border:`1px solid ${active?borderActive+'88':t.border2}`,
      background:active?color+'22':t.badge, color:active?color:t.textMute,
      cursor:'pointer', fontSize:11, fontFamily:'inherit', fontWeight:active?600:400,
      display:'flex', alignItems:'center', gap:4, transition:'all .15s', whiteSpace:'nowrap' }}>
      {children}
    </button>
  )
}

function DetailPanel({ contact, t, onClose, onStageChange, onOwnerChange, onAddActivity, onDeleteActivity, onEdit, onDelete }: {
  contact:Contact; t:Theme; onClose:()=>void;
  onStageChange:(s:string)=>void; onOwnerChange:(o:string)=>void;
  onAddActivity:(a:{type:string;text:string;date:string})=>void;
  onDeleteActivity:(id:string)=>void;
  onEdit:()=>void; onDelete:()=>void;
}) {
  const [actType, setActType] = useState('note')
  const [actText, setActText] = useState('')
  const [actDate, setActDate] = useState(new Date().toISOString().split('T')[0])
  const stage = STAGES.find(s => s.id === contact.stage)
  const overdue = isOverdue(contact.followup_date) && contact.stage !== 'won' && contact.stage !== 'lost'
  const today = isDueToday(contact.followup_date)

  return (
    <div style={{ width:360, flexShrink:0, borderLeft:`1px solid ${t.border}`,
      display:'flex', flexDirection:'column', background:t.bgPanel,
      animation:'slideRight .2s ease', overflow:'hidden', transition:'background .25s' }}>
      <div style={{ padding:'14px 16px', borderBottom:`1px solid ${t.border}`, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            <div style={{ width:38, height:38, borderRadius:'50%', background:t.bg,
              border:`2px solid ${PRIORITY_COLORS[contact.priority]||stage?.color}`,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:13, fontWeight:700, color:PRIORITY_COLORS[contact.priority]||stage?.color, flexShrink:0 }}>
              {ini(contact.company)}
            </div>
            <div>
              <div style={{ fontWeight:600, fontSize:15 }}>{contact.company}</div>
              <div style={{ fontSize:11, color:t.textMute, display:'flex', gap:6, alignItems:'center' }}>
                {contact.name}
                {contact.category && <span style={{ background:t.badge, border:`1px solid ${t.border2}`,
                  borderRadius:3, padding:'1px 5px', fontSize:10 }}>{contact.category}</span>}
              </div>
            </div>
          </div>
          <div style={{ display:'flex', gap:5 }}>
            <button onClick={onEdit} style={{ background:t.badge, border:`1px solid ${t.border2}`,
              borderRadius:5, padding:'4px 8px', cursor:'pointer', fontSize:12, color:t.textSub }}>✏️</button>
            <button onClick={onDelete} style={{ background:t.delBg, border:`1px solid ${t.delBorder}`,
              borderRadius:5, padding:'4px 8px', cursor:'pointer', fontSize:12, color:t.delColor }}>🗑️</button>
            <button onClick={onClose} style={{ background:t.badge, border:`1px solid ${t.border2}`,
              borderRadius:5, padding:'4px 8px', cursor:'pointer', fontSize:14, color:t.textMute }}>✕</button>
          </div>
        </div>

        {contact.followup_date && (
          <div style={{ marginTop:10, padding:'6px 10px', borderRadius:6, fontSize:12, fontWeight:500,
            background: overdue?t.overdue:today?t.today:t.badge,
            color: overdue?t.overdueText:today?t.todayText:t.textMute,
            border:`1px solid ${overdue?t.overdueText+'44':today?t.todayText+'44':t.border2}` }}>
            📅 {overdue?'⚠️ Zaległe — ':today?'🟢 Dziś — ':''}{fmtDate(contact.followup_date)}
          </div>
        )}

        <div style={{ marginTop:10 }}>
          <div style={{ fontSize:10, color:t.textMute, marginBottom:6,
            textTransform:'uppercase', letterSpacing:'.05em', fontWeight:600 }}>Etap</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
            {STAGES.map(s => (
              <button key={s.id} onClick={() => onStageChange(s.id)}
                style={{ padding:'4px 9px', borderRadius:5,
                  border:`1px solid ${contact.stage===s.id?s.color+'88':s.color+'22'}`,
                  background:contact.stage===s.id?s.color+'22':'transparent',
                  color:contact.stage===s.id?s.color:t.textMute, cursor:'pointer',
                  fontSize:10, fontFamily:'inherit', fontWeight:contact.stage===s.id?600:400 }}>{s.label}</button>
            ))}
          </div>
        </div>

        <div style={{ marginTop:10 }}>
          <div style={{ fontSize:10, color:t.textMute, marginBottom:6,
            textTransform:'uppercase', letterSpacing:'.05em', fontWeight:600 }}>Właściciel</div>
          <div style={{ display:'flex', gap:6 }}>
            <button onClick={() => onOwnerChange('')}
              style={{ padding:'4px 10px', borderRadius:5,
                border:`1px solid ${contact.owner===''?t.border2+'88':t.border2}`,
                background:contact.owner===''?t.badge:'transparent',
                color:contact.owner===''?t.textSub:t.textMute,
                cursor:'pointer', fontSize:11, fontFamily:'inherit', fontWeight:contact.owner===''?600:400 }}>Brak</button>
            {OWNERS.map(o => (
              <button key={o.id} onClick={() => onOwnerChange(o.id)}
                style={{ padding:'4px 12px', borderRadius:5,
                  border:`1px solid ${contact.owner===o.id?o.color+'88':o.color+'22'}`,
                  background:contact.owner===o.id?o.color+'22':'transparent',
                  color:contact.owner===o.id?o.color:t.textMute, cursor:'pointer',
                  fontSize:11, fontFamily:'inherit', fontWeight:contact.owner===o.id?600:400,
                  display:'flex', alignItems:'center', gap:5 }}>
                <span style={{ width:6, height:6, borderRadius:'50%',
                  background:contact.owner===o.id?o.color:t.border2, display:'inline-block' }}/>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding:'10px 16px', borderBottom:`1px solid ${t.border3}`, flexShrink:0 }}>
        {([['✉️','E-mail',contact.email],['📞','Telefon',contact.phone],['💼','Stanowisko',contact.position]] as const)
          .filter(r => r[2]).map(([icon,label,val]) => (
          <div key={label} style={{ display:'flex', gap:8, alignItems:'center', marginBottom:5 }}>
            <span style={{ fontSize:12 }}>{icon}</span>
            <span style={{ fontSize:10, color:t.textMute, width:60, flexShrink:0 }}>{label}</span>
            <span style={{ fontSize:12, color:t.textSub }}>{val}</span>
          </div>
        ))}
        <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:5 }}>
          <span style={{ fontSize:12 }}>⭐</span>
          <span style={{ fontSize:10, color:t.textMute, width:60, flexShrink:0 }}>Priorytet</span>
          <span style={{ fontSize:12, fontWeight:600, color:PRIORITY_COLORS[contact.priority]||t.textSub }}>{contact.priority}/10</span>
        </div>
        {contact.offer_url && (
          <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:5 }}>
            <span style={{ fontSize:12 }}>📎</span>
            <span style={{ fontSize:10, color:t.textMute, width:60, flexShrink:0 }}>Oferta</span>
            <a href={contact.offer_url} target="_blank" rel="noopener noreferrer"
              style={{ fontSize:12, color:'#3b82f6', textDecoration:'none', overflow:'hidden',
                textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:200 }}>
              Otwórz link →
            </a>
          </div>
        )}
        {contact.notes && (
          <div style={{ marginTop:6, background:t.notesBg, borderRadius:6, padding:'8px 10px',
            fontSize:11, color:t.textMute, whiteSpace:'pre-line', border:`1px solid ${t.border}` }}>
            {contact.notes}
          </div>
        )}
      </div>

      <div style={{ padding:'10px 16px', borderBottom:`1px solid ${t.border3}`, flexShrink:0 }}>
        <div style={{ fontSize:10, color:t.textMute, marginBottom:8,
          textTransform:'uppercase', letterSpacing:'.05em', fontWeight:600 }}>Dodaj aktywność</div>
        <div style={{ display:'flex', gap:4, marginBottom:8 }}>
          {ACTIVITY_TYPES.map(a => (
            <button key={a.id} onClick={() => setActType(a.id)} title={a.label}
              style={{ flex:1, padding:'6px 2px', borderRadius:6,
                border:`1px solid ${actType===a.id?t.accent+'88':t.border2}`,
                background:actType===a.id?t.accent+'22':t.badge,
                cursor:'pointer', fontSize:14, transition:'all .12s' }}>{a.icon}</button>
          ))}
        </div>
        <textarea value={actText} onChange={e => setActText(e.target.value)}
          placeholder="Co się wydarzyło?" rows={2}
          style={{ marginBottom:6, fontSize:12, background:t.bgInput,
            border:`1px solid ${t.border2}`, color:t.text, borderRadius:7,
            padding:'8px 11px', width:'100%', resize:'vertical', fontFamily:'inherit', outline:'none' }}/>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          <input type="date" value={actDate} onChange={e => setActDate(e.target.value)}
            style={{ flex:1, fontSize:12, background:t.bgInput, border:`1px solid ${t.border2}`,
              color:t.text, borderRadius:7, padding:'7px 10px', fontFamily:'inherit', outline:'none' }}/>
          <button onClick={() => { if (!actText.trim()) return; onAddActivity({type:actType,text:actText.trim(),date:actDate}); setActText('') }}
            style={{ background:t.accent, color:t.accentFg, border:'none', borderRadius:6,
              padding:'7px 14px', cursor:'pointer', fontFamily:'inherit', fontWeight:600, fontSize:12, flexShrink:0 }}>Dodaj</button>
        </div>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'10px 16px' }}>
        <div style={{ fontSize:10, color:t.textMute, marginBottom:10,
          textTransform:'uppercase', letterSpacing:'.05em', fontWeight:600 }}>
          Historia {contact.activities?.length ? `(${contact.activities.length})` : ''}
        </div>
        {!contact.activities?.length ? (
          <div style={{ textAlign:'center', padding:'24px 0', color:t.textFade, fontSize:12 }}>
            Brak aktywności.<br/>Dodaj pierwszą powyżej.
          </div>
        ) : contact.activities.map((act, i) => {
          const aType = ACTIVITY_TYPES.find(a => a.id === act.type) ?? ACTIVITY_TYPES[3]
          return (
            <div key={act.id} style={{ display:'flex', gap:10, marginBottom:14 }}>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0 }}>
                <div style={{ width:28, height:28, borderRadius:'50%', background:t.bgCard,
                  border:`1px solid ${t.border2}`, display:'flex', alignItems:'center',
                  justifyContent:'center', fontSize:13 }}>{aType.icon}</div>
                {i < contact.activities!.length-1 &&
                  <div style={{ width:1, flex:1, background:t.timelineLine, marginTop:4 }}/>}
              </div>
              <div style={{ flex:1, paddingBottom:i < contact.activities!.length-1 ? 14 : 0 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:3 }}>
                  <span style={{ fontSize:11, fontWeight:600 }}>{aType.label}</span>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ fontSize:10, color:t.textMute }}>{fmtDate(act.date || act.created_at)}</span>
                    <button onClick={() => onDeleteActivity(act.id)}
                      title="Usuń aktywność"
                      style={{ background:'none', border:'none', cursor:'pointer', fontSize:11,
                        color:t.textFade, padding:'0 2px', lineHeight:1 }}>✕</button>
                  </div>
                </div>
                <div style={{ fontSize:12, color:t.textSub, lineHeight:1.5 }}>{act.text}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ContactModal({ contact, t, onSave, onClose }: {
  contact:Partial<Contact>; t:Theme;
  onSave:(d:Partial<Contact>)=>void; onClose:()=>void
}) {
  const [form, setForm] = useState<Partial<Contact>>({ ...contact })
  const set = (k: keyof Contact, v: any) => setForm(p => ({ ...p, [k]: v }))
  const inputStyle: React.CSSProperties = {
    background:t.bgInput, border:`1px solid ${t.border2}`, color:t.text,
    borderRadius:7, padding:'8px 11px', fontSize:13, width:'100%', outline:'none', fontFamily:'inherit'
  }
  const labelStyle: React.CSSProperties = {
    display:'block', fontSize:10, color:t.textMute, marginBottom:4,
    textTransform:'uppercase', letterSpacing:'.05em', fontWeight:600
  }
  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)',
      display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:t.bgCard,
        border:`1px solid ${t.border2}`, borderRadius:12, padding:24,
        width:520, maxHeight:'90vh', overflowY:'auto', animation:'fadeIn .2s ease' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
          <h2 style={{ fontSize:16, fontWeight:600 }}>{form.id ? '✏️ Edytuj kontakt' : '➕ Nowy kontakt'}</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', color:t.textMute, cursor:'pointer', fontSize:18 }}>✕</button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          {([['Firma *','company','text'],['Imię i nazwisko','name','text'],
             ['Stanowisko','position','text'],['Telefon','phone','tel'],
             ['E-mail','email','email'],['Sieć / Kanał','network','text']] as const)
            .map(([label,key,type]) => (
            <div key={key}>
              <label style={labelStyle}>{label}</label>
              <input type={type} value={(form as any)[key]||''} onChange={e => set(key as keyof Contact, e.target.value)} style={inputStyle}/>
            </div>
          ))}
          <div>
            <label style={labelStyle}>Kategoria</label>
            <select value={form.category||''} onChange={e => set('category', e.target.value)} style={inputStyle}>
              <option value="">— Wybierz —</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Priorytet (1-10)</label>
            <input type="number" min={1} max={10} value={form.priority||5}
              onChange={e => set('priority', parseInt(e.target.value))} style={inputStyle}/>
          </div>
          <div>
            <label style={labelStyle}>Właściciel</label>
            <select value={form.owner||''} onChange={e => set('owner', e.target.value)} style={inputStyle}>
              <option value="">— Brak —</option>
              {OWNERS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Etap</label>
            <select value={form.stage||'lead'} onChange={e => set('stage', e.target.value)} style={inputStyle}>
              {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div style={{ gridColumn:'span 2' }}>
            <label style={labelStyle}>Follow-up date</label>
            <input type="date" value={form.followup_date||''} onChange={e => set('followup_date', e.target.value)} style={inputStyle}/>
          </div>
          <div style={{ gridColumn:'span 2' }}>
            <label style={labelStyle}>Link do oferty / prezentacji (Google Drive)</label>
            <input type="url" value={form.offer_url||''} onChange={e => set('offer_url', e.target.value)}
              placeholder="https://drive.google.com/..." style={inputStyle}/>
          </div>
          <div style={{ gridColumn:'span 2' }}>
            <label style={labelStyle}>Notatki</label>
            <textarea value={form.notes||''} onChange={e => set('notes', e.target.value)}
              rows={3} placeholder="Strategia, uwagi, kontekst..."
              style={{ ...inputStyle, resize:'vertical' }}/>
          </div>
        </div>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:18 }}>
          <button onClick={onClose} style={{ background:t.badge, border:`1px solid ${t.border2}`,
            borderRadius:7, padding:'8px 16px', cursor:'pointer', color:t.textSub, fontFamily:'inherit', fontSize:13 }}>Anuluj</button>
          <button onClick={() => { if (!form.company?.trim()) return; onSave(form) }}
            style={{ background:t.accent, color:t.accentFg, border:'none', borderRadius:7,
              padding:'8px 16px', cursor:'pointer', fontFamily:'inherit', fontWeight:600, fontSize:13 }}>
            {form.id ? 'Zapisz zmiany' : 'Dodaj kontakt'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── IMPORT MODAL ────────────────────────────────────────────────────────────

const IMPORT_FIELDS: { id: keyof Contact | ''; label: string; required?: boolean }[] = [
  { id: '',             label: '— Pomiń —' },
  { id: 'company',      label: 'Firma',              required: true },
  { id: 'name',         label: 'Imię i nazwisko' },
  { id: 'position',     label: 'Stanowisko' },
  { id: 'phone',        label: 'Telefon' },
  { id: 'email',        label: 'E-mail' },
  { id: 'network',      label: 'Sieć / Kanał' },
  { id: 'category',     label: 'Kategoria' },
  { id: 'owner',        label: 'Właściciel (MP/KK)' },
  { id: 'stage',        label: 'Etap' },
  { id: 'priority',     label: 'Priorytet (1-10)' },
  { id: 'followup_date',label: 'Follow-up date' },
  { id: 'offer_url',    label: 'Link do oferty' },
  { id: 'notes',        label: 'Notatki' },
]

function normCol(col: string): string {
  return col.toLowerCase()
    .replace(/ą/g,'a').replace(/ć/g,'c').replace(/ę/g,'e').replace(/ł/g,'l')
    .replace(/ń/g,'n').replace(/ó/g,'o').replace(/ś/g,'s').replace(/ź/g,'z').replace(/ż/g,'z')
    .replace(/[^a-z0-9]/g,'')
}

function autoMap(col: string): keyof Contact | '' {
  const c = normCol(col)
  // company
  if (c === 'siec' || c.includes('firma') || c.includes('company') || c.includes('nazwa')) return 'company'
  // name
  if (c.includes('imie') || c.includes('imię') || c === 'name' || c.includes('osoba')) return 'name'
  // position / format
  if (c.includes('stanowisko') || c.includes('position') || c.includes('rola') || c.includes('format')) return 'position'
  // phone / email
  if (c.includes('tel') || c.includes('phone') || c.includes('mob')) return 'phone'
  if (c.includes('mail')) return 'email'
  // category / segment
  if (c.includes('segment') || c.includes('kategoria') || c.includes('category')) return 'category'
  // network / channel
  if (c.includes('network') || c.includes('kanal') || c.includes('zrodlo')) return 'network'
  // owner
  if (c.includes('przypisane') || c.includes('owner') || c.includes('opiekun')) return 'owner'
  // stage
  if (c.includes('etap') || c.includes('stage') || c.includes('status')) return 'stage'
  // priority — wynik 0-100 and tier A/B/C both map here, converted in buildContact
  if (c.includes('wynik') || c.includes('priorytet') || c.includes('priority') || c === 'tier') return 'priority'
  // follow-up
  if (c.includes('followup') || c.includes('follow') || c.includes('datakontaktu')) return 'followup_date'
  // offer url
  if (c.includes('url') || c.includes('link') || c.includes('oferta') || c.includes('offer')) return 'offer_url'
  // notes — uzasadnienie, notatki, ryzyka
  if (c.includes('notatk') || c.includes('note') || c.includes('uwag') ||
      c.includes('uzasadnienie') || c.includes('ryzyko') || c.includes('ryzyka')) return 'notes'
  return ''
}

function validateRow(row: Record<string, string>, mapping: Record<string, keyof Contact | ''>): string[] {
  const errors: string[] = []
  const mapped: Partial<Contact> = {}
  for (const [col, field] of Object.entries(mapping)) {
    if (field && row[col] !== undefined) (mapped as any)[field] = row[col]
  }
  if (!mapped.company?.trim()) errors.push('Brak nazwy firmy')
  if (mapped.followup_date) {
    const d = new Date(mapped.followup_date as string)
    if (isNaN(d.getTime())) errors.push('Nieprawidłowy format daty follow-up')
  }
  // priority: accept 1-10, 0-100 (auto-scaled), or A/B/C tier — all handled in buildContact
  // owner: unmapped values silently become '' — no hard error
  // stage: unknown values default to 'lead' — no hard error
  return errors
}

function parsePriority(val: string): number {
  const t = val.trim().toUpperCase()
  if (t === 'A') return 9
  if (t === 'B') return 6
  if (t === 'C') return 3
  const n = parseFloat(t)
  if (isNaN(n)) return 5
  if (n > 10) return Math.round(Math.min(10, Math.max(1, (n / 100) * 9 + 1))) // 0-100 → 1-10
  return Math.min(10, Math.max(1, Math.round(n)))
}

function parseOwner(val: string): string {
  const v = val.trim().toUpperCase()
  if (v === 'MP' || v.startsWith('M')) return 'MP'
  if (v === 'KK' || v.startsWith('K')) return 'KK'
  return ''
}

function buildContact(row: Record<string, string>, mapping: Record<string, keyof Contact | ''>): Partial<Contact> {
  const c: Partial<Contact> = { stage: 'lead', priority: 5, owner: '' }
  const notesParts: string[] = []
  for (const [col, field] of Object.entries(mapping)) {
    if (!field || row[col] === undefined || row[col] === '') continue
    const val = row[col].trim()
    if (field === 'priority') {
      c.priority = parsePriority(val)
    } else if (field === 'notes') {
      // multiple columns mapped to notes get concatenated
      notesParts.push(`${col}: ${val}`)
    } else if (field === 'owner') {
      c.owner = parseOwner(val)
    } else if (field === 'stage') {
      const matched = STAGES.find(s => s.id === val || normCol(s.label) === normCol(val))
      c.stage = matched ? matched.id : 'lead'
    } else if (field === 'followup_date') {
      const d = new Date(val)
      c.followup_date = isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0]
    } else {
      (c as any)[field] = val
    }
  }
  if (notesParts.length) c.notes = notesParts.join('\n')
  return c
}

function ImportModal({ t, onClose, onImport }: {
  t: Theme
  onClose: () => void
  onImport: (rows: Partial<Contact>[]) => Promise<void>
}) {
  const [step, setStep]       = useState<1|2|3>(1)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows]       = useState<Record<string, string>[]>([])
  const [mapping, setMapping] = useState<Record<string, keyof Contact | ''>>({})
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const inputStyle: React.CSSProperties = {
    background: t.bgInput, border: `1px solid ${t.border2}`, color: t.text,
    borderRadius: 7, padding: '6px 10px', fontSize: 12, outline: 'none', fontFamily: 'inherit', width: '100%'
  }

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = e => {
      const buf = e.target!.result as ArrayBuffer
      let wb: XLSX.WorkBook
      if (file.name.toLowerCase().endsWith('.csv')) {
        // Try UTF-8; if replacement chars appear, fall back to Windows-1250 (Excel default for Polish)
        let text = new TextDecoder('utf-8').decode(buf)
        if (text.includes('\uFFFD')) text = new TextDecoder('windows-1250').decode(buf)
        wb = XLSX.read(text, { type: 'string' })
      } else {
        wb = XLSX.read(buf, { type: 'array', cellDates: true })
      }
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      if (data.length < 2) return
      const hdrs = (data[0] as string[]).map(h => String(h ?? '').trim())
      const dataRows = data.slice(1).filter(r => r.some(v => v !== '')).map(r =>
        Object.fromEntries(hdrs.map((h, i) => [h, String(r[i] ?? '').trim()]))
      )
      setHeaders(hdrs)
      setRows(dataRows)
      const initMap: Record<string, keyof Contact | ''> = {}
      hdrs.forEach(h => { initMap[h] = autoMap(h) })
      setMapping(initMap)
      setStep(2)
    }
    reader.readAsArrayBuffer(file)
  }

  const validatedRows = rows.map(r => ({
    row: r,
    errors: validateRow(r, mapping),
    contact: buildContact(r, mapping),
  }))
  const validCount   = validatedRows.filter(r => r.errors.length === 0).length
  const invalidCount = validatedRows.length - validCount
  const companyMapped = Object.values(mapping).includes('company')

  const labelStyle: React.CSSProperties = {
    fontSize: 10, color: t.textMute, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 3
  }

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.65)',
      display:'flex', alignItems:'center', justifyContent:'center', zIndex:1100, padding:16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:t.bgCard,
        border:`1px solid ${t.border2}`, borderRadius:12,
        width: step === 3 ? 900 : 580, maxWidth:'95vw',
        maxHeight:'90vh', display:'flex', flexDirection:'column', animation:'fadeIn .2s ease' }}>

        {/* Header */}
        <div style={{ padding:'16px 20px', borderBottom:`1px solid ${t.border}`,
          display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div>
            <div style={{ fontWeight:600, fontSize:15 }}>⬆ Import kontaktów z XLS</div>
            <div style={{ fontSize:11, color:t.textMute, marginTop:2 }}>
              {step === 1 && 'Krok 1 z 3 — wgraj plik'}
              {step === 2 && `Krok 2 z 3 — przypisz kolumny (${headers.length} kolumn, ${rows.length} wierszy)`}
              {step === 3 && `Krok 3 z 3 — podgląd i import (${validCount} poprawnych, ${invalidCount} z błędami)`}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none',
            color:t.textMute, cursor:'pointer', fontSize:18 }}>✕</button>
        </div>

        {/* Step indicators */}
        <div style={{ padding:'10px 20px', borderBottom:`1px solid ${t.border}`,
          display:'flex', gap:6, flexShrink:0 }}>
          {([1,2,3] as const).map(n => (
            <div key={n} style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:22, height:22, borderRadius:'50%', fontSize:11, fontWeight:700,
                display:'flex', alignItems:'center', justifyContent:'center',
                background: step >= n ? t.accent : t.border2,
                color: step >= n ? t.accentFg : t.textMute }}>{n}</div>
              <span style={{ fontSize:11, color: step >= n ? t.text : t.textMute }}>
                {n===1?'Plik':n===2?'Kolumny':'Podgląd'}
              </span>
              {n < 3 && <div style={{ width:24, height:1, background:t.border2 }}/>}
            </div>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:'auto', padding:'20px' }}>

          {/* STEP 1 */}
          {step === 1 && (
            <div
              onDragOver={e => { e.preventDefault() }}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
              onClick={() => fileRef.current?.click()}
              style={{ border:`2px dashed ${t.border2}`, borderRadius:10, padding:'48px 24px',
                textAlign:'center', cursor:'pointer', transition:'border-color .15s' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = t.accent}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = t.border2}>
              <div style={{ fontSize:36, marginBottom:12 }}>📂</div>
              <div style={{ fontWeight:600, fontSize:14, marginBottom:6 }}>Przeciągnij plik lub kliknij</div>
              <div style={{ fontSize:12, color:t.textMute }}>Obsługiwane formaty: .xlsx, .xls, .csv</div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display:'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}/>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div>
              <div style={{ marginBottom:12, fontSize:12, color:t.textMute }}>
                Przypisz każdą kolumnę z pliku do odpowiedniego pola. Kolumny oznaczone jako <strong>— Pomiń —</strong> zostaną zignorowane.
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {headers.map(h => {
                  const preview = rows.slice(0,2).map(r => r[h]).filter(Boolean).join(', ')
                  const isDuplicate = headers.some(other => other !== h && mapping[other] && mapping[other] === mapping[h] && (mapping[h] as string) !== '')
                  return (
                    <div key={h} style={{ background:t.bgCol, border:`1px solid ${isDuplicate?'#ef4444':t.border2}`,
                      borderRadius:7, padding:'10px 12px' }}>
                      <label style={labelStyle}>{h}</label>
                      {preview && <div style={{ fontSize:10, color:t.textFade, marginBottom:5,
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        np. {preview}</div>}
                      <select value={mapping[h] ?? ''} onChange={e => setMapping(m => ({ ...m, [h]: e.target.value as keyof Contact | '' }))}
                        style={inputStyle}>
                        {IMPORT_FIELDS.map(f => (
                          <option key={f.id} value={f.id}>{f.label}{f.required?' *':''}</option>
                        ))}
                      </select>
                      {isDuplicate && <div style={{ fontSize:10, color:'#ef4444', marginTop:4 }}>
                        ⚠ To pole jest już przypisane do innej kolumny
                      </div>}
                    </div>
                  )
                })}
              </div>
              {!companyMapped && (
                <div style={{ marginTop:12, background:t.toastErr, border:`1px solid ${t.toastErrB}`,
                  borderRadius:7, padding:'8px 12px', fontSize:12, color:t.toastErrB }}>
                  ⚠ Pole <strong>Firma</strong> jest wymagane — przypisz je do jednej z kolumn.
                </div>
              )}
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div>
              {invalidCount > 0 && (
                <div style={{ marginBottom:12, background:t.toastErr, border:`1px solid ${t.toastErrB}`,
                  borderRadius:7, padding:'8px 12px', fontSize:12, color:t.toastErrB }}>
                  ⚠ {invalidCount} {invalidCount === 1 ? 'wiersz ma błędy' : 'wierszy ma błędy'} — zostaną pominięte przy imporcie.
                </div>
              )}
              <div style={{ border:`1px solid ${t.border2}`, borderRadius:8, overflow:'hidden' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                  <thead>
                    <tr style={{ background:t.bgCol, borderBottom:`1px solid ${t.border}` }}>
                      <th style={{ padding:'7px 10px', textAlign:'left', color:t.textMute, fontWeight:600, width:24 }}>#</th>
                      <th style={{ padding:'7px 10px', textAlign:'left', color:t.textMute, fontWeight:600 }}>Firma</th>
                      <th style={{ padding:'7px 10px', textAlign:'left', color:t.textMute, fontWeight:600 }}>Imię</th>
                      <th style={{ padding:'7px 10px', textAlign:'left', color:t.textMute, fontWeight:600 }}>Kategoria</th>
                      <th style={{ padding:'7px 10px', textAlign:'left', color:t.textMute, fontWeight:600 }}>Etap</th>
                      <th style={{ padding:'7px 10px', textAlign:'left', color:t.textMute, fontWeight:600 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validatedRows.map(({ contact: c, errors }, i) => (
                      <tr key={i} style={{ borderBottom:`1px solid ${t.border3}`,
                        background: errors.length ? (t === T.dark ? '#1a0a0a' : '#fff5f5') : 'transparent' }}>
                        <td style={{ padding:'6px 10px', color:t.textFade }}>{i+1}</td>
                        <td style={{ padding:'6px 10px', fontWeight:500 }}>{c.company || <span style={{ color:t.textFade }}>—</span>}</td>
                        <td style={{ padding:'6px 10px', color:t.textMute }}>{c.name || '—'}</td>
                        <td style={{ padding:'6px 10px', color:t.textMute }}>{c.category || '—'}</td>
                        <td style={{ padding:'6px 10px', color:t.textMute }}>
                          {STAGES.find(s => s.id === c.stage)?.label ?? c.stage ?? 'lead'}
                        </td>
                        <td style={{ padding:'6px 10px' }}>
                          {errors.length === 0
                            ? <span style={{ color:'#22c55e', fontWeight:600 }}>✓ OK</span>
                            : <span style={{ color:'#ef4444' }} title={errors.join('\n')}>
                                ✕ {errors[0]}{errors.length > 1 ? ` (+${errors.length-1})` : ''}
                              </span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'14px 20px', borderTop:`1px solid ${t.border}`,
          display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <button onClick={() => step > 1 ? setStep(s => (s - 1) as 1|2|3) : onClose()}
            style={{ background:t.badge, border:`1px solid ${t.border2}`, borderRadius:7,
              padding:'8px 16px', cursor:'pointer', color:t.textSub, fontFamily:'inherit', fontSize:13 }}>
            {step === 1 ? 'Anuluj' : '← Wróć'}
          </button>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {step === 3 && <span style={{ fontSize:12, color:t.textMute }}>{validCount} kontaktów gotowych do importu</span>}
            {step < 3 && (
              <button
                disabled={step === 2 && !companyMapped}
                onClick={() => setStep(s => (s + 1) as 1|2|3)}
                style={{ background: (step === 2 && !companyMapped) ? t.border2 : t.accent,
                  color: (step === 2 && !companyMapped) ? t.textMute : t.accentFg,
                  border:'none', borderRadius:7, padding:'8px 16px',
                  cursor: (step === 2 && !companyMapped) ? 'not-allowed' : 'pointer',
                  fontFamily:'inherit', fontWeight:600, fontSize:13 }}>
                Dalej →
              </button>
            )}
            {step === 3 && (
              <button disabled={validCount === 0 || importing} onClick={async () => {
                setImporting(true)
                await onImport(validatedRows.filter(r => r.errors.length === 0).map(r => r.contact))
              }} style={{ background: validCount === 0 ? t.border2 : t.accent,
                color: validCount === 0 ? t.textMute : t.accentFg,
                border:'none', borderRadius:7, padding:'8px 18px',
                cursor: validCount === 0 ? 'not-allowed' : 'pointer',
                fontFamily:'inherit', fontWeight:600, fontSize:13 }}>
                {importing ? 'Importuję...' : `⬆ Importuj ${validCount} kontaktów`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
