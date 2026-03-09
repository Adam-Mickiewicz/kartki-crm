'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  fetchContacts, upsertContact, deleteContact, addActivity,
  type Contact, type Activity
} from '@/lib/supabase'

const STAGES = [
  { id: 'lead',         label: 'Nowy lead',       color: '#64748b' },
  { id: 'contact',      label: 'Pierwszy kontakt', color: '#60a5fa' },
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

const ini = (n: string) =>
  n.split(' ').map(p => p[0] || '').join('').slice(0, 2).toUpperCase()

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('pl-PL', { day: '2-digit', month: 'short', year: 'numeric' })

const T = {
  dark: {
    bg:'#0b0e16',bgCard:'#111827',bgCol:'#0e1220',bgInput:'#111827',bgPanel:'#0a0d14',
    bgHover:'#141825',border:'#131929',border2:'#1e2535',border3:'#0f1520',
    text:'#e2e8f0',textSub:'#94a3b8',textMute:'#475569',textFade:'#2d3748',
    accent:'#f59e0b',accentFg:'#000',badge:'#111827',scrollBg:'#0b0e16',scrollTh:'#1e2535',
    selCard:'#1a2035',selBorder:'#f59e0b44',toastOk:'#14532d',toastErr:'#7f1d1d',
    toastInfo:'#1e3a5f',toastOkB:'#22c55e',toastErrB:'#ef4444',toastInfoB:'#60a5fa',
    delBg:'#1a0f0f',delBorder:'#3b1515',delColor:'#ef4444',timelineLine:'#1e2535',notesBg:'#0e1220',
  },
  light: {
    bg:'#f1f5f9',bgCard:'#ffffff',bgCol:'#f8fafc',bgInput:'#ffffff',bgPanel:'#f8fafc',
    bgHover:'#f1f5f9',border:'#e2e8f0',border2:'#cbd5e1',border3:'#e8edf4',
    text:'#0f172a',textSub:'#334155',textMute:'#64748b',textFade:'#94a3b8',
    accent:'#f59e0b',accentFg:'#000',badge:'#f1f5f9',scrollBg:'#f1f5f9',scrollTh:'#cbd5e1',
    selCard:'#fffbeb',selBorder:'#f59e0b88',toastOk:'#dcfce7',toastErr:'#fee2e2',
    toastInfo:'#dbeafe',toastOkB:'#22c55e',toastErrB:'#ef4444',toastInfoB:'#60a5fa',
    delBg:'#fff1f2',delBorder:'#fecdd3',delColor:'#ef4444',timelineLine:'#e2e8f0',notesBg:'#f1f5f9',
  }
} as const

type Theme = typeof T.dark | typeof T.light

export default function CRM() {
  const [contacts, setContacts]   = useState<Contact[]>([])
  const [loading, setLoading]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [view, setView]           = useState<'pipeline'|'list'>('pipeline')
  const [selected, setSelected]   = useState<string|null>(null)
  const [editContact, setEditContact] = useState<Partial<Contact>|null>(null)
  const [toast, setToast]         = useState<{msg:string,type:string}|null>(null)
  const [search, setSearch]       = useState('')
  const [fOwner, setFOwner]       = useState('')
  const [dragId, setDragId]       = useState<string|null>(null)
  const [dragOver, setDragOver]   = useState<string|null>(null)
  const [confirmDel, setConfirmDel] = useState<Contact|null>(null)
  const [dark, setDark]           = useState(false)
  const t: Theme = dark ? T.dark : T.light
  const toastRef = useRef<ReturnType<typeof setTimeout>>(null)

  const load = useCallback(async () => {
    try { setContacts(await fetchContacts()) }
    catch { showToast('Błąd ładowania danych','err') }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const showToast = (msg: string, type = 'ok') => {
    setToast({ msg, type })
    clearTimeout(toastRef.current)
    toastRef.current = setTimeout(() => setToast(null), 3000)
  }

  const moveToStage = async (id: string, stageId: string) => {
    setSaving(true)
    try {
      await upsertContact({ id, stage: stageId })
      setContacts(cs => cs.map(c => c.id === id ? { ...c, stage: stageId } : c))
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
      showToast('Dodano aktywność ✓'); await load()
    } catch { showToast('Błąd zapisu','err') }
    setSaving(false)
  }

  const handleOwnerChange = async (id: string, owner: string) => {
    setSaving(true)
    try {
      await upsertContact({ id, owner })
      setContacts(cs => cs.map(c => c.id === id ? { ...c, owner } : c))
    } catch { showToast('Błąd zapisu','err') }
    setSaving(false)
  }

  const handleSaveContact = async (data: Partial<Contact>) => {
    setSaving(true)
    try {
      const saved = await upsertContact(data)
      if (data.id) {
        setContacts(cs => cs.map(c => c.id === data.id ? { ...c, ...saved } : c))
        showToast('Zapisano ✓'); await load()
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
  })

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
              {(['pipeline','list'] as const).map(v => (
                <button key={v} onClick={() => setView(v)}
                  style={{ padding:'6px 14px', background:view===v?t.border2:'transparent',
                    border:'none', color:view===v?t.text:t.textMute, cursor:'pointer',
                    fontSize:12, fontFamily:'inherit', fontWeight:view===v?500:400 }}>
                  {v === 'pipeline' ? '⬛ Pipeline' : '☰ Lista'}
                </button>
              ))}
            </div>
            <button onClick={() => setDark(d => !d)}
              style={{ width:36, height:36, borderRadius:8, border:`1px solid ${t.border2}`,
                background:t.badge, cursor:'pointer', fontSize:16,
                display:'flex', alignItems:'center', justifyContent:'center' }}>
              {dark ? '☀️' : '🌙'}
            </button>
            <button onClick={() => setEditContact({ stage:'lead', owner:'', activities:[] })}
              style={{ background:t.accent, color:t.accentFg, border:'none', borderRadius:7,
                padding:'7px 14px', fontFamily:'inherit', fontWeight:600, fontSize:13, cursor:'pointer' }}>
              + Nowy kontakt
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding:'10px 20px', borderBottom:`1px solid ${t.border}`, flexShrink:0,
        display:'flex', alignItems:'center', gap:12, flexWrap:'wrap',
        background:t.bgCard, transition:'background .25s' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍  Szukaj kontaktu lub firmy..."
          style={{ maxWidth:300, background:t.bgInput, border:`1px solid ${t.border2}`,
            color:t.text, borderRadius:7, padding:'7px 11px', fontSize:13, outline:'none', fontFamily:'inherit' }}/>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ fontSize:11, color:t.textMute, fontWeight:600, textTransform:'uppercase', letterSpacing:'.04em' }}>Właściciel:</span>
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

      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
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
                    maxHeight:'calc(100vh - 130px)', transition:'all .15s' }}>
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
                      return (
                        <div key={c.id} draggable
                          onDragStart={() => setDragId(c.id)}
                          onDragEnd={() => setDragId(null)}
                          onClick={() => setSelected(c.id)}
                          style={{ background:isSel?t.selCard:t.bgCard,
                            border:`1px solid ${isSel?t.selBorder:t.border2}`,
                            borderRadius:8, padding:'10px', cursor:'pointer',
                            transition:'all .12s', animation:'fadeIn .2s ease',
                            boxShadow:isSel?`0 0 0 2px ${t.accent}22`:'none' }}>
                          <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                            <div style={{ width:26, height:26, borderRadius:'50%', background:t.bg,
                              border:`1px solid ${stage.color}55`, display:'flex', alignItems:'center',
                              justifyContent:'center', fontSize:9, fontWeight:600, color:stage.color, flexShrink:0 }}>
                              {ini(c.company)}
                            </div>
                            <div style={{ minWidth:0 }}>
                              <div style={{ fontWeight:600, fontSize:12, whiteSpace:'nowrap',
                                overflow:'hidden', textOverflow:'ellipsis' }}>{c.company}</div>
                              <div style={{ fontSize:10, color:t.textMute, marginTop:1,
                                whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.position}</div>
                            </div>
                          </div>
                          {c.activities?.[0] && (
                            <div style={{ marginTop:7, borderTop:`1px solid ${t.border}`, paddingTop:6,
                              display:'flex', alignItems:'center', gap:4 }}>
                              <span style={{ fontSize:10 }}>{ACTIVITY_TYPES.find(a => a.id === c.activities![0].type)?.icon}</span>
                              <span style={{ fontSize:10, color:t.textMute, overflow:'hidden',
                                textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.activities[0].text}</span>
                            </div>
                          )}
                          {c.email && <div style={{ marginTop:5, fontSize:10, color:'#3b82f6',
                            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>✉ {c.email}</div>}
                          {c.owner && (() => { const o = OWNERS.find(x => x.id === c.owner); return o
                            ? <div style={{ marginTop:5, display:'inline-block', background:o.color+'22',
                                color:o.color, border:'1px solid '+o.color+'44', borderRadius:4,
                                padding:'1px 6px', fontSize:10, fontWeight:600 }}>{o.label}</div>
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

        {view === 'list' && (
          <div style={{ flex:1, overflowY:'auto', padding:'16px 20px' }}>
            <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:10, overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ borderBottom:`1px solid ${t.border}`, background:t.bgCol }}>
                    {['Firma','Kontakt','Właściciel','Etap','E-mail','Ostatnia aktywność',''].map(h => (
                      <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:10,
                        fontWeight:600, color:t.textMute, textTransform:'uppercase', letterSpacing:'.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c, i) => {
                    const stage = STAGES.find(s => s.id === c.stage)
                    const lastAct = c.activities?.[0]
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
                              border:`1px solid ${stage?.color}44`, display:'flex', alignItems:'center',
                              justifyContent:'center', fontSize:10, fontWeight:600, color:stage?.color||t.textSub, flexShrink:0 }}>
                              {ini(c.company)}
                            </div>
                            <span style={{ fontWeight:500, fontSize:13 }}>{c.company}</span>
                          </div>
                        </td>
                        <td style={{ padding:'10px 14px', fontSize:12, color:t.textSub }}>{c.position}</td>
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
                        <td style={{ padding:'10px 14px', fontSize:12, color:'#3b82f6' }}>{c.email||'—'}</td>
                        <td style={{ padding:'10px 14px', fontSize:11, color:t.textMute }}>
                          {lastAct ? <span>{ACTIVITY_TYPES.find(a => a.id === lastAct.type)?.icon} {fmtDate(lastAct.created_at)}</span> : '—'}
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

        {selContact && (
          <DetailPanel
            contact={selContact} t={t}
            onClose={() => setSelected(null)}
            onStageChange={sid => moveToStage(selContact.id, sid)}
            onOwnerChange={oid => handleOwnerChange(selContact.id, oid)}
            onAddActivity={act => handleAddActivity(selContact.id, act)}
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
    </div>
  )
}

function Pill({ active, color, borderActive, onClick, t, children }: {
  active:boolean; color:string; borderActive:string;
  onClick:()=>void; t:Theme; children:React.ReactNode
}) {
  return (
    <button onClick={onClick} style={{ padding:'5px 12px', borderRadius:6,
      border:`1px solid ${active?borderActive+'88':t.border2}`,
      background:active?color+'22':t.badge, color:active?color:t.textMute,
      cursor:'pointer', fontSize:12, fontFamily:'inherit', fontWeight:active?600:400,
      display:'flex', alignItems:'center', gap:5, transition:'all .15s' }}>
      {children}
    </button>
  )
}

function DetailPanel({ contact, t, onClose, onStageChange, onOwnerChange, onAddActivity, onEdit, onDelete }: {
  contact:Contact; t:Theme; onClose:()=>void;
  onStageChange:(s:string)=>void; onOwnerChange:(o:string)=>void;
  onAddActivity:(a:{type:string;text:string;date:string})=>void;
  onEdit:()=>void; onDelete:()=>void;
}) {
  const [actType, setActType] = useState('note')
  const [actText, setActText] = useState('')
  const [actDate, setActDate] = useState(new Date().toISOString().split('T')[0])
  const stage = STAGES.find(s => s.id === contact.stage)

  return (
    <div style={{ width:360, flexShrink:0, borderLeft:`1px solid ${t.border}`,
      display:'flex', flexDirection:'column', background:t.bgPanel,
      animation:'slideRight .2s ease', overflow:'hidden', transition:'background .25s' }}>
      <div style={{ padding:'14px 16px', borderBottom:`1px solid ${t.border}`, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            <div style={{ width:38, height:38, borderRadius:'50%', background:t.bg,
              border:`2px solid ${stage?.color}`, display:'flex', alignItems:'center',
              justifyContent:'center', fontSize:13, fontWeight:700, color:stage?.color, flexShrink:0 }}>
              {ini(contact.company)}
            </div>
            <div>
              <div style={{ fontWeight:600, fontSize:15 }}>{contact.company}</div>
              <div style={{ fontSize:11, color:t.textMute }}>{contact.name}</div>
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
        <div style={{ marginTop:12 }}>
          <div style={{ fontSize:10, color:t.textMute, marginBottom:6,
            textTransform:'uppercase', letterSpacing:'.05em', fontWeight:600 }}>Etap procesu</div>
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
          placeholder="Co się wydarzyło? Wpisz notatkę..." rows={2}
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
                  <span style={{ fontSize:10, color:t.textMute }}>{fmtDate(act.date || act.created_at)}</span>
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
  const set = (k: keyof Contact, v: string) => setForm(p => ({ ...p, [k]: v }))
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
        width:480, maxHeight:'90vh', overflowY:'auto', animation:'fadeIn .2s ease' }}>
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