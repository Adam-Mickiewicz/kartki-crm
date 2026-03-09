import { createClient } from '@supabase/supabase-js'

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(url, key)

export type Activity = {
  id: string
  contact_id: string
  type: string
  text: string
  date: string
  created_at: string
}

export type Contact = {
  id: string
  name: string
  company: string
  position: string
  phone: string
  email: string
  network: string
  stage: string
  notes: string
  owner: string
  created_at: string
  updated_at: string
  activities?: Activity[]
}

export async function fetchContacts(): Promise<Contact[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select('*, activities(*)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(c => ({
    ...c,
    activities: (c.activities ?? []).sort(
      (a: Activity, b: Activity) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }))
}

export async function upsertContact(contact: Partial<Contact>): Promise<Contact> {
  const { activities, ...rest } = contact as any
  const { data, error } = await supabase
    .from('contacts')
    .upsert(rest)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteContact(id: string): Promise<void> {
  const { error } = await supabase.from('contacts').delete().eq('id', id)
  if (error) throw error
}

export async function addActivity(
  contactId: string,
  act: { type: string; text: string; date: string }
): Promise<Activity> {
  const { data, error } = await supabase
    .from('activities')
    .insert({ contact_id: contactId, ...act })
    .select()
    .single()
  if (error) throw error
  return data
}
